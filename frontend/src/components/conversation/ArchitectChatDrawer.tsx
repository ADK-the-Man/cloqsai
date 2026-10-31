'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Sparkles, X, Minimize2, Maximize2, Zap, RefreshCw, Flame, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { getToken } from '@/lib/auth'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  suggested_prompt_update?: string | null
  suggested_actions?: string[]
  projected_cost_delta?: number | null
  timestamp?: string
}

interface ArchitectChatDrawerProps {
  projectId: string
  onApplyPromptUpdate?: (newPrompt: string) => Promise<void>
}

export function ArchitectChatDrawer({
  projectId,
  onApplyPromptUpdate,
}: ArchitectChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [inputMsg, setInputMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [applyingPrompt, setApplyingPrompt] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm your **AI Principal Cloud Solutions Architect**. I'm actively analyzing your workload specification, architecture graph, and pricing tiers.\n\nAsk me anything about trade-offs, how to lower costs without sacrificing SLAs, or tell me what to modify!",
      suggested_actions: [
        'How can we cut $200/mo?',
        'Switch compute to Graviton',
        'Roast my architecture',
        'Explain EKS vs ECS Fargate',
      ],
    },
  ])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
    }
  }, [messages, isOpen])

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMsg).trim()
    if (!text || loading) return

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: text, timestamp: new Date().toISOString() },
    ]
    setMessages(newMessages)
    setInputMsg('')
    setLoading(true)

    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${projectId}/conversation/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          history: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply,
            suggested_prompt_update: data.suggested_prompt_update,
            suggested_actions: data.suggested_actions || [],
            projected_cost_delta: data.projected_cost_delta,
            timestamp: new Date().toISOString(),
          },
        ])
      } else {
        toast.error('Failed to get architect response.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Network error contacting architect.')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyUpdate = async (promptUpdate: string) => {
    if (!onApplyPromptUpdate) {
      toast.info('Prompt update received. Open the Prompt Editor above to paste and recalculate.')
      return
    }

    setApplyingPrompt(true)
    const toastId = toast.loading('Applying changes to architecture and re-running sizing pipeline...')
    try {
      await onApplyPromptUpdate(promptUpdate)
      toast.success('Architecture updated and pipeline recalculated!', { id: toastId })
    } catch (err: any) {
      console.error(err)
      toast.error('Failed to apply prompt update.', { id: toastId })
    } finally {
      setApplyingPrompt(false)
    }
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-5 right-5 z-50">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-linear-to-r from-purple-600 to-indigo-600 text-white font-semibold text-xs shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-purple-400/40"
        >
          <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
          <span>Chat with AI Architect</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`fixed right-4 bottom-4 z-50 w-[92vw] sm:w-[450px] bg-white rounded-2xl shadow-2xl border border-purple-200 flex flex-col overflow-hidden transition-all duration-200 ${
        isMinimized ? 'h-[56px]' : 'h-[620px] max-h-[88vh]'
      }`}
    >
      {/* Header */}
      <div className="p-3 bg-linear-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-600 text-white shadow-2xs">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold">Principal Cloud Architect</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
            <p className="text-[10px] text-purple-200/80">Pair-architecting & Live Optimization</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(!isMinimized)}
            className="h-6 w-6 p-0 text-slate-300 hover:text-white hover:bg-white/10"
          >
            {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="h-6 w-6 p-0 text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Chat Stream */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-slate-50/50 text-xs">
            {messages.map((m, idx) => {
              const isUser = m.role === 'user'

              return (
                <div
                  key={idx}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}
                >
                  <div
                    className={`p-3 rounded-xl max-w-[88%] text-xs leading-relaxed whitespace-pre-wrap select-text shadow-2xs ${
                      isUser
                        ? 'bg-purple-600 text-white rounded-br-xs font-medium'
                        : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs font-normal'
                    }`}
                  >
                    {m.content}
                  </div>

                  {/* Proposed Architecture Mutation Card */}
                  {m.suggested_prompt_update && (
                    <div className="w-[92%] p-3 rounded-xl bg-purple-50/80 border border-purple-200 space-y-2 mt-1 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-purple-900 tracking-wider flex items-center gap-1">
                          <Zap className="h-3 w-3 text-amber-500" />
                          <span>Proposed Architecture Mutation</span>
                        </span>
                        {m.projected_cost_delta !== undefined && m.projected_cost_delta !== null && (
                          <Badge
                            className={`text-[9px] font-bold ${
                              m.projected_cost_delta < 0
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-700 text-white'
                            }`}
                          >
                            {m.projected_cost_delta < 0 ? '-' : '+'}
                            ${Math.abs(m.projected_cost_delta).toFixed(2)}/mo
                          </Badge>
                        )}
                      </div>

                      <p className="text-[10px] text-slate-600 bg-white/80 p-2 rounded border border-purple-100 font-mono line-clamp-3">
                        {m.suggested_prompt_update}
                      </p>

                      <Button
                        size="sm"
                        onClick={() => handleApplyUpdate(m.suggested_prompt_update!)}
                        disabled={applyingPrompt}
                        className="w-full h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold gap-1.5 shadow-xs cursor-pointer"
                      >
                        {applyingPrompt ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            <span>Updating Architecture...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="h-3 w-3 text-amber-300" />
                            <span>Apply Changes to Architecture</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Quick Action Suggestion Chips */}
                  {m.suggested_actions && m.suggested_actions.length > 0 && !isUser && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {m.suggested_actions.map((act, aIdx) => (
                        <button
                          key={aIdx}
                          type="button"
                          onClick={() => handleSendMessage(act)}
                          disabled={loading}
                          className="px-2 py-0.5 rounded-full bg-white hover:bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-medium transition-colors cursor-pointer shadow-3xs"
                        >
                          {act}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {loading && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-slate-200 w-fit text-slate-500 text-xs">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-600" />
                <span>Principal Architect is analyzing trade-offs...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 border-t border-slate-200 bg-white space-y-2">
            <div className="flex items-center gap-2">
              <Textarea
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                rows={1}
                placeholder="Ask architect or say e.g. 'Switch compute to Graviton'..."
                className="text-xs resize-none min-h-[38px] max-h-[80px] bg-slate-50 border-slate-200 focus:bg-white focus:border-purple-500"
                disabled={loading}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => handleSendMessage()}
                disabled={loading || !inputMsg.trim()}
                className="h-[38px] px-3 bg-purple-600 hover:bg-purple-700 text-white shrink-0 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="text-[10px] text-slate-400 text-center">
              Understands EKS, RDS, S3, Secrets & monthly budgets in real-time.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
