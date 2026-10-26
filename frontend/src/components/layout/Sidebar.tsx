'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FileText,
  Network,
  GitCompare,
  DownloadCloud,
  CheckCircle2,
  ChevronRight,
  ArrowLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  projectId: string
  projectName?: string
}

export function Sidebar({ projectId, projectName }: SidebarProps) {
  const pathname = usePathname()

  const steps = [
    {
      title: '1. Discovery & Specs',
      description: 'Requirements & Clarification',
      href: `/projects/${projectId}/discover`,
      icon: FileText,
      pattern: `/projects/${projectId}/discover`,
    },
    {
      title: '2. Architecture',
      description: 'Visual Service Graph',
      href: `/projects/${projectId}/architecture`,
      icon: Network,
      pattern: `/projects/${projectId}/architecture`,
    },
    {
      title: '3. Scenarios',
      description: 'Cost & HA Trade-offs',
      href: `/projects/${projectId}/scenarios`,
      icon: GitCompare,
      pattern: `/projects/${projectId}/scenarios`,
    },
    {
      title: '4. Estimates & Exports',
      description: 'CSV & XLSX Calculator',
      href: `/projects/${projectId}/estimates`,
      icon: DownloadCloud,
      pattern: `/projects/${projectId}/estimates`,
    },
  ]

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50/70 p-4 min-h-[calc(100vh-4rem)] flex flex-col justify-between">
      <div className="space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <h2 className="text-sm font-semibold text-slate-900 truncate" title={projectName}>
            {projectName || 'Current Project'}
          </h2>
          <p className="text-xs text-slate-500">Infrastructure Workflow</p>
        </div>

        <nav className="space-y-1.5">
          {steps.map((step, idx) => {
            const isActive = pathname === step.pattern || pathname.startsWith(step.pattern)
            const Icon = step.icon

            return (
              <Link
                key={step.href}
                href={step.href}
                className={cn(
                  'flex items-start gap-3 rounded-lg p-2.5 text-xs transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', isActive ? 'text-white' : 'text-slate-500')} />
                <div className="flex-1 min-w-0">
                  <div className={cn('font-semibold truncate', isActive ? 'text-white' : 'text-slate-900')}>
                    {step.title}
                  </div>
                  <div className={cn('text-[11px] truncate', isActive ? 'text-blue-100' : 'text-slate-500')}>
                    {step.description}
                  </div>
                </div>
                {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white mt-1" />}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-700 block mb-1">Pricing Integrity</span>
        Generated CSV & Excel files strictly distinguish native calculator links from workload estimations.
      </div>
    </aside>
  )
}
