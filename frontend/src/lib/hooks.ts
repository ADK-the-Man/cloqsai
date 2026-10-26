'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAuthenticated, getToken, setToken, removeToken } from './auth'
import {
  getProjects,
  getProject,
  getConversation,
  submitAnswer,
  getScenarios,
  getEstimate,
  getProviderStatus,
  getArchitecture,
  getArtifacts,
  getProjectEstimates,
  type Conversation,
  type EstimateJob,
} from './api'

// ─── useAuth ──────────────────────────────────────────────────────────────────
export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    setAuthenticated(isAuthenticated())
  }, [])

  const login = useCallback((token: string) => {
    setToken(token)
    setAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    removeToken()
    setAuthenticated(false)
    window.location.href = '/login'
  }, [])

  return { authenticated, login, logout, getToken }
}

// ─── useProjects ──────────────────────────────────────────────────────────────
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
    staleTime: 30000,
  })
}

// ─── useProject ───────────────────────────────────────────────────────────────
export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
    enabled: !!id,
    staleTime: 10000,
  })
}

// ─── useProviderStatus ────────────────────────────────────────────────────────
export function useProviderStatus() {
  return useQuery({
    queryKey: ['provider-status'],
    queryFn: getProviderStatus,
    staleTime: 60000,
    refetchInterval: 120000,
  })
}

// ─── useConversation ─────────────────────────────────────────────────────────
export function useConversation(projectId: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['conversation', projectId],
    queryFn: () => getConversation(projectId),
    enabled: !!projectId,
    staleTime: 5000,
  })

  const answerMutation = useMutation({
    mutationFn: (payload: {
      question_id: string
      answer: string
      skipped?: boolean
    }) => submitAnswer(projectId, payload),
    onSuccess: (data: Conversation) => {
      queryClient.setQueryData(['conversation', projectId], data)
    },
  })

  return { ...query, answerMutation }
}

// ─── useArchitecture ─────────────────────────────────────────────────────────
export function useArchitecture(projectId: string) {
  return useQuery({
    queryKey: ['architecture', projectId],
    queryFn: () => getArchitecture(projectId),
    enabled: !!projectId,
    staleTime: 60000,
  })
}

// ─── useScenarios ─────────────────────────────────────────────────────────────
export function useScenarios(projectId: string) {
  return useQuery({
    queryKey: ['scenarios', projectId],
    queryFn: () => getScenarios(projectId),
    enabled: !!projectId,
    staleTime: 60000,
  })
}

// ─── useProjectEstimates ──────────────────────────────────────────────────────
export function useProjectEstimates(projectId: string) {
  const query = useQuery({
    queryKey: ['project-estimates', projectId],
    queryFn: () => getProjectEstimates(projectId),
    enabled: !!projectId,
    staleTime: 10000,
  })

  return query
}

// ─── useEstimate ──────────────────────────────────────────────────────────────
export function useEstimate(jobId: string) {
  const isComplete = (job: EstimateJob) =>
    job.status === 'completed' || job.status === 'failed'

  return useQuery({
    queryKey: ['estimate', jobId],
    queryFn: () => getEstimate(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && isComplete(data)) return false
      return 3000
    },
  })
}

// ─── useArtifacts ─────────────────────────────────────────────────────────────
export function useArtifacts(jobId: string) {
  return useQuery({
    queryKey: ['artifacts', jobId],
    queryFn: () => getArtifacts(jobId),
    enabled: !!jobId,
    staleTime: 30000,
  })
}

// ─── useJobStatus (WebSocket) ─────────────────────────────────────────────────
export interface JobStatusUpdate {
  job_id: string
  status: string
  steps: Array<{
    name: string
    status: string
    message?: string
  }>
  error_message?: string
}

export function useJobStatus(jobId: string | null) {
  const [status, setStatus] = useState<JobStatusUpdate | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!jobId) return

    const defaultWsHost = typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
      : 'ws://localhost:8001'
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_API_URL.replace('http://', 'ws://').replace('https://', 'wss://')
      : defaultWsHost

    const token = getToken()
    const ws = new WebSocket(`${wsUrl}/ws/jobs/${jobId}?token=${token ?? ''}`)

    ws.onopen = () => {
      setConnected(true)
      setError(null)
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as JobStatusUpdate
        setStatus(data)
      } catch {
        // Ignore parse errors
      }
    }

    ws.onerror = () => {
      setError('WebSocket connection error')
    }

    ws.onclose = () => {
      setConnected(false)
      // Reconnect after 3s if job not complete
      if (
        status?.status !== 'completed' &&
        status?.status !== 'failed'
      ) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }
    }

    wsRef.current = ws
  }, [jobId, status?.status])

  useEffect(() => {
    if (!jobId) return
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [jobId, connect])

  return { status, connected, error }
}
