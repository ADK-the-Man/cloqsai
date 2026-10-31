'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Layers, Cloud, Server, Sparkles, Flame, DollarSign } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ArchitectureDiagram } from '@/components/architecture/ArchitectureDiagram'
import { PromptEditorCard } from '@/components/conversation/PromptEditorCard'
import { ArchitectureAuditorCard } from '@/components/architecture/ArchitectureAuditorCard'
import { ArchitectChatDrawer } from '@/components/conversation/ArchitectChatDrawer'
import { getToken } from '@/lib/auth'

export default function ArchitecturePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [architectures, setArchitectures] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('aws')
  const [currentView, setCurrentView] = useState<'topology' | 'audit'>('topology')
  const [saving, setSaving] = useState(false)
  const [editingSvcId, setEditingSvcId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; region: string; purpose: string; rationale: string }>({ name: '', region: '', purpose: '', rationale: '' })

  const currentArch = architectures.find((a) => a.provider === activeTab) || architectures[0]

  const handleDiagramChange = async ({ nodes, edges }: { nodes: any[]; edges: any[] }) => {
    if (!currentArch) return
    const updatedArch = {
      ...currentArch,
      diagram_data: {
        nodes,
        edges,
      },
    }
    setArchitectures((prev) => prev.map((a) => (a.id === currentArch.id ? updatedArch : a)))

    try {
      const token = getToken()
      await fetch(`/api/v1/projects/${id}/architecture/${currentArch.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ diagram_data: updatedArch.diagram_data }),
      })
    } catch (err) {
      console.error('Failed to persist diagram state', err)
    }
  }

  const startEditService = (svc: any) => {
    setEditingSvcId(svc.id)
    setEditForm({
      name: svc.name || '',
      region: svc.region || '',
      purpose: svc.purpose || '',
      rationale: svc.rationale || '',
    })
  }

  const saveEditService = async (svcId: string) => {
    if (!currentArch) return
    const updatedServices = (currentArch.services || []).map((s: any) =>
      s.id === svcId ? { ...s, ...editForm } : s
    )
    const updatedNodes = (currentArch.diagram_data?.nodes || []).map((n: any) =>
      n.id === svcId ? { ...n, data: { ...n.data, name: editForm.name, region: editForm.region, purpose: editForm.purpose } } : n
    )

    const updatedArch = {
      ...currentArch,
      services: updatedServices,
      diagram_data: {
        ...currentArch.diagram_data,
        nodes: updatedNodes,
      },
    }
    setArchitectures((prev) => prev.map((a) => (a.id === currentArch.id ? updatedArch : a)))
    setEditingSvcId(null)

    try {
      const token = getToken()
      await fetch(`/api/v1/projects/${id}/architecture/${currentArch.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          services: updatedServices,
          diagram_data: updatedArch.diagram_data,
        }),
      })
    } catch (err) {
      console.error('Failed to update service description', err)
    }
  }

  const fetchArchitectures = async () => {
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/architecture`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setArchitectures(data)
        if (data.length > 0) {
          setActiveTab(data[0].provider)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchArchitectures()
  }, [id])

  const handleRerunPipeline = async () => {
    setLoading(true)
    try {
      const token = getToken()
      const genRes = await fetch(`/api/v1/projects/${id}/architecture/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (genRes.ok) {
        const data = await genRes.json()
        setArchitectures(data)
        if (data.length > 0) setActiveTab(data[0].provider)
      } else {
        await fetchArchitectures()
      }
    } catch (err) {
      console.error(err)
      await fetchArchitectures()
    } finally {
      setLoading(false)
    }
  }

  const handleApplyPromptMutation = async (mutationText: string) => {
    try {
      const token = getToken()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
      const reqRes = await fetch(`/api/v1/projects/${id}/requirements`, { headers })
      let currentText = ''
      if (reqRes.ok) {
        const reqData = await reqRes.json()
        currentText = reqData.raw_text || ''
      }

      const newPrompt = currentText ? `${currentText.trim()}\n\n${mutationText.trim()}` : mutationText.trim()

      await fetch(`/api/v1/projects/${id}/requirements/extract`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw_text: newPrompt }),
      })

      await fetch(`/api/v1/projects/${id}/architecture/generate`, { method: 'POST', headers })
      await fetchArchitectures()
      toast.success('Architecture updated with recommendation!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to apply recommendation')
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Recommended Infrastructure Architecture
          </h1>
          <p className="text-xs text-slate-500">
            Interactive topology visualizer showing load balancers, compute tiers, database clustering, and security perimeters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            asChild
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs cursor-pointer shadow-xs font-semibold"
          >
            <Link href={`/projects/${id}/estimates`}>
              <DollarSign className="h-3.5 w-3.5" />
              <span>View Pricing Breakdown</span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="gap-1.5 text-xs text-blue-700 bg-blue-50/60 border-blue-200 hover:bg-blue-100 cursor-pointer"
          >
            <Link href={`/projects/${id}/scenarios`}>
              <span>Compare Scenarios</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Initial User Prompt Viewer & In-Place Editor */}
      <PromptEditorCard
        projectId={id}
        onRerun={handleRerunPipeline}
      />

      {/* View Segmented Selector: Topology Graph vs Well-Architected Audit */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setCurrentView('topology')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              currentView === 'topology'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Multi-AZ Topology Graph & Sizing</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('audit')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              currentView === 'audit'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-purple-700'
            }`}
          >
            <Flame className="h-4 w-4 text-amber-400" />
            <span>Well-Architected Roaster & FinOps Audit</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400/20 text-amber-400 font-bold hidden sm:inline">
              Save $292/mo
            </span>
          </button>
        </div>

        {currentView === 'topology' ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Audit Score: <strong className="text-slate-900 font-bold">85/100</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentView('audit')}
              className="h-7 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200 cursor-pointer font-semibold gap-1"
            >
              <Flame className="h-3 w-3 text-amber-500" />
              <span>Open Audit & Roast</span>
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentView('topology')}
            className="h-7 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 cursor-pointer font-semibold gap-1"
          >
            <Layers className="h-3 w-3 text-blue-600" />
            <span>Back to Topology Graph</span>
          </Button>
        )}
      </div>

      {/* Conditionally Render Audit or Topology View */}
      {currentView === 'audit' ? (
        <ArchitectureAuditorCard
          projectId={id}
          onApplyMutation={handleApplyPromptMutation}
        />
      ) : (
        <>
          {architectures.length > 1 && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="bg-slate-200/60 p-1">
                {architectures.map((arch) => (
                  <TabsTrigger
                    key={arch.provider}
                    value={arch.provider}
                    className="gap-2 capitalize text-xs data-[state=active]:bg-white"
                  >
                    {arch.provider === 'aws' ? <Cloud className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                    {arch.provider.toUpperCase()} Architecture
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

      {currentArch ? (
        <div className="space-y-6">
          {/* Interactive Topology Graph */}
          <Card className="border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-xs font-bold text-slate-800">
                  {currentArch.provider.toUpperCase()} Multi-AZ Network Topology
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                Boxes Draggable & Auto-Saved
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <ArchitectureDiagram
                key={`${currentArch.id}-${currentArch.diagram_data?.nodes?.length || 0}`}
                initialNodes={currentArch.diagram_data?.nodes || []}
                initialEdges={currentArch.diagram_data?.edges || []}
                onChange={handleDiagramChange}
              />
            </CardContent>
          </Card>

          {/* Sizing & Components Table */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-slate-800">
                Service Component Breakdown & Selection Rationale
              </CardTitle>
              <span className="text-[11px] text-slate-400">Click &apos;Edit&apos; to customize descriptions & rationale</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-xs font-semibold">Component</TableHead>
                      <TableHead className="text-xs font-semibold">Service</TableHead>
                      <TableHead className="text-xs font-semibold">Region</TableHead>
                      <TableHead className="text-xs font-semibold">Purpose</TableHead>
                      <TableHead className="text-xs font-semibold">Selection Rationale</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentArch.services?.map((svc: any) => {
                      const isEditing = editingSvcId === svc.id

                      return (
                        <TableRow key={svc.id}>
                          <TableCell className="font-semibold text-xs text-slate-900 min-w-[140px]">
                            {isEditing ? (
                              <Input
                                type="text"
                                value={editForm.name}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="text-xs h-8 bg-white border-blue-400"
                              />
                            ) : (
                              svc.name
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-slate-600">
                            {svc.service_name}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-slate-700">
                            {isEditing ? (
                              <Input
                                type="text"
                                value={editForm.region}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, region: e.target.value }))}
                                className="text-xs h-8 bg-white border-blue-400 w-28 font-mono"
                              />
                            ) : (
                              svc.region
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 min-w-[160px]">
                            {isEditing ? (
                              <Input
                                type="text"
                                value={editForm.purpose}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, purpose: e.target.value }))}
                                className="text-xs h-8 bg-white border-blue-400"
                              />
                            ) : (
                              svc.purpose
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 leading-snug min-w-[200px]">
                            {isEditing ? (
                              <Textarea
                                rows={2}
                                value={editForm.rationale}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, rationale: e.target.value }))}
                                className="text-xs bg-white border-blue-400 min-h-[50px]"
                              />
                            ) : (
                              svc.rationale
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-right whitespace-nowrap">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] px-2 bg-blue-600 hover:bg-blue-700 text-white"
                                  onClick={() => saveEditService(svc.id)}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[11px] px-2 text-slate-500"
                                  onClick={() => setEditingSvcId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2.5 text-slate-600 hover:text-blue-600 hover:border-blue-300"
                                onClick={() => startEditService(svc)}
                              >
                                Edit
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="p-12 text-center text-xs text-slate-500">
          No architecture data generated.
        </div>
      )}
      </>
      )}

      {/* Interactive Pair-Architect Chat Drawer */}
      <ArchitectChatDrawer
        projectId={id}
        onApplyPromptUpdate={handleApplyPromptMutation}
      />
    </div>
  )
}
