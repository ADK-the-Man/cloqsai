'use client'

import React from 'react'
import { CheckCircle2, Clock, Loader2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface JobStatusCardProps {
  job: {
    id: string
    provider: string
    status: string
    status_message?: string
    job_metadata?: Record<string, any>
    error_detail?: string
  }
  onRetry?: () => void
  onViewAzureModal?: () => void
}

const STEPS = [
  { key: 'validating', label: 'Validate Workload' },
  { key: 'connecting', label: 'Connect to Provider' },
  { key: 'configuring', label: 'Configure SKUs' },
  { key: 'calculating', label: 'Calculate Pricing' },
  { key: 'exporting', label: 'Export Reports' },
  { key: 'verifying', label: 'Verify Checksums' },
  { key: 'completed', label: 'Ready' },
]

export function JobStatusCard({ job, onRetry, onViewAzureModal }: JobStatusCardProps) {
  const isFailed = job.status === 'failed'
  const isCompleted = job.status === 'completed'
  const isRunning = !isFailed && !isCompleted

  const currentStepIdx = STEPS.findIndex((s) => s.key === job.status)

  return (
    <Card className="border-slate-200 shadow-xs">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm uppercase text-slate-800">
              {job.provider} Pricing Workflow
            </span>
            <Badge variant={isCompleted ? 'default' : (isFailed ? 'destructive' : 'secondary')}>
              {job.status.replace(/_/g, ' ')}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {job.provider === 'azure' && isCompleted && onViewAzureModal && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewAzureModal}
                className="h-6 text-[11px] px-2 text-blue-700 border-blue-300 hover:bg-blue-50 font-medium"
              >
                View Azure SKUs & Prices
              </Button>
            )}

            {job.job_metadata?.estimate_url && (job.provider !== 'aws' || job.job_metadata.estimate_url.includes('?id=')) && (
              <a
                href={job.job_metadata.estimate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {job.provider === 'aws' ? 'Live AWS Calculator' : 'Azure Portal'}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Pipeline steps */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center">
          {STEPS.map((s, idx) => {
            const isStepDone = isCompleted || (currentStepIdx > idx)
            const isStepActive = job.status === s.key

            return (
              <div
                key={s.key}
                className={`rounded-lg p-2 text-xs border ${
                  isStepDone
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : (isStepActive
                      ? 'border-blue-400 bg-blue-50 text-blue-800 font-bold'
                      : 'border-slate-100 bg-slate-50 text-slate-400')
                }`}
              >
                <div className="flex justify-center mb-1">
                  {isStepDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (isStepActive ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-slate-300" />
                  ))}
                </div>
                <div className="text-[10px] leading-tight truncate">{s.label}</div>
              </div>
            )
          })}
        </div>

        {/* Status message */}
        <div className="text-xs text-slate-600 bg-slate-50 rounded-md p-2.5 flex items-center gap-2">
          {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />}
          {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
          {isFailed && <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
          <span className="truncate">{job.status_message || 'Initializing pipeline...'}</span>
        </div>

        {isFailed && (
          <div className="flex items-center justify-between text-xs bg-red-50 text-red-700 p-2.5 rounded-md">
            <span>{job.error_detail || 'Estimation workflow failed'}</span>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} className="gap-1 h-7 text-xs">
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
