'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Sparkles, X, Minimize2, Maximize2, Zap, RefreshCw, Flame, Check, ArrowRight, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { getToken } from '@/lib/auth'
import { MarkdownChatRenderer } from './MarkdownChatRenderer'

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
          history: messages.map((m) => ({ role: m.role, content: m.content })),
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
          className="group flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full bg-gradient-to-r from-purple-700 via-indigo-700 to-slate-900 text-white font-semibold text-xs shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-purple-400/50"
        >
          <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-amber-300 group-hover:rotate-12 transition-transform">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold leading-tight">AI Cloud Architect</span>
            <span className="text-[10px] text-purple-200 flex items-center gap-1 leading-tight">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online & Sizing
            </span>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`fixed right-4 bottom-4 z-50 w-[92vw] sm:w-[480px] bg-white rounded-2xl shadow-2xl border border-purple-200 flex flex-col overflow-hidden transition-all duration-200 ${
        isMinimized ? 'h-[56px]' : 'h-[640px] max-h-[88vh]'
      }`}
    >
      {/* Header */}
      <div className="p-3 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 select-none border-b border-purple-800/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-600 text-white shadow-sm">
            <Bot className="h-4 w-4 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Principal Cloud Solutions Architect</span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
            <p className="text-[10px] text-purple-300 font-medium">FinOps Trade-offs & Live Architecture Mutation</p>
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
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4 bg-slate-50/50 text-xs">
            {messages.map((m, idx) => {
              const isUser = m.role === 'user'

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Message Avatar Icon */}
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                      isUser
                        ? 'bg-purple-600 text-white'
                        : 'bg-gradient-to-br from-indigo-900 to-purple-950 text-amber-300 border border-purple-400/40'
                    }`}
                  >
                    {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-4 w-4" />}
                  </div>

                  <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] space-y-1.5`}>
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-purple-600 text-white rounded-tr-xs font-medium whitespace-pre-wrap'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs'
                      }`}
                    >
                      {isUser ? (
                        m.content
                      ) : (
                        <MarkdownChatRenderer content={m.content} />
                      )}
                    </div>

                    {/* Proposed Architecture Mutation Card */}
                    {m.suggested_prompt_update && (
                      <div className="w-full p-3 rounded-xl bg-purple-50/90 border border-purple-200 space-y-2 mt-1 shadow-sm">
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

                        <p className="text-[10px] text-slate-600 bg-white/90 p-2 rounded border border-purple-100 font-mono line-clamp-3">
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
                            onClick={() => {
                              if (act.toLowerCase().includes('apply') && m.suggested_prompt_update) {
                                handleApplyUpdate(m.suggested_prompt_update)
                              } else {
                                handleSendMessage(act)
                              }
                            }}
                            disabled={loading}
                            className="px-2.5 py-1 rounded-full bg-white hover:bg-purple-50 border border-purple-200 hover:border-purple-300 text-purple-700 text-[10px] font-semibold transition-all cursor-pointer shadow-xs"
                          >
                            {act}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
