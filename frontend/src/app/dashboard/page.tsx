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
  Activity
} from 'lucide-react'
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
  const [providerFilter, setProviderFilter] = useState('all')
  const [providerStatus, setProviderStatus] = useState<any>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login')
      return
    }

    const fetchData = async () => {
      try {
        const token = getToken()
        const headers = { Authorization: `Bearer ${token}` }

        // Fetch projects
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

    fetchData()
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
  }

  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchesProvider = providerFilter === 'all' || p.provider_selection === providerFilter
    return matchesSearch && matchesProvider
  })

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              CLOQS AI Workspace
            </h1>
            <p className="text-sm text-slate-500">
              AI-Powered Cloud Architecture & Cost Intelligence &middot; <span className="font-medium text-blue-600">Architect Smarter. Optimize Everything.</span>
            </p>
          </div>

          <Button asChild className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Link href="/projects/new">
              <PlusCircle className="h-4 w-4" />
              New Estimate
            </Link>
          </Button>
        </div>

        {/* Live Provider Health Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-slate-200 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                  <Cloud className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">AWS Pricing Calculator MCP</h4>
                  <p className="text-[11px] text-slate-500">
                    {providerStatus?.aws_mcp_message || 'Checking sidecar status...'}
                  </p>
                </div>
              </div>
              <Badge variant={providerStatus?.aws_mcp_available ? 'default' : 'secondary'} className="text-[10px]">
                {providerStatus?.aws_mcp_available ? 'Active' : 'Catalog Fallback'}
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Microsoft Azure Retail Prices API</h4>
                  <p className="text-[11px] text-slate-500">
                    {providerStatus?.azure_retail_prices_message || 'Checking live API...'}
                  </p>
                </div>
              </div>
              <Badge variant={providerStatus?.azure_retail_prices_available ? 'default' : 'secondary'} className="text-[10px]">
                {providerStatus?.azure_retail_prices_available ? 'Online' : 'Cached Rates'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Controls: Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="pl-9 text-xs bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-100/80 p-1 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold px-2">Provider:</span>
            {[
              { key: 'all', label: 'All' },
              { key: 'both', label: 'Multi-Cloud' },
              { key: 'aws', label: 'AWS' },
              { key: 'azure', label: 'Azure' },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProviderFilter(p.key)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  providerFilter === p.key
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Projects List */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
            <p className="text-xs text-slate-500">Loading your architecture workspaces...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Layers className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">No architecture projects found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Describe an application in natural language to generate workload-validated AWS & Azure infrastructure estimates.
              </p>
            </div>
            <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Link href="/projects/new">
                <PlusCircle className="h-4 w-4 mr-1.5" />
                Create your first estimate
              </Link>
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-xs font-semibold">Project Name</TableHead>
                  <TableHead className="text-xs font-semibold">Cloud Target</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Est. Monthly</TableHead>
                  <TableHead className="text-xs font-semibold">Last Updated</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((proj) => (
                  <TableRow
                    key={proj.id}
                    className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                    onClick={() => router.push(`/projects/${proj.id}/discover`)}
                  >
                    <TableCell className="font-semibold text-slate-900 text-xs">
                      {proj.name}
                      {proj.description && (
                        <span className="block font-normal text-[11px] text-slate-500 truncate max-w-xs">
                          {proj.description}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px] tracking-wide">
                        {proj.provider_selection}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-[10px]">
                        {proj.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs font-bold text-slate-800">
                      {proj.monthly_cost_estimate
                        ? `$${proj.monthly_cost_estimate.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : '—'}
                    </TableCell>

                    <TableCell className="text-xs text-slate-500">
                      {new Date(proj.updated_at).toLocaleDateString()}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5 text-blue-700 bg-blue-50/50 hover:bg-blue-100 hover:text-blue-900 border-blue-200 cursor-pointer"
                          onClick={() => router.push(`/projects/${proj.id}/discover`)}
                        >
                          <span>Open</span>
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
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
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  )
}
