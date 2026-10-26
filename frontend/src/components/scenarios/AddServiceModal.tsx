'use client'

import React, { useState } from 'react'
import { Plus, X, Layers, Sparkles, Loader2, MessageSquare, Check, HelpCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { getToken } from '@/lib/auth'

export interface PresetCatalogItem {
  name: string
  service_name: string
  service_family: string
  sku: string
  defaultQty: number
  estimatedCost: number
  unit: string
  rationale: string
  provider: 'aws' | 'azure'
}

const COMMON_DELTA_PRESETS: PresetCatalogItem[] = [
  // AWS
  {
    name: 'ElastiCache Redis Cluster',
    service_name: 'Amazon ElastiCache',
    service_family: 'database',
    sku: 'cache.r6g.large',
    defaultQty: 2,
    estimatedCost: 182.50,
    unit: '2 nodes (Multi-AZ)',
    rationale: 'In-memory caching layer for session storage, sub-millisecond query caching, and rate limiting.',
    provider: 'aws',
  },
  {
    name: 'AWS WAF (Web Application Firewall)',
    service_name: 'AWS WAF',
    service_family: 'security',
    sku: 'WAF-WebACL-Rules',
    defaultQty: 1,
    estimatedCost: 15.00,
    unit: '1 WebACL + Managed Rules',
    rationale: 'DDoS mitigation, OWASP Top 10 protection, and bot control at edge.',
    provider: 'aws',
  },
  {
    name: 'Amazon CloudFront CDN',
    service_name: 'Amazon CloudFront',
    service_family: 'networking',
    sku: 'CloudFront-DataTransfer-1TB',
    defaultQty: 1,
    estimatedCost: 85.00,
    unit: '1 TB Data Transfer Out',
    rationale: 'Global edge content delivery network with SSL termination and low latency asset serving.',
    provider: 'aws',
  },
  {
    name: 'Amazon SQS Queue Tier',
    service_name: 'Amazon SQS',
    service_family: 'messaging',
    sku: 'SQS-Standard',
    defaultQty: 1,
    estimatedCost: 2.00,
    unit: '5M Requests/mo',
    rationale: 'Decoupled asynchronous background worker queues for reliable processing.',
    provider: 'aws',
  },
  {
    name: 'Amazon S3 Standard Bucket',
    service_name: 'Amazon Simple Storage Service',
    service_family: 'storage',
    sku: 'S3-Standard-500GB',
    defaultQty: 1,
    estimatedCost: 11.50,
    unit: '500 GB Storage',
    rationale: 'Object storage for user uploads, persistent documents, and backups.',
    provider: 'aws',
  },
  // Azure
  {
    name: 'Azure Cache for Redis',
    service_name: 'Azure Cache for Redis',
    service_family: 'database',
    sku: 'Standard_C2',
    defaultQty: 1,
    estimatedCost: 135.00,
    unit: 'Standard 2.5 GB',
    rationale: 'High-throughput low-latency data store for application session caching.',
    provider: 'azure',
  },
  {
    name: 'Azure Front Door / CDN',
    service_name: 'Azure Front Door',
    service_family: 'networking',
    sku: 'Standard-Profile',
    defaultQty: 1,
    estimatedCost: 35.00,
    unit: '1 Profile + Routing Rules',
    rationale: 'Global secure web application delivery network and intelligent routing.',
    provider: 'azure',
  },
  {
    name: 'Azure Firewall Tier',
    service_name: 'Azure Firewall',
    service_family: 'security',
    sku: 'Standard_Firewall',
    defaultQty: 1,
    estimatedCost: 295.00,
    unit: '1 Deployment',
    rationale: 'Stateful firewall with built-in high availability and unrestricted cloud scalability.',
    provider: 'azure',
  },
  {
    name: 'Azure Blob Storage Hot Tier',
    service_name: 'Azure Storage',
    service_family: 'storage',
    sku: 'Blob-Standard-Hot-500GB',
    defaultQty: 1,
    estimatedCost: 10.40,
    unit: '500 GB Storage',
    rationale: 'Massively scalable object storage for cloud-native workloads and archives.',
    provider: 'azure',
  },
]

interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  scenarioId: string
  provider: 'aws' | 'azure'
  onServiceAdded: () => void
}

