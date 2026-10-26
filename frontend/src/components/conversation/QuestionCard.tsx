'use client'

import React, { useState } from 'react'
import { HelpCircle, Send, SkipForward } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface QuestionOption {
  value: string
  label: string
}

interface QuestionCardProps {
  question: {
    id: string
    text: string
    explanation?: string
    options?: QuestionOption[]
  }
  onAnswer: (answer: string, isSkipped?: boolean) => void
  disabled?: boolean
}

export function QuestionCard({ question, onAnswer, disabled }: QuestionCardProps) {
  const [customText, setCustomText] = useState('')

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customText.trim()) return
    onAnswer(customText.trim(), false)
    setCustomText('')
  }

  return (
    <Card className="border-blue-200 bg-blue-50/20 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-1">
          <HelpCircle className="h-4 w-4" />
          Clarification Question
        </div>
        <CardTitle className="text-base text-slate-900 leading-snug">
          {question.text}
        </CardTitle>
        {question.explanation && (
          <CardDescription className="text-xs text-slate-500 mt-1">
            <span className="font-semibold text-slate-600">Why this matters: </span>
            {question.explanation}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {disabled && (
          <div className="flex items-center gap-2 text-[11px] text-blue-700 font-medium bg-blue-100/60 py-1.5 px-3 rounded-md animate-pulse">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent shrink-0" />
            <span>Submitting response & recalibrating capacity...</span>
          </div>
        )}

        {question.options && question.options.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {question.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="question-option-btn w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:bg-blue-50/60 hover:border-blue-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all text-xs text-slate-800 font-medium leading-relaxed shadow-xs whitespace-normal break-words disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                onClick={() => onAnswer(opt.value, false)}
                disabled={disabled}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="pt-1 space-y-2">
          <form onSubmit={handleCustomSubmit} className="flex gap-2">
            <Input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Or type custom specification..."
              className="text-xs h-9 bg-white shadow-2xs"
              disabled={disabled}
            />
            <Button
              type="submit"
              size="sm"
              disabled={disabled || !customText.trim()}
              className="h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-xs font-semibold shadow-2xs shrink-0 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              <span>Submit</span>
            </Button>
          </form>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 pt-1">
            <span className="text-[11px] text-slate-400">
              Pick an option above or type your workload parameters
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-slate-600 text-xs h-7 px-2 gap-1 cursor-pointer"
              onClick={() => onAnswer('unknown', true)}
              disabled={disabled}
            >
              <SkipForward className="h-3 w-3" />
              <span>Skip requirement</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
