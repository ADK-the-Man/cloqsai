'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  Layers,
  Cloud,
  Server,
  Sparkles,
  Flame,
  DollarSign,
  Bot,
  Download,
  FileCode,
  Edit3,
  CheckCircle2,
  Table as TableIcon,
  RefreshCw,
  ExternalLink,
  ChevronDown
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArchitectureDiagram } from '@/components/architecture/ArchitectureDiagram'
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
  const [pageView, setPageView] = useState<'canvas' | 'components' | 'audit'>('canvas')
  const [editingSvcId, setEditingSvcId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; region: string; purpose: string; rationale: string }>({
    name: '',
    region: '',
    purpose: '',
    rationale: '',
  })
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)

  const currentArch = architectures.find((a) => a.provider === activeTab) || architectures[0]

  const fetchPrompt = async () => {
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/requirements`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPromptText(data.raw_text || '')
      }
    } catch (e) {
      console.error('Failed to load prompt', e)
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
        if (data.length > 0 && !activeTab) {
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
    if (id) {
      fetchArchitectures()
      fetchPrompt()
    }
  }, [id])

  const handleDiagramChange = async ({ nodes, edges }: { nodes: any[]; edges: any[] }) => {
    if (!currentArch) return
    const updatedArch = {
      ...currentArch,
      diagram_data: { nodes, edges },
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

  const handleSavePromptAndRerun = async () => {
    setSavingPrompt(true)
    try {
      const token = getToken()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      await fetch(`/api/v1/projects/${id}/requirements/extract`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw_text: promptText }),
      })

      const res = await fetch(`/api/v1/projects/${id}/architecture/generate`, {
        method: 'POST',
        headers,
      })
      if (res.ok) {
        const data = await res.json()
        setArchitectures(data)
        toast.success('Architecture re-synthesized from updated prompt!')
        setIsPromptModalOpen(false)
      } else {
        toast.error('Failed to re-generate architecture')
      }
    } catch (err) {
      console.error(err)
      toast.error('Error updating prompt')
    } finally {
      setSavingPrompt(false)
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

      const newPrompt = !currentText || mutationText.startsWith(currentText.trim()) || mutationText.length >= currentText.length
        ? mutationText.trim()
        : `${currentText.trim()}\n\n${mutationText.trim()}`

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
      n.id === svcId
        ? { ...n, data: { ...n.data, name: editForm.name, region: editForm.region, purpose: editForm.purpose } }
        : n
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
      toast.success('Service details updated')
    } catch (err) {
      console.error('Failed to update service', err)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-600 border-t-transparent" />
          <p className="text-xs text-slate-500 font-medium">Loading multi-cloud topology...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-3 sm:p-5">
      {/* Sleek Executive Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-200">
              <Layers className="h-3 w-3" />
              Cloud Architecture
            </span>
            <Badge variant="outline" className="text-[11px] text-slate-500">
              {currentArch?.services?.length || 0} Components
            </Badge>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {currentArch?.provider === 'azure' ? 'Microsoft Azure' : 'Amazon Web Services'} Infrastructure
          </h1>
          <p className="text-xs text-slate-500">
            Fully resilient Multi-AZ topology with managed ingress, autoscaling compute, and clustered storage.
          </p>
        </div>

        {/* Global Action Group */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Provider Toggle Pills */}
          {architectures.length > 1 && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {architectures.map((arch) => {
                const isSelected = activeTab === arch.provider
                return (
                  <button
                    key={arch.provider}
                    type="button"
                    onClick={() => setActiveTab(arch.provider)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {arch.provider === 'aws' ? (
                      <Cloud className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <Server className="h-3.5 w-3.5 text-blue-600" />
                    )}
                    <span>{arch.provider.toUpperCase()}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Edit Prompt Button (Replaces giant top prompt editor) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPromptModalOpen(true)}
            className="h-8 text-xs gap-1.5 text-slate-700 border-slate-200 hover:bg-slate-50"
            title="Edit input requirements prompt"
          >
            <Edit3 className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden sm:inline">Edit Prompt</span>
          </Button>

          {/* AI Architect Chat */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsChatOpen(true)}
            className="h-8 text-xs gap-1.5 border-purple-200 text-purple-700 bg-purple-50/50 hover:bg-purple-100 font-medium"
          >
            <Bot className="h-3.5 w-3.5 text-purple-600" />
            <span className="hidden sm:inline">AI Architect</span>
          </Button>

          {/* Primary CTA: Pricing */}
          <Link href={`/projects/${id}/estimates`}>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span>Pricing & BOM</span>
              <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* View Switcher: Interactive Diagram vs Component Catalog vs FinOps Audit */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPageView('canvas')}
            className={`flex items-center gap-1.5 pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              pageView === 'canvas'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Interactive Diagram</span>
          </button>

          <button
            type="button"
            onClick={() => setPageView('components')}
            className={`flex items-center gap-1.5 pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              pageView === 'components'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>Components Catalog ({currentArch?.services?.length || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setPageView('audit')}
            className={`flex items-center gap-1.5 pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              pageView === 'audit'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-purple-700'
            }`}
          >
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <span>Well-Architected Audit</span>
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
              FinOps
            </span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 pb-2 text-[11px] text-slate-500">
          <Link
            href={`/projects/${id}/api-graph`}
            className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-medium"
          >
            <span>Explore API Route Topology</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Main View Body */}
      {pageView === 'canvas' && (
        <div className="relative">
          {currentArch ? (
            <ArchitectureDiagram
              key={`${currentArch.id}-${currentArch.diagram_data?.nodes?.length || 0}`}
              initialNodes={currentArch.diagram_data?.nodes || []}
              initialEdges={currentArch.diagram_data?.edges || []}
              onChange={handleDiagramChange}
              projectName={currentArch.provider.toUpperCase()}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-xs text-slate-500">
              No architecture topology generated for this provider.
            </div>
          )}
        </div>
      )}

      {pageView === 'components' && (
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-800">
              Detailed Component Inventory & Sizing Rationale
            </CardTitle>
            <span className="text-[11px] text-slate-400">
              Click &apos;Edit&apos; to adjust purpose or tier descriptions
            </span>
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
                  {currentArch?.services?.map((svc: any) => {
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
      )}

      {pageView === 'audit' && (
        <ArchitectureAuditorCard
          projectId={id}
          onApplyMutation={handleApplyPromptMutation}
        />
      )}

      {/* Edit Prompt Dialog Modal */}
      <Dialog open={isPromptModalOpen} onOpenChange={setIsPromptModalOpen}>
        <DialogContent className="max-w-2xl bg-white p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Workload Requirements & Prompt Editor
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update your application specifications, scale constraints, or cloud preferences. Re-running will regenerate your architecture.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={10}
            className="font-mono text-xs text-slate-800 leading-relaxed bg-slate-50 border-slate-200 focus:bg-white"
            placeholder="Describe your workload, tech stack, and budget..."
          />

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsPromptModalOpen(false)}
              className="text-xs text-slate-500"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSavePromptAndRerun}
              disabled={savingPrompt}
              className="text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${savingPrompt ? 'animate-spin' : ''}`} />
              <span>{savingPrompt ? 'Synthesizing...' : 'Re-synthesize Architecture'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interactive Pair-Architect Chat Drawer */}
      <ArchitectChatDrawer
        projectId={id}
        isOpen={isChatOpen}
        onOpenChange={setIsChatOpen}
        onApplyPromptUpdate={handleApplyPromptMutation}
      />
    </div>
  )
}