export function AddServiceModal({
  isOpen,
  onClose,
  projectId,
  scenarioId,
  provider,
  onServiceAdded,
}: AddServiceModalProps) {
  // Tab: 'ai_natural' (default requested) or 'presets'
  const [activeTab, setActiveTab] = useState<'ai_natural' | 'presets'>('ai_natural')

  // Natural Language State
  const [nlPrompt, setNlPrompt] = useState('')
  const [analyzingNl, setAnalyzingNl] = useState(false)
  const [clarificationQuestions, setClarificationQuestions] = useState<any[]>([])
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({})
  const [synthesizedResource, setSynthesizedResource] = useState<any | null>(null)
  const [estimatedDeltaCost, setEstimatedDeltaCost] = useState<number | null>(null)
  const [analysisExplanation, setAnalysisExplanation] = useState('')

  // Manual / Preset State
  const [selectedPreset, setSelectedPreset] = useState<PresetCatalogItem | null>(null)
  const [customName, setCustomName] = useState('')
  const [customFamily, setCustomFamily] = useState('compute')
  const [customSku, setCustomSku] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [customCost, setCustomCost] = useState<number | ''>('')
  const [submitting, setSubmitting] = useState(false)

  const availablePresets = COMMON_DELTA_PRESETS.filter(
    (p) => p.provider === (provider?.toLowerCase() === 'azure' ? 'azure' : 'aws')
  )

  const handleSelectPreset = (preset: PresetCatalogItem) => {
    setSelectedPreset(preset)
    setCustomName(preset.name)
    setCustomFamily(preset.service_family)
    setCustomSku(preset.sku)
    setQuantity(preset.defaultQty)
    setCustomCost(preset.estimatedCost)
  }

  // 1. Natural Language Analysis (with dynamic clarification questions)
  const handleAnalyzeNaturalLanguage = async (answersOverride?: Record<string, string>) => {
    if (!nlPrompt.trim()) {
      toast.error('Please enter what service or workload you want to add')
      return
    }

    setAnalyzingNl(true)
    try {
      const token = getToken()
      const payload = {
        text: nlPrompt.trim(),
        provider: provider || 'aws',
        context_answers: answersOverride || clarificationAnswers,
      }

      const res = await fetch(`/api/v1/projects/${projectId}/scenarios/${scenarioId}/delta-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Analysis failed')
      }

      const data = await res.json()
      if (data.needs_clarification && data.clarification_questions?.length > 0) {
        setClarificationQuestions(data.clarification_questions)
        setSynthesizedResource(null)
        setAnalysisExplanation(data.explanation || 'Please answer clarification questions to size accurately.')
      } else if (data.suggested_resource) {
        setClarificationQuestions([])
        setSynthesizedResource(data.suggested_resource)
        setEstimatedDeltaCost(data.estimated_monthly_delta)
        setAnalysisExplanation(data.explanation || 'Service synthesized successfully.')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error analyzing request')
    } finally {
      setAnalyzingNl(false)
    }
  }

  const handleAnswerClarification = (fieldKey: string, value: string) => {
    const updated = { ...clarificationAnswers, [fieldKey]: value }
    setClarificationAnswers(updated)
    // Check if all questions answered
    const remaining = clarificationQuestions.filter((q) => !updated[q.field_key || q.id])
    if (remaining.length === 0) {
      handleAnalyzeNaturalLanguage(updated)
    }
  }

  // 2. Commit Synthesized / Preset Resource to Scenario
  const handleCommitResource = async (resourceToCommit: any) => {
    setSubmitting(true)
    try {
      const token = getToken()
      const payload = {
        resource_name: resourceToCommit.resource_name,
        service_family: resourceToCommit.service_family,
        service_name: resourceToCommit.service_name,
        region: resourceToCommit.region || (provider === 'azure' ? 'eastus' : 'us-east-2'),
        sku: resourceToCommit.sku,
        quantity: Math.max(1, resourceToCommit.quantity || 1),
        availability_config: resourceToCommit.availability_config || 'Multi-AZ',
        pricing_model: resourceToCommit.pricing_model || 'on-demand',
        config: resourceToCommit.config || {},
        rationale: resourceToCommit.rationale || 'Added post-estimate via delta update workflow',
      }

      const res = await fetch(`/api/v1/projects/${projectId}/scenarios/${scenarioId}/resources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Failed to add resource delta')
      }

      toast.success(`Added ${payload.resource_name} (+Δ update recalculated)`)
      onServiceAdded()
      onClose()
      // reset
      setNlPrompt('')
      setClarificationQuestions([])
      setClarificationAnswers({})
      setSynthesizedResource(null)
      setSelectedPreset(null)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error adding service')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-white border-slate-200 shadow-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
              <Layers className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Add Service Line-Item (Post-Estimate Delta Update)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Describe in plain English what you want to add, or choose quick presets from the catalog.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab switch: Natural Language vs Catalog Presets */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mt-2">
          <button
            type="button"
            onClick={() => setActiveTab('ai_natural')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'ai_natural'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Natural Language Delta</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'presets'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Catalog Presets & Manual</span>
          </button>
        </div>

        {/* TAB 1: Natural Language Discovery with Dynamic Clarification */}
        {activeTab === 'ai_natural' && (
          <div className="space-y-4 my-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Describe the additional service or capability:
              </Label>
              <div className="flex gap-2">
                <Input
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder="e.g., We also need a multi-az Redis cache for sessions, or a 2TB S3 bucket for archival"
                  className="text-xs h-9"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAnalyzeNaturalLanguage()
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => handleAnalyzeNaturalLanguage()}
                  disabled={analyzingNl || !nlPrompt.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5 shrink-0 h-9 px-3"
                >
                  {analyzingNl ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Analyze</span>
                    </>
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <span>Examples:</span>
                <button
                  type="button"
                  onClick={() => {
                    setNlPrompt('We need a Redis caching cluster for session state')
                    setClarificationQuestions([])
                    setSynthesizedResource(null)
                  }}
                  className="text-blue-600 hover:underline"
                >
                  &quot;Redis cache cluster&quot;
                </button>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={() => {
                    setNlPrompt('Add an S3 bucket for media storage')
                    setClarificationQuestions([])
                    setSynthesizedResource(null)
                  }}
                  className="text-blue-600 hover:underline"
                >
                  &quot;S3 bucket for media&quot;
                </button>
                <span>&bull;</span>
                <button
                  type="button"
                  onClick={() => {
                    setNlPrompt('Add AWS WAF web firewall with managed rules')
                    setClarificationQuestions([])
                    setSynthesizedResource(null)
                  }}
                  className="text-blue-600 hover:underline"
                >
                  &quot;WAF with managed rules&quot;
                </button>
              </div>
            </div>

            {/* Dynamic Clarification Questions Card */}
            {clarificationQuestions.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <HelpCircle className="h-4 w-4 text-amber-600" />
                  <span>Clarification Required Before Sizing</span>
                </div>
                <p className="text-[11px] text-amber-800">{analysisExplanation}</p>

                <div className="space-y-3 pt-1">
                  {clarificationQuestions.map((q) => {
                    const currentAns = clarificationAnswers[q.field_key || q.id]
                    return (
                      <div key={q.id} className="space-y-1.5 bg-white p-2.5 rounded-md border border-amber-200 shadow-2xs">
                        <div className="text-xs font-semibold text-slate-900">{q.question}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt: string) => {
                            const isChosen = currentAns === opt
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleAnswerClarification(q.field_key || q.id, opt)}
                                className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                                  isChosen
                                    ? 'bg-blue-600 text-white border-blue-600 font-medium'
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {opt}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Synthesized Resource Review Card */}
            {synthesizedResource && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-100 rounded-md">
                      <Check className="h-4 w-4 text-emerald-700" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {synthesizedResource.resource_name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {synthesizedResource.service_name} &bull; {synthesizedResource.sku} &bull; Qty: {synthesizedResource.quantity}
                      </div>
                    </div>
                  </div>
                  {estimatedDeltaCost !== null && (
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-blue-600">
                        +${estimatedDeltaCost.toFixed(2)}/mo
                      </div>
                      <div className="text-[10px] text-slate-400">Incremental Delta</div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-600 bg-white p-2.5 rounded border border-emerald-100">
                  {synthesizedResource.rationale || analysisExplanation}
                </p>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => {
                      setSynthesizedResource(null)
                      setClarificationAnswers({})
                    }}
                  >
                    Modify Prompt
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={submitting}
                    onClick={() => handleCommitResource(synthesizedResource)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 h-8 font-semibold shadow-xs"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Recalculating Delta...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        <span>Confirm & Add to Estimate</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Catalog Presets & Manual Form */}
        {activeTab === 'presets' && (
          <div className="space-y-4 my-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Quick Pick Recommended Services ({provider.toUpperCase()})
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-1 border border-slate-100 rounded-lg bg-slate-50/50">
                {availablePresets.map((preset) => {
                  const isSelected = selectedPreset?.name === preset.name
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-500'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-900 leading-tight">{preset.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{preset.sku}</div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100 text-[11px]">
                        <span className="text-slate-500">{preset.unit}</span>
                        <span className="font-bold text-blue-600">+${preset.estimatedCost.toFixed(2)}/mo</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!customName.trim() || !customSku.trim()) {
                  toast.error('Please specify a resource name and SKU')
                  return
                }
                handleCommitResource({
                  resource_name: customName.trim(),
                  service_family: customFamily,
                  service_name: selectedPreset?.service_name || customName.trim(),
                  region: provider === 'azure' ? 'eastus' : 'us-east-2',
                  sku: customSku.trim(),
                  quantity: Math.max(1, quantity),
                  availability_config: 'Multi-AZ',
                  pricing_model: 'on-demand',
                  config: customCost !== '' ? { estimated_cost: Number(customCost) } : {},
                  rationale: selectedPreset?.rationale || 'Added post-estimate via delta update workflow',
                })
              }}
              className="space-y-3 pt-2 border-t border-slate-100"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1 block">Resource Name</Label>
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Redis Primary Cache"
                    className="h-8 text-xs"
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1 block">Service Family</Label>
                  <select
                    value={customFamily}
                    onChange={(e) => setCustomFamily(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-slate-200 bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="compute">Compute / VM</option>
                    <option value="database">Database / In-Memory Cache</option>
                    <option value="storage">Object / Block Storage</option>
                    <option value="networking">Networking / CDN / Gateway</option>
                    <option value="security">Security / WAF / Secrets</option>
                    <option value="messaging">Messaging / SQS / Queue</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1 block">SKU / Instance Type</Label>
                  <Input
                    value={customSku}
                    onChange={(e) => setCustomSku(e.target.value)}
                    placeholder="e.g. cache.r6g.large or Standard_C2"
                    className="h-8 text-xs font-mono"
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1 block">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <DialogFooter className="pt-3 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting} className="text-xs">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !customName.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Recalculating Delta...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add to Scenario & Run Delta</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
