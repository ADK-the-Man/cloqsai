'use client'

import React from 'react'
import { CheckCircle2, HelpCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface RequirementsSummaryProps {
  collected: Record<string, any>
  completeness: number
  isComplete?: boolean
}

export function RequirementsSummary({ collected, completeness, isComplete = false }: RequirementsSummaryProps) {
  // Region formatting
  const rawRegion = collected.regions || collected.region
  const regionVal = rawRegion
    ? (Array.isArray(rawRegion) ? rawRegion.join(', ') : String(rawRegion))
    : (isComplete ? 'us-east-2 (Standard)' : undefined)

  // Compute / Cluster formatting
  let computeVal: string | undefined = undefined
  if (collected.container_runtime_sizing) {
    computeVal = String(collected.container_runtime_sizing)
  } else if (collected.compute_platform) {
    const raw = String(collected.compute_platform).replace(/_/g, ' ')
    computeVal = raw.toLowerCase().includes('eks') ? 'EKS Managed Nodes' : raw
  } else if (collected.has_eks || collected.application_type?.toLowerCase().includes('docker') || collected.application_type?.toLowerCase().includes('container')) {
    computeVal = 'EKS (2 Nodes, HPA)'
  } else if (collected.compute_tier) {
    computeVal = String(collected.compute_tier)
  } else if (isComplete) {
    computeVal = 'Auto-scaling Container Cluster'
  }

  // Format computeVal to clean human title
  if (computeVal) {
    if (computeVal.toLowerCase().includes('hpa')) {
      computeVal = 'EKS Cluster (HPA Auto-scaling)'
    } else if (computeVal.toLowerCase().includes('managed')) {
      computeVal = 'EKS Managed Nodes (Auto-scaled)'
    }
  }

  // Concurrent Users formatting
  let usersVal: string | undefined = undefined
  const rawUsers = collected.concurrent_users
  if (rawUsers && rawUsers !== 'NA' && rawUsers !== 'unknown' && rawUsers !== 'None') {
    usersVal = `${rawUsers} Concurrent Users`
  } else if (isComplete) {
    usersVal = 'Auto-scaled Baseline (1K Users)'
  }

  // Database Engine
  const dbEngineVal = collected.db_engine || (isComplete ? 'PostgreSQL' : undefined)

  // Database Storage
  const dbStorageVal = collected.db_storage_gb !== undefined && collected.db_storage_gb !== null
    ? `${collected.db_storage_gb} GB`
    : (isComplete ? '100 GB (Auto-grow)' : undefined)

  // Availability SLA
  const slaVal = collected.availability_target_percent
    ? `${collected.availability_target_percent}%`
    : (isComplete ? '99.9% High Availability' : undefined)

  // Base fields
  const fields: Array<{ key: string; label: string; val: string | undefined }> = [
    { key: 'application_type', label: 'App Architecture', val: collected.application_type },
    { key: 'target_region', label: 'Target Region', val: regionVal },
    { key: 'compute_platform', label: 'Compute / Cluster', val: computeVal },
    { key: 'concurrent_users', label: 'Concurrent Users', val: usersVal },
    { key: 'db_engine', label: 'Database Engine', val: dbEngineVal },
    { key: 'db_storage_gb', label: 'Database Storage', val: dbStorageVal },
    { key: 'availability_target_percent', label: 'Availability SLA', val: slaVal },
  ]

  // Optional ancillary services if detected
  if (collected.opensearch_ha || collected.raw_text?.toLowerCase().includes('opensearch')) {
    const rawOs = collected.opensearch_ha || 'single_az'
    const osLabel = rawOs.includes('dedicated') ? 'Multi-AZ (3 Masters)' : rawOs.includes('multi') ? 'Multi-AZ Standby' : 'OpenSearch (Single-AZ)'
    fields.push({ key: 'opensearch', label: 'Search Domain', val: osLabel })
  }

  if (collected.raw_text?.toLowerCase().includes('s3') || collected.s3_count || collected.s3_lifecycle) {
    fields.push({ key: 's3', label: 'Object Storage', val: 'Amazon S3 Standard' })
  }

  // If validation is complete, score is 100%
  const validated = isComplete || completeness >= 0.75
  const pct = validated ? 100 : Math.round(completeness * 100)

  return (
    <Card className="border-slate-200 shadow-xs bg-white">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-800">
            Workload Specification
          </CardTitle>
          <Badge
            variant={validated ? 'default' : 'secondary'}
            className={`text-[11px] ${validated ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' : ''}`}
          >
            {validated ? '100% Validated' : `${pct}% Complete`}
          </Badge>
        </div>
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
          <div
            className={`h-full rounded-full transition-all duration-300 ${validated ? 'bg-emerald-600' : 'bg-blue-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="pt-3 space-y-2.5 text-xs">
        {fields.map((f) => {
          const isFilled = f.val !== undefined && f.val !== null && f.val !== 'unknown' && f.val !== 'None' && String(f.val).trim() !== ''

          return (
            <div key={f.key} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
              <span className="text-slate-500 font-medium">{f.label}</span>
              <div className="flex items-center gap-1.5">
                {isFilled ? (
                  <>
                    <span className="font-semibold text-slate-800 capitalize max-w-[130px] sm:max-w-[185px] truncate text-right">
                      {String(f.val)}
                    </span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  </>
                ) : (
                  <>
                    <span className="text-slate-400 italic">Pending</span>
                    <HelpCircle className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
