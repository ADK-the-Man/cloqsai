'use client'

import React, { useState, useEffect } from 'react'
import { Edit3, Sparkles, Check, X, RefreshCw, Terminal, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { getToken } from '@/lib/auth'

interface PromptEditorCardProps {
  projectId: string
  initialPrompt?: string
  onRerun?: () => Promise<void> | void
  className?: string
}

export function PromptEditorCard({
  projectId,
  initialPrompt: propPrompt,
  onRerun,
  className = '',
}: PromptEditorCardProps) {
  const [prompt, setPrompt] = useState<string>(propPrompt || '')
  const [editedPrompt, setEditedPrompt] = useState<string>(propPrompt || '')
  const [isEditing, setIsEditing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isRerunning, setIsRerunning] = useState(false)
  const [loading, setLoading] = useState(!propPrompt)

  // Fetch initial prompt from requirements if not provided
  useEffect(() => {
    if (propPrompt) {
      setPrompt(propPrompt)
      setEditedPrompt(propPrompt)
      setLoading(false)
      return
    }

    const fetchPrompt = async () => {
      try {
        const token = getToken()
        const res = await fetch(`/api/v1/projects/${projectId}/requirements`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const raw = data.raw_text || ''
          setPrompt(raw)
          setEditedPrompt(raw)
        }
      } catch (err) {
        console.error('Failed to load initial prompt', err)
      } finally {
        setLoading(false)
      }
    }

    if (projectId) fetchPrompt()
  }, [projectId, propPrompt])

  const handleSaveAndRerun = async () => {
    if (!editedPrompt.trim()) {
      toast.error('Prompt cannot be empty.')
      return
    }

    setIsRerunning(true)
    const toastId = toast.loading('Re-running analysis pipelines with updated prompt...')

    try {
      const token = getToken()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      // 1. Re-extract requirements with full updated prompt
      const extRes = await fetch(`/api/v1/projects/${projectId}/requirements/extract`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw_text: editedPrompt.trim() }),
      })

      if (!extRes.ok) {
        const errJson = await extRes.json().catch(() => ({}))
        const msg = (typeof errJson.detail === 'string' && errJson.detail) || 'Failed to update requirements'
        throw new Error(msg)
      }

      // 2. Re-generate architecture graph
      await fetch(`/api/v1/projects/${projectId}/architecture/generate`, {
        method: 'POST',
        headers,
      })

      // 3. Re-generate comparison scenarios
      await fetch(`/api/v1/projects/${projectId}/scenarios/generate`, {
        method: 'POST',
        headers,
      })

      setPrompt(editedPrompt.trim())
      setIsEditing(false)

      // 4. Trigger onRerun callback or notify
      if (onRerun) {
        await onRerun()
      }

      toast.success('Architecture graph & sizing re-analyzed with updated prompt!', { id: toastId })
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error re-running pipeline. Please retry.', { id: toastId })
    } finally {
      setIsRerunning(false)
    }
  }

  const handleCancel = () => {
    setEditedPrompt(prompt)
    setIsEditing(false)
  }

  if (loading) {
    return (
      <div className={`p-3 bg-white rounded-xl border border-slate-200 animate-pulse ${className}`}>
        <div className="h-4 bg-slate-100 rounded w-1/3 mb-2" />
        <div className="h-3 bg-slate-50 rounded w-2/3" />
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-blue-100 bg-linear-to-r from-blue-50/60 via-slate-50 to-white shadow-2xs overflow-hidden ${className}`}>
      {/* Header bar */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-blue-100/60 bg-blue-50/40">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-blue-600 text-white shadow-2xs">
            <Terminal className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold text-slate-800">Initial Workload Prompt</span>
          <Badge variant="outline" className="text-[10px] bg-white text-blue-700 border-blue-200 py-0">
            Source Spec
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {!isEditing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditing(true)
                setIsExpanded(true)
              }}
              className="h-7 text-[11px] gap-1 bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-2xs"
            >
              <Edit3 className="h-3 w-3 text-blue-600" />
              <span>Edit Prompt</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Expandable Content Area */}
      {isExpanded && (
        <div className="p-3.5">
          {isEditing ? (
            <div className="space-y-3">
              <Textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={4}
                placeholder="Describe your workload, tech stack, traffic, database, cache, or object storage requirements..."
                className="text-xs leading-relaxed font-mono bg-white border-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-400"
                disabled={isRerunning}
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">
                  Editing will recalculate architecture sizing, services & estimates.
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isRerunning}
                    className="h-7 text-xs text-slate-600 hover:text-slate-800 gap-1"
                  >
                    <X className="h-3 w-3" />
                    Cancel
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveAndRerun}
                    disabled={isRerunning || !editedPrompt.trim()}
                    className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs font-semibold"
                  >
                    {isRerunning ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Re-running...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" />
                        Save & Re-run Pipeline
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-700 leading-relaxed font-sans bg-white/80 p-2.5 rounded-md border border-slate-200/70 select-text whitespace-pre-wrap">
              {prompt || (
                <span className="italic text-slate-400">
                  No initial natural language prompt recorded. Click Edit Prompt to add one.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
