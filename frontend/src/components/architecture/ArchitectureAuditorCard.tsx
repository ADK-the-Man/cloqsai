'use client'

import React, { useState, useEffect } from 'react'
import { Flame, ShieldCheck, DollarSign, AlertCircle, CheckCircle2, Sparkles, RefreshCw, ChevronDown, ChevronUp, Zap, HelpCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { getToken } from '@/lib/auth'

interface WellArchitectedFinding {
  id: string
  pillar: string
  severity: 'critical' | 'warning' | 'cost_trap' | 'opportunity' | 'praise'
  title: string
  roast: string
  remedy: string
  potential_savings_monthly_usd: number
  impact_summary: string
  action_type?: string
  prompt_mutation?: string
}

interface WellArchitectedAuditReport {
  overall_score: number
  cost_score: number
  reliability_score: number
  security_score: number
  operations_score: number
  executive_summary: string
  roast_verdict: string
  total_potential_savings_monthly: number
  findings: WellArchitectedFinding[]
  recommendations_count: number
  audited_at: string
}

interface ArchitectureAuditorCardProps {
  projectId: string
  onApplyMutation?: (mutationText: string) => Promise<void>
  className?: string
}

export function ArchitectureAuditorCard({
  projectId,
  onApplyMutation,
  className = '',
}: ArchitectureAuditorCardProps) {
  const [report, setReport] = useState<WellArchitectedAuditReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [isExpanded, setIsExpanded] = useState(true)
  const [applyingFindingId, setApplyingFindingId] = useState<string | null>(null)

  const fetchAudit = async () => {
    setLoading(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${projectId}/architecture/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setReport(data)
      }
    } catch (err) {
      console.error('Failed to load architecture audit:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (projectId) fetchAudit()
  }, [projectId])

  const handleApply = async (finding: WellArchitectedFinding) => {
    if (!finding.prompt_mutation || !onApplyMutation) return
    setApplyingFindingId(finding.id)
    try {
      await onApplyMutation(finding.prompt_mutation)
      toast.success(`Applied optimization: ${finding.title}`)
      fetchAudit()
    } catch (err) {
      console.error(err)
      toast.error('Failed to apply optimization')
    } finally {
      setApplyingFindingId(null)
    }
  }

  if (loading && !report) {
    return (
      <Card className={`border-slate-200 animate-pulse ${className}`}>
        <CardContent className="p-4 space-y-3">
          <div className="h-4 bg-slate-100 rounded w-1/3" />
          <div className="h-8 bg-slate-50 rounded" />
        </CardContent>
      </Card>
    )
  }

  if (!report) return null

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
    if (score >= 70) return 'text-amber-600 bg-amber-50 border-amber-200'
    return 'text-rose-600 bg-rose-50 border-rose-200'
  }

  const findings = report.findings || []
  const filteredFindings = findings.filter((f) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'cost') return f.pillar === 'cost_optimization' || f.severity === 'cost_trap'
    if (activeFilter === 'reliability') return f.pillar === 'reliability'
    if (activeFilter === 'opportunities') return f.severity === 'opportunity' || f.severity === 'cost_trap'
    return true
  })

  return (
    <Card className={`border-purple-200/80 bg-linear-to-br from-purple-50/30 via-white to-slate-50/50 shadow-xs overflow-hidden ${className}`}>
      {/* Header Banner */}
      <CardHeader className="p-4 bg-white/80 border-b border-purple-100/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-600 text-white shadow-2xs">
            <Flame className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-slate-900">
                AI Architecture Roaster & Well-Architected Auditor
              </CardTitle>
              <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                AWS 5-Pillar Audit
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Candid architectural critique, single-point-of-failure alerts, and FinOps savings opportunities.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {report.total_potential_savings_monthly > 0 && (
            <Badge className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5">
              Save ${report.total_potential_savings_monthly.toFixed(2)}/mo
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAudit}
            disabled={loading}
            className="h-7 text-xs text-slate-600 hover:text-slate-900 gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Re-audit</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-4 space-y-4 text-xs">
          {/* Top Scores & Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {/* Overall Gauge */}
            <div className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center col-span-2 sm:col-span-1 shadow-2xs ${getScoreColor(report.overall_score)}`}>
              <span className="text-[10px] uppercase font-bold tracking-wider">Overall Score</span>
              <div className="text-2xl font-black mt-0.5">{report.overall_score}</div>
              <span className="text-[10px] opacity-80 font-medium">out of 100</span>
            </div>

            {/* Pillar 1: Cost Optimization */}
            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Cost Optimization</span>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">{report.cost_score}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5">FinOps waste & SKUs</p>
            </div>

            {/* Pillar 2: Reliability */}
            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Reliability</span>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">{report.reliability_score}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Multi-AZ & failover</p>
            </div>

            {/* Pillar 3: Security */}
            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Security</span>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">{report.security_score}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5">TLS & secret storage</p>
            </div>

            {/* Pillar 4: Operations */}
            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Operations</span>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">{report.operations_score}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5">Container insights</p>
            </div>
          </div>

          {/* Candid Roast Verdict Banner */}
          <div className="p-3.5 rounded-xl bg-linear-to-r from-purple-900 via-indigo-900 to-slate-900 text-white shadow-xs">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
              <span className="text-[11px] uppercase font-bold text-amber-300 tracking-wider">
                Principal Architect Roast Verdict
              </span>
            </div>
            <p className="text-xs text-slate-100 leading-relaxed font-sans italic">
              &ldquo;{report.roast_verdict}&rdquo;
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 pt-1 overflow-x-auto pb-1">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Filter Findings:</span>
            {[
              { id: 'all', label: `All (${findings.length})` },
              { id: 'opportunities', label: `Savings Opportunities` },
              { id: 'cost', label: `Cost Traps` },
              { id: 'reliability', label: `Resilience & SPOF` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                  activeFilter === f.id
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Actionable Findings List */}
          <div className="space-y-2.5">
            {filteredFindings.map((finding) => {
              const isPraise = finding.severity === 'praise'
              const isCostTrap = finding.severity === 'cost_trap'
              const isCritical = finding.severity === 'critical'
              const isOpp = finding.severity === 'opportunity'

              return (
                <div
                  key={finding.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isPraise
                      ? 'bg-emerald-50/40 border-emerald-200/70'
                      : isCostTrap
                      ? 'bg-amber-50/50 border-amber-200'
                      : isCritical
                      ? 'bg-rose-50/40 border-rose-200'
                      : 'bg-blue-50/40 border-blue-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`uppercase font-bold text-[9px] ${
                          isPraise
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isCostTrap
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : isCritical
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-blue-100 text-blue-800 border-blue-300'
                        }`}
                      >
                        {finding.severity.replace('_', ' ')}
                      </Badge>
                      <span className="font-bold text-slate-900 text-xs">{finding.title}</span>
                    </div>

                    {finding.potential_savings_monthly_usd > 0 && (
                      <Badge className="bg-emerald-600 text-white text-[10px] font-bold self-start sm:self-auto">
                        Save ${finding.potential_savings_monthly_usd.toFixed(2)}/mo
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {/* Roast text */}
                    <p className="text-[11px] text-slate-700 italic bg-white/70 p-2 rounded border border-slate-200/60">
                      🔥 &ldquo;{finding.roast}&rdquo;
                    </p>

                    {/* Remedy */}
                    <div className="text-[11px] text-slate-600 leading-relaxed">
                      <span className="font-semibold text-slate-800">Recommendation: </span>
                      {finding.remedy}
                    </div>
                  </div>

                  {/* 1-Click Action Button */}
                  {finding.prompt_mutation && onApplyMutation && (
                    <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400 font-mono truncate max-w-[320px]">
                        {finding.impact_summary}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => handleApply(finding)}
                        disabled={applyingFindingId === finding.id}
                        className="h-6 text-[10px] px-2.5 bg-purple-600 hover:bg-purple-700 text-white gap-1 shadow-2xs cursor-pointer font-semibold"
                      >
                        {applyingFindingId === finding.id ? (
                          <>
                            <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                            <span>Applying...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="h-2.5 w-2.5 text-amber-300" />
                            <span>1-Click Apply Optimization</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
