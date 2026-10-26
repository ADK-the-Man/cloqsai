'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, ArrowRight, CheckCircle2, MessageSquare, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RequirementsSummary } from '@/components/conversation/RequirementsSummary'
import { ChatMessage } from '@/components/conversation/ChatMessage'
import { QuestionCard } from '@/components/conversation/QuestionCard'
import { PromptEditorCard } from '@/components/conversation/PromptEditorCard'
import { getToken } from '@/lib/auth'

export default function DiscoverPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [conversation, setConversation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [answering, setAnswering] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchConversation = async () => {
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setConversation(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchConversation()
  }, [id])

  useEffect(() => {
    scrollToBottom()
  }, [conversation?.messages])

  const handleAnswer = async (answer: string, isSkipped: boolean = false) => {
    if (!conversation?.next_questions?.length) return
    const currentQ = conversation.next_questions[0]
    setAnswering(true)
    toast.loading('Analyzing requirement & recalibrating capacity...', { id: 'answer-toast' })

    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/conversation/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question_id: currentQ.id,
          answer,
          is_skipped: isSkipped,
        }),
      })

      if (res.ok) {
        const updated = await res.json()
        setConversation(updated)
        if (updated.is_complete) {
          toast.success('All critical requirements validated! Ready to inspect architecture.', { id: 'answer-toast' })
        } else {
          toast.success(isSkipped ? 'Question skipped. Proceeding to next requirement.' : 'Requirement recorded! Architecture model updated.', { id: 'answer-toast' })
        }
      } else {
        toast.error('Failed to submit response. Please retry.', { id: 'answer-toast' })
      }
    } catch (err) {
      console.error(err)
      toast.error('Connection error while saving response.', { id: 'answer-toast' })
    } finally {
      setAnswering(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  const isComplete = conversation?.is_complete
  const nextQ = conversation?.next_questions?.[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Workload Discovery & Clarification
          </h1>
          <p className="text-xs text-slate-500">
            Verify extracted infrastructure attributes and answer key sizing questions.
          </p>
        </div>

        <Button
          asChild
          variant={isComplete ? 'default' : 'outline'}
          className={`gap-2 text-xs font-semibold ${
            isComplete
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 border-slate-300 bg-white'
          }`}
        >
          <Link href={`/projects/${id}/architecture`}>
            <span>{isComplete ? 'Proceed to Architecture' : 'Skip to Architecture'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {/* Initial User Prompt Viewer & In-Place Editor */}
      <PromptEditorCard
        projectId={id}
        initialPrompt={conversation?.collected_requirements?.raw_text}
        onRerun={fetchConversation}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Summary panel */}
        <div className="lg:col-span-4 space-y-4">
          <RequirementsSummary
            collected={conversation?.collected_requirements || {}}
            completeness={conversation?.completeness_score || 0.4}
            isComplete={isComplete}
          />
        </div>

        {/* Right: Conversational Dialogue */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="border-slate-200 shadow-xs flex flex-col min-h-[560px]">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-xs font-bold text-slate-800">
                  Interactive Sizing Interview
                </CardTitle>
              </div>
              <span className="text-[10px] text-slate-400">
                {conversation?.messages?.length || 0} messages exchanged
              </span>
            </CardHeader>

            <CardContent className="max-h-[380px] overflow-y-auto p-4 space-y-3">
              {conversation?.messages?.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Starting dialogue...
                </div>
              )}

              {conversation?.messages?.map((m: any, idx: number) => (
                <ChatMessage
                  key={idx}
                  role={m.role}
                  content={m.content}
                  timestamp={m.timestamp}
                />
              ))}
              <div ref={messagesEndRef} />
            </CardContent>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 mt-auto">
              {answering && (
                <div className="mb-3.5 flex items-center gap-3 p-3.5 rounded-lg bg-blue-50/90 border border-blue-200 text-blue-900 text-xs shadow-xs animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  <div>
                    <p className="font-bold text-blue-950">Analyzing response & updating sizing models...</p>
                    <p className="text-[11px] text-blue-700">Calibrating cloud resources, container replicas, and cost variables.</p>
                  </div>
                </div>
              )}

              {isComplete ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-emerald-50/80 border border-emerald-200 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-emerald-950">
                        Requirements Complete & Validated
                      </p>
                      <p className="text-[11px] text-emerald-700">
                        Ready to inspect interactive network topology and service SKUs.
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs gap-1.5 shadow-xs shrink-0 cursor-pointer">
                    <Link href={`/projects/${id}/architecture`}>
                      <span>View Architecture</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ) : nextQ ? (
                <QuestionCard
                  question={nextQ}
                  onAnswer={handleAnswer}
                  disabled={answering}
                />
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Sufficient parameters gathered for initial estimate.
                  </span>
                  <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs gap-1">
                    <Link href={`/projects/${id}/architecture`}>
                      Proceed to Architecture
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
