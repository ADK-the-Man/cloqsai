'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Waypoints,
  Network,
  RefreshCw,
  Sparkles,
  GitBranch,
  Shield,
  Layers,
  Activity,
  ArrowRight,
  Database,
  Lock,
  ExternalLink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { getToken } from '@/lib/auth'
import { ApiGraphCanvas } from '@/components/api-graph/ApiGraphCanvas'

export default function ApiTopologyPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [topologyData, setTopologyData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [projectName, setProjectName] = useState('Cloud Project')

  const fetchTopology = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const token = getToken()
      // Fetch project info
      const projRes = await fetch(`/api/v1/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (projRes.ok) {
        const projData = await projRes.json()
        setProjectName(projData.name)
      }

      // Fetch API topology
      const res = await fetch(`/api/v1/projects/${id}/api-topology`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        throw new Error('Could not load API topology')
      }
      const data = await res.json()
      setTopologyData(data)
      if (isRefresh) {
        toast.success('API topology regenerated')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to load API topology')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (id) {
      fetchTopology()
    }
  }, [id])

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
              <Waypoints className="h-3 w-3" />
              API Topology & Dependency Graph
            </span>
            {topologyData?.repo_name && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                <GitBranch className="h-3 w-3 text-slate-500" />
                {topologyData.repo_name}
              </span>
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
            {projectName} API Route Architecture
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            End-to-end dependency flow connecting Edge Ingress &rarr; Microservice Controllers &rarr; HTTP Endpoints &rarr; Downstream Databases & Caches.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTopology(true)}
            disabled={refreshing}
            className="text-xs gap-1.5 h-8 text-slate-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Link href={`/projects/${id}/architecture`}>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 h-8 border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50"
            >
              <Network className="h-3.5 w-3.5" />
              View Cloud Infra
            </Button>
          </Link>

          <Link href={`/projects/${id}/scenarios`}>
            <Button
              size="sm"
              className="text-xs gap-1.5 h-8 bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
            >
              Cost Scenarios
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Summary Strip */}
      {topologyData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Endpoints</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{topologyData.endpoints_count}</span>
              <span className="text-xs text-slate-400">active routes</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Controllers</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-600">{topologyData.controllers_count}</span>
              <span className="text-xs text-slate-400">subsystems</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">HTTP Verbs</span>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {Object.entries(topologyData.methods_breakdown || {}).map(([verb, count]) => (
                <span
                  key={verb}
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                >
                  <span>{verb}:</span>
                  <span className="text-indigo-600 font-mono">{count as number}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Downstream Data</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600">4</span>
              <span className="text-xs text-slate-400">connected stores</span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Flow Canvas */}
      {loading ? (
        <div className="h-[calc(100vh-14rem)] w-full rounded-xl border border-slate-200 bg-white p-6 flex flex-col items-center justify-center space-y-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 text-center">
            <Skeleton className="h-4 w-48 mx-auto" />
            <Skeleton className="h-3 w-64 mx-auto" />
          </div>
          <p className="text-xs text-slate-400 animate-pulse">Extracting route manifest and computing topology DAG...</p>
        </div>
      ) : topologyData ? (
        <ApiGraphCanvas
          initialNodes={topologyData.nodes}
          initialEdges={topologyData.edges}
          endpoints={topologyData.endpoints}
          projectName={projectName}
          methodsBreakdown={topologyData.methods_breakdown || {}}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm text-slate-500">No API topology available for this project.</p>
          <Button onClick={() => fetchTopology(true)} className="mt-3" size="sm">
            Generate Topology
          </Button>
        </div>
      )}
    </div>
  )
}
