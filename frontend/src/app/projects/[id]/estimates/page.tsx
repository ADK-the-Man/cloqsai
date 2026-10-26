'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { DownloadCloud, ArrowLeft, RefreshCw, CheckCircle2, ShieldCheck, ExternalLink, Edit2, Layers, Loader2, Plus, Zap, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { JobStatusCard } from '@/components/estimates/JobStatusCard'
import { ArtifactCard } from '@/components/estimates/ArtifactCard'
import { AddServiceModal } from '@/components/scenarios/AddServiceModal'
import { AzureCalculatorModal } from '@/components/estimates/AzureCalculatorModal'
import { PromptEditorCard } from '@/components/conversation/PromptEditorCard'
import { getToken } from '@/lib/auth'

export default function EstimatesPage() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [scenarios, setScenarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showAzureSkus, setShowAzureSkus] = useState(false)
  const [isAzureModalOpen, setIsAzureModalOpen] = useState(false)
  const [activeDeltaModal, setActiveDeltaModal] = useState<{ isOpen: boolean; scenarioId: string; provider: 'aws' | 'azure' }>({
    isOpen: false,
    scenarioId: '',
    provider: 'aws',
  })
  const [runningDeltaEstimate, setRunningDeltaEstimate] = useState(false)

  const handleRunDeltaEstimate = async (scenarioId: string) => {
    setRunningDeltaEstimate(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/estimates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scenario_ids: [scenarioId] }),
      })
      if (res.ok) {
        toast.success('Delta recalculation pipeline started!')
        fetchEstimates()
      } else {
        toast.error('Failed to start delta estimate')
      }
    } catch (err) {
      console.error(err)
      toast.error('Error triggering delta estimate')
    } finally {
      setRunningDeltaEstimate(false)
    }
  }

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([fetchEstimates(), fetchScenarios()])
      toast.success('Estimates & pipeline statuses refreshed')
    } catch (err) {
      console.error(err)
      toast.error('Failed to refresh status')
    } finally {
      setTimeout(() => {
        setIsRefreshing(false)
      }, 500)
    }
  }

  const fetchEstimates = async () => {
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/estimates`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setJobs(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchProject = async () => {
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setProject(data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchScenarios = async () => {
    try {
      const token = getToken()
      const res = await fetch(`/api/v1/projects/${id}/scenarios`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setScenarios(data)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (!id) return
    fetchProject()
    fetchEstimates()
    fetchScenarios()

    // Poll every 2.5s while any job is in progress
    const interval = setInterval(() => {
      fetchEstimates()
    }, 2500)

    return () => clearInterval(interval)
  }, [id])

  const handleRetry = async (jobId: string) => {
    try {
      const token = getToken()
      await fetch(`/api/v1/projects/${id}/estimates/${jobId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchEstimates()
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  // Collect all artifacts across completed jobs
  const allArtifacts = jobs.flatMap((j) => j.artifacts || [])

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Pricing Estimates & Downloadable Reports
          </h1>
          <p className="text-xs text-slate-500">
            Automated pricing calculation, shareable estimate URLs, and verified CSV/Excel workbook exports.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="text-xs gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
        </Button>
      </div>

      {/* Editable Initial Prompt & Re-Run Trigger */}
      <PromptEditorCard
        projectId={id}
        onRerun={async () => {
          await fetchScenarios()
          await fetchEstimates()
        }}
      />

      {/* Section 1: Official Cloud Provider Calculator Estimates */}
      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            1. Direct Official Cloud Provider Estimates
          </h3>
          <p className="text-xs text-slate-500">
            Interactive calculator estimates with provisioned services. Open these to share live links with clients or export native cloud provider files directly.
          </p>
        </div>

        {(() => {
          const awsJob = jobs.find((j) => j.provider === 'aws' && j.job_metadata?.estimate_url && j.job_metadata.estimate_url.includes('?id='))
            || jobs.find((j) => j.provider === 'aws')
          const awsUrl = awsJob?.job_metadata?.estimate_url
          const hasAwsData = Boolean(awsUrl && awsUrl.includes('?id='))

          const azureScenario = scenarios.find((s) => s.provider === 'azure')
          const azureJob = jobs.find((j) => j.provider === 'azure')
          const azureResources = azureScenario?.resources || azureJob?.job_metadata?.resources || []
          const azureMonthlyCost = azureScenario?.monthly_cost_usd || azureJob?.job_metadata?.monthly_cost || 0
          const azureAnnualCost = azureScenario?.annual_cost_usd || azureJob?.job_metadata?.annual_cost || (azureMonthlyCost * 12)
          const azureUrl = azureJob?.job_metadata?.estimate_url || 'https://azure.microsoft.com/en-us/pricing/calculator/'

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="border-amber-200 bg-amber-50/50 shadow-xs">
                <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">AWS Pricing Calculator (Saved Estimate)</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 font-semibold">Direct Provider Link</span>
                    </div>
                    <p className="text-xs text-amber-900/80 leading-relaxed">
                      {hasAwsData
                        ? 'Populated with your compute nodes, database, storage, network egress, and cache. You can share this link with clients or click "Export" inside the AWS Calculator to download AWS\'s native CSV.'
                        : 'Official link will populate automatically once the AWS calculation pipeline completes.'}
                    </p>
                  </div>
                  <div>
                    {hasAwsData ? (
                      <a
                        href={awsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors"
                      >
                        <span>Open Live AWS Estimate</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-xs font-medium">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>Generating Live AWS Link...</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/50 shadow-xs">
                <CardContent className="p-4 flex flex-col justify-between h-full gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Azure Pricing Calculator</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-200/80 text-blue-900 font-semibold">Live Retail API Verified</span>
                    </div>
                    <div className="flex items-baseline gap-2 pt-1">
                      <span className="text-xl font-extrabold text-blue-950">
                        {azureMonthlyCost > 0 ? `$${azureMonthlyCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo` : 'Calculating...'}
                      </span>
                      {azureAnnualCost > 0 && (
                        <span className="text-[11px] text-blue-700 font-medium">
                          (${azureAnnualCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/yr)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-blue-900/80 leading-relaxed">
                      Microsoft Azure requires an active Microsoft account login to persist saved cloud estimates on <code className="text-[10px] bg-blue-100 px-1 py-0.5 rounded font-mono">azure.com/e/</code>. CLOQS AI has itemized and verified all line items via the official Azure Retail Prices API.
                    </p>
                  </div>

                  {showAzureSkus && azureResources.length > 0 && (
                    <div className="bg-white/90 p-2.5 rounded border border-blue-200 text-[11px] text-blue-950 space-y-1 font-mono max-h-48 overflow-y-auto">
                      {azureResources.map((res: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between py-0.5 border-b border-blue-50 last:border-0">
                          <span className="truncate max-w-[220px]">
                            • {res.resource_name || res.service_name}: <span className="font-semibold">{res.sku || 'Dynamic'}</span>
                          </span>
                          <span className="font-bold text-blue-800 ml-2 shrink-0">
                            ${(res.monthly_cost || 0).toFixed(2)}/mo
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => setIsAzureModalOpen(true)}
                      className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Interactive Azure Calculator</span>
                    </Button>
                    <a
                      href={azureUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-blue-300 bg-white hover:bg-blue-50 text-blue-800 text-xs font-medium shadow-xs transition-colors"
                    >
                      <span>Azure Portal</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAzureSkus(!showAzureSkus)}
                      className="h-7 text-[11px] px-2 text-blue-800 hover:bg-blue-100 cursor-pointer"
                    >
                      {showAzureSkus ? 'Hide SKUs' : `View ${azureResources.length || ''} SKUs`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })()}
      </div>

      {/* Section 2: Active Pipeline Jobs */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          2. Calculator Execution Pipelines
        </h3>

        {jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
            No pricing estimates queued yet. Return to Scenarios to select a configuration.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job) => (
              <JobStatusCard
                key={job.id}
                job={job}
                onRetry={() => handleRetry(job.id)}
                onViewAzureModal={job.provider === 'azure' ? () => setIsAzureModalOpen(true) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Generated Artifacts Section */}
      {allArtifacts.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                3. Application-Generated Financial Reports (CSV & Excel)
              </h3>
              <p className="text-xs text-slate-500">
                Detailed workload cost models with SKU sizing, pricing assumptions, SHA256 integrity verification, and embedded official estimator links.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 font-medium shrink-0">
              <ShieldCheck className="h-3.5 w-3.5" />
              Integrity Verified
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allArtifacts.map((art) => (
              <ArtifactCard key={art.id} artifact={art} />
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Infrastructure Workload Overview & Line Items Breakdown */}
      {scenarios.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                4. Infrastructure Resources & Sizing Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Complete list of all sized nodes, storage buckets, databases, and network services sent to provider calculators.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8 border-blue-300 text-blue-700 bg-blue-50/50 hover:bg-blue-100/60 font-medium cursor-pointer"
                onClick={() => {
                  const targetScen = scenarios.find((s) => s.scenario_type === 'recommended') || scenarios[0]
                  if (targetScen) {
                    setActiveDeltaModal({
                      isOpen: true,
                      scenarioId: targetScen.id,
                      provider: targetScen.provider,
                    })
                  }
                }}
              >
                <Plus className="h-3.5 w-3.5 text-blue-600" />
                <span>Add Service Delta</span>
              </Button>
              <Button asChild variant="outline" size="sm" className="text-xs gap-1.5 h-8 font-medium">
                <Link href={`/projects/${id}/scenarios`}>
                  <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                  <span>Customize in Scenarios</span>
                </Link>
              </Button>
            </div>
          </div>

          {scenarios
            .filter((s) => s.scenario_type === 'recommended' || scenarios.length <= 2)
            .map((scen) => (
              <Card key={scen.id} className="border-slate-200 shadow-xs overflow-hidden">
                <CardHeader className="p-3.5 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="uppercase font-bold text-[10px] bg-white text-slate-800">
                      {scen.provider}
                    </Badge>
                    <Badge className="capitalize text-[10px] bg-blue-600">
                      {scen.scenario_type.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-slate-500 font-medium">
                      ({scen.resources.length} active line items)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900">
                        ${scen.monthly_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleRunDeltaEstimate(scen.id)}
                      disabled={runningDeltaEstimate}
                      className="h-7 text-[11px] px-2.5 bg-blue-600 hover:bg-blue-700 text-white gap-1 shadow-2xs cursor-pointer"
                    >
                      {runningDeltaEstimate ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3 text-amber-300" />
                      )}
                      <span>Recalculate Estimate</span>
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {/* Three-Tier Enterprise TCO Reconciliation Breakdown */}
                  {(() => {
                    const isOps = (r: any) => {
                      const fam = (r.service_family || '').toLowerCase()
                      const name = (r.resource_name || '').toLowerCase()
                      return fam === 'monitoring' || name.includes('cloudwatch') || name.includes('monitor') || name.includes('insights')
                    }
                    const opsCost = scen.resources.filter(isOps).reduce((acc: number, r: any) => acc + Number(r.monthly_cost_usd || 0), 0)
                    const infraCost = Math.max(0, scen.monthly_cost_usd - opsCost)

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 bg-slate-50/50 border-b border-slate-200 text-xs">
                        <div className="p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Tier 1: Direct Infrastructure</span>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">${infraCost.toFixed(2)}/mo</div>
                          <p className="text-[10px] text-slate-400 mt-0.5">Direct 1:1 match with official cloud calculator link.</p>
                        </div>
                        <div className="p-2.5 rounded-md bg-white border border-slate-200 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Tier 2: Operational Telemetry</span>
                          <div className="text-sm font-bold text-slate-900 mt-0.5">${opsCost.toFixed(2)}/mo</div>
                          <p className="text-[10px] text-slate-400 mt-0.5">Container Insights, log retention, and alarms.</p>
                        </div>
                        <div className="p-2.5 rounded-md bg-blue-50/80 border border-blue-200 shadow-2xs">
                          <span className="text-[10px] uppercase font-bold text-blue-900 tracking-wider">Tier 3: Total Enterprise TCO</span>
                          <div className="text-sm font-bold text-blue-950 mt-0.5">${scen.monthly_cost_usd.toFixed(2)}/mo</div>
                          <p className="text-[10px] text-blue-700 mt-0.5">Complete monthly production budget (Infra + Ops).</p>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="overflow-x-auto w-full">
                    <Table className="min-w-[800px]">
                      <TableHeader className="bg-slate-100/50 text-[11px] font-semibold text-slate-600">
                        <TableRow>
                          <TableHead className="w-[300px]">Resource Name</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Region</TableHead>
                          <TableHead>SKU / Tier</TableHead>
                          <TableHead className="w-[60px] text-center">Qty</TableHead>
                          <TableHead>Availability Tier</TableHead>
                          <TableHead className="text-right">Monthly (USD)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs divide-y divide-slate-100">
                        {scen.resources.map((r: any) => (
                          <TableRow key={r.id} className="hover:bg-slate-50/50">
                            <TableCell className="font-medium text-slate-900">
                              {r.resource_name}
                            </TableCell>
                            <TableCell>
                              <span className="capitalize px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                                {r.service_family || r.service_name || 'service'}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-slate-600 text-[11px]">
                              {r.region || 'us-east-2'}
                            </TableCell>
                            <TableCell className="font-mono font-semibold text-slate-800 text-[11px]">
                              {r.sku}
                            </TableCell>
                            <TableCell className="text-center font-semibold text-slate-800">
                              {r.quantity}
                            </TableCell>
                            <TableCell className="text-slate-500 text-[11px]">
                              {r.availability_config || 'Standard'}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-slate-900">
                              ${Number(r.monthly_cost_usd || 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Delta Service Modal */}
      {activeDeltaModal.isOpen && (
        <AddServiceModal
          isOpen={activeDeltaModal.isOpen}
          onClose={() => setActiveDeltaModal((prev) => ({ ...prev, isOpen: false }))}
          projectId={id}
          scenarioId={activeDeltaModal.scenarioId}
          provider={activeDeltaModal.provider}
          onServiceAdded={() => {
            fetchScenarios()
            fetchEstimates()
          }}
        />
      )}

      {/* Azure Interactive Calculator Bridge Modal */}
      {(() => {
        const azureScenario = scenarios.find((s) => s.provider === 'azure')
        const azureJob = jobs.find((j) => j.provider === 'azure')
        const azureResources = azureScenario?.resources || azureJob?.job_metadata?.resources || []
        const azureMonthlyCost = azureScenario?.monthly_cost_usd || azureJob?.job_metadata?.monthly_cost || 0
        const azureAnnualCost = azureScenario?.annual_cost_usd || azureJob?.job_metadata?.annual_cost || (azureMonthlyCost * 12)
        const azureScenarioType = azureScenario?.scenario_type || azureJob?.job_metadata?.scenario_type || 'Recommended'
        const azureXlsxArtifact = allArtifacts.find((a) => a.file_type === 'xlsx' && (a.file_name.toLowerCase().includes('azure') || azureJob?.artifacts?.some((ja: any) => ja.id === a.id)))
        const nativePortalArtifact = allArtifacts.find((a) => a.provenance === 'native_calculator' || a.file_name.toLowerCase().includes('native'))
        const azureCsvArtifact = allArtifacts.find((a) => a.file_type === 'csv' && (a.file_name.toLowerCase().includes('azure') || azureJob?.artifacts?.some((ja: any) => ja.id === a.id)))

        return (
          <AzureCalculatorModal
            isOpen={isAzureModalOpen}
            onClose={() => setIsAzureModalOpen(false)}
            projectName={project?.name || 'Azure Workload Architecture'}
            scenarioType={azureScenarioType}
            monthlyCost={azureMonthlyCost}
            annualCost={azureAnnualCost}
            resources={azureResources}
            xlsxArtifactId={azureXlsxArtifact?.id}
            nativePortalArtifactId={nativePortalArtifact?.id}
            csvArtifactId={azureCsvArtifact?.id}
          />
        )
      })()}
    </div>
  )
}
