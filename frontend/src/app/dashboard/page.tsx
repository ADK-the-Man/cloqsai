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
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              CLOQS AI Workspace
            </h1>
            <p className="text-sm text-slate-500">
              AI-Powered Cloud Architecture & Cost Intelligence &middot;{' '}
              <span className="font-medium text-blue-600">Architect Smarter. Optimize Everything.</span>
            </p>
          </div>

          <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer">
            <Link href="/projects/new">
              <PlusCircle className="h-4 w-4" />
              <span>New Cloud Workload</span>
            </Link>
          </Button>
        </div>

        {/* Estimate Freshness & Pricing KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card
            className={`cursor-pointer transition-all border ${
              filterTab === 'all' ? 'border-blue-400 bg-blue-50/30 ring-1 ring-blue-300' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
            onClick={() => setFilterTab('all')}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Total Workloads
                </span>
                <div className="text-2xl font-black text-slate-900 mt-0.5">{totalProjects}</div>
                <p className="text-[10px] text-slate-400 mt-0.5">Sized cloud architectures</p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600">
                <Layers className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all border ${
              filterTab === 'live' ? 'border-emerald-400 bg-emerald-50/30 ring-1 ring-emerald-300' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
            onClick={() => setFilterTab('live')}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Live & Verified
                </span>
                <div className="text-2xl font-black text-emerald-700 mt-0.5">{liveCount}</div>
                <p className="text-[10px] text-emerald-600/80 mt-0.5">Synchronized with catalogs</p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all border ${
              filterTab === 'needs_refresh' ? 'border-amber-400 bg-amber-50/40 ring-1 ring-amber-300' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
            onClick={() => setFilterTab('needs_refresh')}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-600" />
                  Drift Detected
                </span>
                <div className="text-2xl font-black text-amber-800 mt-0.5">{driftCount}</div>
                <p className="text-[10px] text-amber-700/80 mt-0.5">AWS/Azure price variance</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all border ${
              filterTab === 'needs_refresh' ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-300' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
            onClick={() => setFilterTab('needs_refresh')}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-rose-600" />
                  Outdated (&gt;30d)
                </span>
                <div className="text-2xl font-black text-rose-700 mt-0.5">{staleCount}</div>
                <p className="text-[10px] text-rose-600/80 mt-0.5">Requires 1-click sync</p>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
                <Clock className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Provider Health Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                  <Cloud className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">AWS Pricing Calculator MCP Sidecar</h4>
                  <p className="text-[11px] text-slate-500">
                    {providerStatus?.aws_mcp_message || 'Checking live sidecar status...'}
                  </p>
                </div>
              </div>
              <Badge variant={providerStatus?.aws_mcp_available ? 'default' : 'secondary'} className="text-[10px]">
                {providerStatus?.aws_mcp_available ? 'Active Live MCP' : 'Catalog Sizing'}
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs bg-white">
            <CardContent className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                  <Server className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Microsoft Azure Retail Prices API</h4>
                  <p className="text-[11px] text-slate-500">
                    {providerStatus?.azure_retail_prices_message || 'Checking live API...'}
                  </p>
                </div>
              </div>
              <Badge variant={providerStatus?.azure_retail_prices_available ? 'default' : 'secondary'} className="text-[10px]">
                {providerStatus?.azure_retail_prices_available ? 'Online Live API' : 'Cached Rates'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Controls: Search & Smart Filter Tabs */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workloads & architectures..."
              className="pl-9 text-xs bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[
              { key: 'all', label: `All (${totalProjects})` },
              { key: 'needs_refresh', label: `Needs Refresh (${needsRefreshCount})`, highlight: needsRefreshCount > 0 },
              { key: 'live', label: `Live In-Sync (${liveCount})` },
              { key: 'aws', label: 'AWS' },
              { key: 'azure', label: 'Azure' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilterTab(t.key as any)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                  filterTab === t.key
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : t.highlight
                    ? 'text-amber-700 font-semibold hover:bg-amber-100/50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {t.label}
              </button>
            ))}
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
