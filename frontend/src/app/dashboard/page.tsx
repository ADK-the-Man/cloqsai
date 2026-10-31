'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PlusCircle,
  Search,
  Cloud,
  CheckCircle2,
  Clock,
  ArrowRight,
  Trash2,
  Server,
  Layers,
  Activity,
  DollarSign,
  RefreshCw,
  AlertTriangle,
  Zap,
  TrendingDown,
  TrendingUp,
  ExternalLink,
  ShieldCheck,
  Network
} from 'lucide-react'
import { toast } from 'sonner'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { isAuthenticated, getToken } from '@/lib/auth'

export default function DashboardPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'needs_refresh' | 'live' | 'aws' | 'azure'>('all')
  const [providerStatus, setProviderStatus] = useState<any>(null)
  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null)

  const fetchDashboardData = async () => {
    try {
      const token = getToken()
      const headers = { Authorization: `Bearer ${token}` }

      // Fetch projects with freshness metadata
      const pRes = await fetch('/api/v1/projects', { headers })
      if (pRes.ok) {
        const pData = await pRes.json()
        setProjects(pData.projects || [])
      }

      // Fetch provider health
      const hRes = await fetch('/api/v1/providers/status', { headers })
      if (hRes.ok) {
        const hData = await hRes.json()
        setProviderStatus(hData)
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login')
      return
    }
    fetchDashboardData()
  }, [router])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this estimate project?')) return
    const token = getToken()
    await fetch(`/api/v1/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setProjects(projects.filter((p) => p.id !== id))
    toast.success('Project deleted')
  }

  const handleSyncRates = async (projectId: string, scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSyncingProjectId(projectId)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${projectId}/estimates/${scenarioId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message || 'Estimate synced with live cloud catalog rates!')
        await fetchDashboardData()
      } else {
        toast.error('Failed to sync estimate rates')
      }
    } catch (err) {
      console.error(err)
      toast.error('Error connecting to pricing catalog')
    } finally {
      setSyncingProjectId(null)
    }
  }

  // Summary Metrics
  const totalProjects = projects.length
  const liveCount = projects.filter((p) => p.freshness?.status === 'fresh').length
  const driftCount = projects.filter((p) => p.freshness?.status === 'drift_detected').length
  const staleCount = projects.filter((p) => p.freshness?.is_stale || p.freshness?.status === 'stale').length
  const needsRefreshCount = driftCount + staleCount

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()))

    if (!matchesSearch) return false

    if (filterTab === 'needs_refresh') {
      return p.freshness?.is_stale || p.freshness?.status === 'drift_detected'
    }
    if (filterTab === 'live') {
      return p.freshness?.status === 'fresh'
    }
    if (filterTab === 'aws') {
      return p.provider_selection === 'aws' || p.provider_selection === 'both'
    }
    if (filterTab === 'azure') {
      return p.provider_selection === 'azure' || p.provider_selection === 'both'
    }
    return true
  })

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        {/* Top Header - Note: Primary 'New Estimate' action is cleanly housed in the Navbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              CLOQS AI Workspace
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              AI-Powered Cloud Architecture & Cost Intelligence &middot;{' '}
              <span className="font-medium text-blue-600">Architect Smarter. Optimize Everything.</span>
            </p>
          </div>
        </div>

        {/* Compact Workspace Intelligence & Filter Bar */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Quick Metrics & Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  filterTab === 'all'
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>All Workloads</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {totalProjects}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('live')}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  filterTab === 'live'
                    ? 'bg-emerald-700 text-white font-semibold shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 border border-emerald-200/60'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live In-Sync</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterTab === 'live' ? 'bg-white/20 text-white' : 'bg-emerald-200 text-emerald-900'}`}>
                  {liveCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('needs_refresh')}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  filterTab === 'needs_refresh'
                    ? 'bg-amber-600 text-white font-semibold shadow-xs'
                    : driftCount > 0
                    ? 'bg-amber-50 text-amber-800 hover:bg-amber-100/70 border border-amber-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                <span>Drift Detected</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterTab === 'needs_refresh' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900'}`}>
                  {driftCount}
                </span>
              </button>

              {staleCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTab('needs_refresh')}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    filterTab === 'needs_refresh'
                      ? 'bg-rose-700 text-white font-semibold shadow-xs'
                      : 'bg-rose-50 text-rose-800 hover:bg-rose-100/70 border border-rose-300'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 text-rose-500" />
                  <span>Outdated</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${filterTab === 'needs_refresh' ? 'bg-white/20 text-white' : 'bg-rose-200 text-rose-900'}`}>
                    {staleCount}
                  </span>
                </button>
              )}

              <div className="h-4 w-[1px] bg-slate-200 mx-1 shrink-0 hidden sm:block" />

              <button
                type="button"
                onClick={() => setFilterTab('aws')}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer shrink-0 ${
                  filterTab === 'aws'
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                AWS
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('azure')}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer shrink-0 ${
                  filterTab === 'azure'
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Azure
              </button>
            </div>

            {/* Provider Catalog Live Status Badges */}
            <div className="flex items-center gap-2 text-[11px] text-slate-500 shrink-0">
              <span className="hidden xl:inline text-slate-400">Pricing Engine:</span>
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-700">
                <span className={`h-1.5 w-1.5 rounded-full ${providerStatus?.aws_mcp_available ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="font-semibold text-slate-800">AWS:</span>
                <span>{providerStatus?.aws_mcp_available ? 'Live MCP Sidecar' : 'v2026.10 Verified'}</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-700">
                <span className={`h-1.5 w-1.5 rounded-full ${providerStatus?.azure_retail_prices_available ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="font-semibold text-slate-800">Azure:</span>
                <span>{providerStatus?.azure_retail_prices_available ? 'Live Retail API' : 'Global Rates'}</span>
              </div>
            </div>
          </div>

          {/* Search bar row */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workloads & architectures by name or prompt keywords..."
              className="pl-9 h-8 text-xs bg-slate-50/60 border-slate-200 focus:bg-white"
            />
          </div>
        </div>

        {/* Projects List */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
            <p className="text-xs text-slate-500">Loading your architecture workspaces & estimate freshness...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Layers className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">No matching architecture workloads found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {filterTab === 'needs_refresh'
                  ? 'All your estimates are fresh and in sync with current cloud catalog pricing!'
                  : 'Describe an application in natural language to generate workload-validated AWS & Azure infrastructure estimates.'}
              </p>
            </div>
            {filterTab !== 'all' ? (
              <Button size="sm" variant="outline" onClick={() => setFilterTab('all')}>
                Show all workloads
              </Button>
            ) : (
              <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Link href="/projects/new">
                  <PlusCircle className="h-4 w-4 mr-1.5" />
                  Create your first estimate
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow className="bg-slate-50/70 border-b border-slate-200">
                    <TableHead className="text-xs font-semibold py-3">Workload / Project</TableHead>
                    <TableHead className="text-xs font-semibold py-3">Cloud Target</TableHead>
                    <TableHead className="text-xs font-semibold py-3">Monthly Estimate</TableHead>
                    <TableHead className="text-xs font-semibold py-3">Catalog Freshness</TableHead>
                    <TableHead className="text-xs font-semibold py-3">Last Sized</TableHead>
                    <TableHead className="text-xs font-semibold py-3 text-right">Direct Fast-Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {filteredProjects.map((proj) => {
                    const freshness = proj.freshness
                    const isStale = freshness?.is_stale || freshness?.status === 'stale'
                    const isDrift = freshness?.status === 'drift_detected'
                    const isFresh = freshness?.status === 'fresh'
                    const hasScenarios = proj.has_scenarios

                    return (
                      <TableRow
                        key={proj.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        {/* Project Info */}
                        <TableCell className="font-semibold text-slate-900 text-xs max-w-[240px]">
                          <div className="truncate font-bold text-slate-900">{proj.name}</div>
                          {proj.description && (
                            <span className="block font-normal text-[11px] text-slate-500 truncate mt-0.5">
                              {proj.description}
                            </span>
                          )}
                        </TableCell>

                        {/* Provider */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="uppercase text-[10px] font-semibold tracking-wide bg-slate-50 text-slate-700 border-slate-300"
                          >
                            {proj.provider_selection}
                          </Badge>
                        </TableCell>

                        {/* Pricing */}
                        <TableCell>
                          {proj.monthly_cost_estimate ? (
                            <div>
                              <div className="text-xs font-extrabold text-slate-900">
                                ${proj.monthly_cost_estimate.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo
                              </div>
                              <span className="text-[10px] text-slate-400">
                                ${(proj.monthly_cost_estimate * 12).toLocaleString(undefined, { minimumFractionDigits: 0 })}/yr
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">—</span>
                          )}
                        </TableCell>

                        {/* Freshness Status Badge & 1-Click Sync */}
                        <TableCell>
                          {hasScenarios && freshness ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isFresh && (
                                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold gap-1 py-0.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  <span>Live Rates</span>
                                </Badge>
                              )}
                              {isDrift && (
                                <Badge className="bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-semibold gap-1 py-0.5">
                                  <Zap className="h-2.5 w-2.5 text-amber-600" />
                                  <span>Rate Drift ({freshness.drift_amount_usd < 0 ? '-' : '+'}${Math.abs(freshness.drift_amount_usd).toFixed(0)}/mo)</span>
                                </Badge>
                              )}
                              {isStale && (
                                <Badge className="bg-rose-50 text-rose-700 border border-rose-300 text-[10px] font-semibold gap-1 py-0.5">
                                  <Clock className="h-2.5 w-2.5 text-rose-600" />
                                  <span>Stale ({freshness.age_days}d old)</span>
                                </Badge>
                              )}

                              {/* 1-Click Sync Button right on dashboard */}
                              {(isStale || isDrift) && proj.latest_scenario_id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => handleSyncRates(proj.id, proj.latest_scenario_id, e)}
                                  disabled={syncingProjectId === proj.id}
                                  className="h-6 text-[10px] px-2 text-blue-700 bg-blue-50 hover:bg-blue-100 hover:text-blue-900 border border-blue-200 cursor-pointer font-semibold gap-1"
                                  title="Sync with live AWS catalog"
                                >
                                  <RefreshCw className={`h-2.5 w-2.5 ${syncingProjectId === proj.id ? 'animate-spin' : ''}`} />
                                  <span>Sync</span>
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Badge variant="secondary" className="capitalize text-[10px] text-slate-500 bg-slate-100">
                              {proj.status.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </TableCell>

                        {/* Date */}
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {new Date(proj.updated_at).toLocaleDateString()}
                        </TableCell>

                        {/* Direct Fast-Access Buttons */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {/* Direct Pricing Button - no need to step through flow */}
                            {hasScenarios ? (
                              <Button
                                size="sm"
                                className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer gap-1 shadow-2xs"
                                onClick={() => router.push(`/projects/${proj.id}/estimates`)}
                                title="Jump directly to pricing breakdown & export"
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                                <span>View Pricing</span>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 text-xs px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer gap-1 shadow-2xs"
                                onClick={() => router.push(`/projects/${proj.id}/discover`)}
                              >
                                <span>Continue Sizing</span>
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            )}

                            {/* Direct Architecture Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2 text-slate-700 hover:text-blue-600 hover:border-blue-300 cursor-pointer gap-1"
                              onClick={() => router.push(`/projects/${proj.id}/architecture`)}
                              title="View visual architecture graph"
                            >
                              <Network className="h-3 w-3 text-slate-500" />
                              <span className="hidden sm:inline">Arch</span>
                            </Button>

                            {/* Delete */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              onClick={(e) => handleDelete(proj.id, e)}
                              title="Delete project"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
