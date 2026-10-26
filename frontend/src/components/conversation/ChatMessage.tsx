'use client'

import React from 'react'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  role: 'agent' | 'user'
  content: string
  timestamp?: string
}

export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isAgent = role === 'agent'

  return (
    <div
      className={cn(
        'flex gap-3 text-sm max-w-[85%]',
        isAgent ? 'self-start' : 'self-end flex-row-reverse'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold',
          isAgent ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
        )}
      >
        {isAgent ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          'rounded-2xl px-4 py-3 leading-relaxed shadow-xs',
          isAgent
            ? 'rounded-tl-xs bg-white border border-slate-200 text-slate-800'
            : 'rounded-tr-xs bg-blue-600 text-white'
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {timestamp && (
          <div
            className={cn(
              'mt-1 text-[10px]',
              isAgent ? 'text-slate-400' : 'text-blue-100'
            )}
          >
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  )
}
