'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, DownloadCloud, Sparkles, Edit2, Save, X, Check, ShieldCheck, Plus, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { ScenarioCard } from '@/components/scenarios/ScenarioCard'
import { CostComparisonChart } from '@/components/scenarios/CostComparisonChart'
import { AddServiceModal } from '@/components/scenarios/AddServiceModal'
import { getToken } from '@/lib/auth'

const SKU_RATES: Record<string, number> = {
  't3.nano': 3.80,
  't3.micro': 7.59,
  't3.small': 15.18,
  't3.medium': 30.37,
  't3.large': 60.74,
  't3.xlarge': 121.47,
  't3.2xlarge': 242.94,
  'm6i.large': 70.08,
  'm6i.xlarge': 140.16,
  'm6i.2xlarge': 280.32,
  'm6i.4xlarge': 560.64,
  'm7i.large': 73.58,
  'm7i.xlarge': 147.17,
  'm7i.2xlarge': 294.34,
  'c7i.large': 64.97,
  'c7i.xlarge': 129.94,
  'c7i.2xlarge': 259.88,
  'r7i.large': 97.09,
  'r7i.xlarge': 194.18,
  'db.t4g.micro': 12.41,
  'db.t4g.small': 24.82,
  'db.t4g.medium': 49.64,
  'db.t4g.large': 211.34,
  'db.t4g.xlarge': 410.00,
  'db.m6g.large': 282.88,
  'db.m6g.xlarge': 542.76,
  'm6g.large.search': 93.44,
  'm6g.xlarge.search': 186.88,
  'Standard_D2s_v5': 70.08,
  'Standard_D4s_v5': 140.16,
  'Standard_D8s_v5': 280.32,
  'Standard_D16s_v5': 560.64,
  'D2s_v5': 70.08,
  'D4s_v5': 140.16,
  'D8s_v5': 280.32,
  'D16s_v5': 560.64,
  'B2s': 30.37,
  'B4ms': 121.18,
  'GP_Gen5_2': 146.00,
  'GP_Gen5_4': 292.00,
  'GP_Gen5_8': 584.00,
}

export default function ScenariosPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [scenarios, setScenarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [savingResourceId, setSavingResourceId] = useState<string | null>(null)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)
  const [initialSku, setInitialSku] = useState<string>('')
  const [activeDeltaModal, setActiveDeltaModal] = useState<{ isOpen: boolean; scenarioId: string; provider: 'aws' | 'azure' }>({
    isOpen: false,
    scenarioId: '',
    provider: 'aws',
  })
  const [editForm, setEditForm] = useState<{
    resource_name: string
    region: string
    sku: string
    quantity: number
    monthly_cost_usd: number
  }>({
    resource_name: '',
    region: '',
    sku: '',
    quantity: 1,
    monthly_cost_usd: 0,
  })

  const fetchScenarios = async () => {
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/scenarios`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setScenarios(data)

        // Pre-select "recommended" for each provider, or fallback to first
        const initSelected: Record<string, string> = {}
        for (const s of data) {
          if (s.scenario_type === 'recommended' && !initSelected[s.provider]) {
            initSelected[s.provider] = s.id
          }
        }
        for (const s of data) {
          if (!initSelected[s.provider]) {
            initSelected[s.provider] = s.id
          }
        }
        setSelectedIds(initSelected)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchScenarios()
  }, [id])

  const handleSelectScenario = (provider: string, scenarioId: string) => {
    setSelectedIds((prev) => ({
      ...prev,
      [provider]: scenarioId,
    }))
    setEditingResourceId(null)
  }

  const startEditResource = (res: any) => {
    setEditingResourceId(res.id)
    setInitialSku(res.sku || '')
    setEditForm({
      resource_name: res.resource_name || '',
      region: res.region || 'us-east-2',
      sku: res.sku || '',
      quantity: res.quantity || 1,
      monthly_cost_usd: Number(res.monthly_cost_usd || 0),
    })
  }

  const handleSkuChange = (newSku: string) => {
    const trimmed = newSku.trim()
    const rate = SKU_RATES[trimmed]
    if (rate !== undefined) {
      setEditForm((prev) => ({
        ...prev,
        sku: newSku,
        monthly_cost_usd: Number((rate * prev.quantity).toFixed(2)),
      }))
    } else {
      setEditForm((prev) => ({ ...prev, sku: newSku }))
    }
  }

  const handleQuantityChange = (newQty: number) => {
    const qty = Math.max(1, newQty)
    const rate = SKU_RATES[editForm.sku.trim()]
    if (rate !== undefined) {
      setEditForm((prev) => ({
        ...prev,
        quantity: qty,
        monthly_cost_usd: Number((rate * qty).toFixed(2)),
      }))
    } else {
      const unit = editForm.quantity > 0 ? editForm.monthly_cost_usd / editForm.quantity : editForm.monthly_cost_usd
      setEditForm((prev) => ({
        ...prev,
        quantity: qty,
        monthly_cost_usd: Number((unit * qty).toFixed(2)),
      }))
    }
  }

  const saveEditResource = async (scenarioId: string, resourceId: string) => {
    setSavingResourceId(resourceId)
    setSaveSuccessMsg(null)
    try {
      const token = getToken()
      const payload: any = {
        resource_name: editForm.resource_name,
        region: editForm.region,
        sku: editForm.sku,
        quantity: editForm.quantity,
        monthly_cost_usd: editForm.monthly_cost_usd,
      }
      const res = await fetch(`/api/v1/projects/${id}/scenarios/${scenarioId}/resources/${resourceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const updatedScenario = await res.json()
        setScenarios((prev) =>
          prev.map((s) => (s.id === scenarioId ? updatedScenario : s))
        )
        setEditingResourceId(null)
        setSaveSuccessMsg(`Resource updated! New scenario cost: $${updatedScenario.monthly_cost_usd.toFixed(2)}/mo`)
        setTimeout(() => setSaveSuccessMsg(null), 4000)
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('Failed to update resource', err)
      }
    } catch (err) {
      console.error('Failed to update resource', err)
    } finally {
      setSavingResourceId(null)
    }
  }

  const handleGenerateEstimates = async () => {
    const scenarioIdList = Object.values(selectedIds)
    if (scenarioIdList.length === 0) return

    setSubmitting(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/estimates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scenario_ids: scenarioIdList }),
      })

      if (res.ok) {
        router.push(`/projects/${id}/estimates`)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  // Chart data
  const chartData = scenarios.map((s) => ({
    scenario: `${s.provider.toUpperCase()} ${s.scenario_type.replace('_', ' ')}`,
    monthlyCost: s.monthly_cost_usd,
    annualCost: s.annual_cost_usd,
  }))

  const providers = Array.from(new Set(scenarios.map((s) => s.provider)))
  const selectedScenarios = scenarios.filter((s) => Object.values(selectedIds).includes(s.id))

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Architectural Scenario Comparison
          </h1>
          <p className="text-xs text-slate-500">
            Compare cost-optimized vs. production vs. high-availability configurations. Select preferred models to run pricing calculators.
          </p>
        </div>

        <Button
          onClick={handleGenerateEstimates}
          disabled={submitting || Object.keys(selectedIds).length === 0}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
        >
          {submitting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Initializing Calculators...
            </>
          ) : Object.keys(selectedIds).length === 0 ? (
            <span>Select a Scenario Below</span>
          ) : (
            <>
              <span>Proceed to Pricing Estimates ({Object.keys(selectedIds).length})</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>

      {/* Recharts Monthly Cost Comparison Chart */}
      <CostComparisonChart data={chartData} />

      {/* Provider Scenario Grids */}
      {providers.map((prov) => {
        const provScenarios = scenarios.filter((s) => s.provider === prov)

        return (
          <div key={prov} className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              {prov} Cloud Configurations
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {provScenarios.map((scen) => (
                <ScenarioCard
                  key={scen.id}
                  scenario={scen}
                  isSelected={selectedIds[prov] === scen.id}
                  onSelect={() => handleSelectScenario(prov, scen.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Selected Infrastructure Overview & Inline Editor */}
      {selectedScenarios.length > 0 && (
        <div className="space-y-6 pt-6 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Overview of Selected Configuration & Line Items
              </h2>
              <p className="text-xs text-slate-500">
                Review every provisioned instance, database, storage pool, and queue before minting calculator links. You can edit any parameter inline.
              </p>
            </div>
          </div>

          {saveSuccessMsg && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium shadow-xs">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {selectedScenarios.map((scen) => (
            <Card key={scen.id} className="border-slate-200 shadow-xs overflow-hidden">
              <CardHeader className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="uppercase font-bold text-xs bg-white text-slate-800 border-slate-300">
                    {scen.provider}
                  </Badge>
                  <Badge className="capitalize text-xs bg-blue-600">
                    {scen.scenario_type.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    • {scen.resources.length} resources provisioned
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                    onClick={() =>
                      setActiveDeltaModal({
                        isOpen: true,
                        scenarioId: scen.id,
                        provider: scen.provider,
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5 text-blue-600" />
                    <span>Add Service Delta</span>
                  </Button>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-500 block">Total Monthly Cost</span>
                    <span className="text-base font-extrabold text-blue-700">
                      ${scen.monthly_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-medium text-slate-500">/mo</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <Table className="min-w-[880px]">
                  <TableHeader className="bg-slate-100/60 text-[11px] font-semibold text-slate-700">
                    <TableRow>
                      <TableHead className="w-[280px]">Resource Name</TableHead>
                      <TableHead className="w-[100px]">Service</TableHead>
                      <TableHead className="w-[110px]">Region</TableHead>
                      <TableHead className="w-[150px]">SKU / Tier</TableHead>
                      <TableHead className="w-[70px] text-center">Qty</TableHead>
                      <TableHead>Availability Config</TableHead>
                      <TableHead className="text-right w-[110px]">Monthly (USD)</TableHead>
                      <TableHead className="text-right w-[85px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs divide-y divide-slate-100">
                    {scen.resources.map((r: any) => {
                      const isEditing = editingResourceId === r.id
                      return (
                        <TableRow key={r.id} className={isEditing ? 'bg-blue-50/60' : 'hover:bg-slate-50/50'}>
                          <TableCell className="font-medium text-slate-900">
                            {isEditing ? (
                              <Input
                                value={editForm.resource_name}
                                onChange={(e) => setEditForm({ ...editForm, resource_name: e.target.value })}
                                className="h-7 text-xs"
                              />
                            ) : (
                              <span>{r.resource_name}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="capitalize px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                              {r.service_family || r.service_name || 'service'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editForm.region}
                                onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                                className="h-7 text-xs font-mono"
                              />
                            ) : (
                              <span className="font-mono text-slate-600 text-[11px]">{r.region || 'us-east-2'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editForm.sku}
                                onChange={(e) => handleSkuChange(e.target.value)}
                                className="h-7 text-xs font-mono"
                              />
                            ) : (
                              <span className="font-mono text-slate-800 font-semibold text-[11px]">{r.sku}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEditing ? (
                              <Input
                                type="number"
                                min={1}
                                value={editForm.quantity}
                                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                                className="h-7 text-xs text-center w-14 mx-auto"
                              />
                            ) : (
                              <span className="font-semibold text-slate-800">{r.quantity}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-500 text-[11px]">
                            {r.availability_config || 'Standard'}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-slate-900">
                            {isEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={editForm.monthly_cost_usd}
                                onChange={(e) => setEditForm({ ...editForm, monthly_cost_usd: parseFloat(e.target.value) || 0 })}
                                className="h-7 text-xs text-right font-mono w-24 ml-auto"
                              />
                            ) : (
                              `$${Number(r.monthly_cost_usd || 0).toFixed(2)}`
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => saveEditResource(scen.id, r.id)}
                                  disabled={savingResourceId === r.id}
                                  className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingResourceId(null)}
                                  className="h-7 px-2 text-[11px]"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditResource(r)}
                                className="h-7 px-2 text-[11px] gap-1 text-slate-600 hover:text-blue-600"
                              >
                                <Edit2 className="h-3 w-3" />
                                <span>Edit</span>
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
          ))}
        </div>
      )}

      {/* Add Service Modal */}
      {activeDeltaModal.isOpen && (
        <AddServiceModal
          isOpen={activeDeltaModal.isOpen}
          onClose={() => setActiveDeltaModal((prev) => ({ ...prev, isOpen: false }))}
          projectId={id}
          scenarioId={activeDeltaModal.scenarioId}
          provider={activeDeltaModal.provider}
          onServiceAdded={fetchScenarios}
        />
      )}
    </div>
  )
}
