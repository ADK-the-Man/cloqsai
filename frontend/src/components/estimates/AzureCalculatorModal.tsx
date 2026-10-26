'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import {
  ExternalLink,
  Copy,
  Check,
  Download,
  Info,
  Server,
  Database,
  HardDrive,
  Network,
  Shield,
  Layers,
  Sparkles,
  Zap,
  Bookmark,
  FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'

export interface AzureResourceItem {
  resource_name?: string
  service_name?: string
  service_family?: string
  sku?: string
  quantity?: number
  region?: string
  monthly_cost?: number
  rationale?: string
  assumptions?: string
  config?: Record<string, any>
}

interface AzureCalculatorModalProps {
  isOpen: boolean
  onClose: () => void
  projectName: string
  scenarioType: string
  monthlyCost: number
  annualCost?: number
  resources: AzureResourceItem[]
  xlsxArtifactId?: string
  nativePortalArtifactId?: string
  csvArtifactId?: string
}

export function AzureCalculatorModal({
  isOpen,
  onClose,
  projectName,
  scenarioType,
  monthlyCost,
  annualCost,
  resources,
  xlsxArtifactId,
  nativePortalArtifactId,
  csvArtifactId,
}: AzureCalculatorModalProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedBridge, setCopiedBridge] = useState(false)

  const formatCost = (val?: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0)
  }

  const getServiceIcon = (family?: string, name?: string) => {
    const text = `${family || ''} ${name || ''}`.toLowerCase()
    if (text.includes('database') || text.includes('sql') || text.includes('postgres')) {
      return <Database className="h-4 w-4 text-emerald-600" />
    }
    if (text.includes('storage') || text.includes('blob')) {
      return <HardDrive className="h-4 w-4 text-amber-600" />
    }
    if (text.includes('network') || text.includes('vnet') || text.includes('dns') || text.includes('gateway')) {
      return <Network className="h-4 w-4 text-indigo-600" />
    }
    if (text.includes('security') || text.includes('key vault') || text.includes('waf')) {
      return <Shield className="h-4 w-4 text-rose-600" />
    }
    return <Server className="h-4 w-4 text-blue-600" />
  }

  const resolveSlug = (r: AzureResourceItem): string => {
    const text = `${r.resource_name || ''} ${r.service_name || ''} ${r.service_family || ''}`.toLowerCase()
    if (text.includes('aks') || text.includes('kubernetes') || text.includes('k8s')) return 'kubernetes-service'
    if (text.includes('postgres')) return 'postgresql'
    if (text.includes('sql') || text.includes('database') || text.includes('rds')) return 'azure-sql-database'
    if (text.includes('storage') || text.includes('blob') || text.includes('s3') || text.includes('bucket')) return 'storage'
    if (text.includes('redis') || text.includes('cache')) return 'redis-cache'
    if (text.includes('function') || text.includes('serverless') || text.includes('lambda')) return 'functions'
    if (text.includes('app service') || text.includes('web') || text.includes('api')) return 'app-service'
    if (text.includes('cosmos') || text.includes('nosql')) return 'cosmos-db'
    if (text.includes('key vault') || text.includes('secret')) return 'key-vault'
    if (text.includes('network') || text.includes('vnet')) return 'virtual-network'
    return 'virtual-machines'
  }

  const targetSlugs = Array.from(new Set(resources.map(resolveSlug)))
  if (targetSlugs.length === 0) targetSlugs.push('virtual-machines', 'storage')

  // Generate Bookmarklet JavaScript
  const bookmarkletCode = `javascript:(function(){const slugs=${JSON.stringify(
    targetSlugs
  )};let added=0;slugs.forEach(function(s){let b=document.querySelector('button[data-slug="'+s+'"]');if(b){b.click();added++;}else{let inp=document.querySelector('input.product-search');if(inp){inp.value=s;inp.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(function(){let sb=document.querySelector('button[data-slug="'+s+'"]');if(sb){sb.click();added++;}},300);}}});let d=document.createElement('div');d.style.cssText='position:fixed;top:20px;right:20px;z-index:999999;background:#0078d4;color:white;padding:16px 20px;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.35);font-family:Segoe UI,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;gap:12px;';d.innerHTML='<span>✓ CLOQS AI: Populated ${targetSlugs.length} services in your Azure Calculator session! You can now click "Share" or "Export" under your Microsoft account.</span><button onclick="this.parentElement.remove()" style="background:transparent;border:none;color:white;cursor:pointer;font-weight:bold;font-size:16px;">✕</button>';document.body.appendChild(d);setTimeout(function(){if(d)d.remove();},9000);window.scrollTo({top:420,behavior:'smooth'});})();`

  const handleCopySku = (sku: string, idx: number) => {
    navigator.clipboard.writeText(sku)
    setCopiedIndex(idx)
    toast.success(`Copied Azure SKU: ${sku}`)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleCopyAllSpecs = () => {
    const specLines = resources.map((r, i) => {
      return `${i + 1}. ${r.resource_name || r.service_name || 'Resource'}: SKU=${r.sku || 'N/A'}, Qty=${r.quantity || 1}, Region=${r.region || 'default'}, Cost=${formatCost(r.monthly_cost)}/mo`
    })
    const fullText = `=== Azure Estimate Specifications: ${projectName} (${scenarioType}) ===\nTotal Estimated Monthly Cost: ${formatCost(monthlyCost)}/mo\n\nLine Items:\n${specLines.join('\n')}\n\nGenerated by CLOQS AI (Azure Retail Prices API)`
    navigator.clipboard.writeText(fullText)
    setCopiedAll(true)
    toast.success('Copied all Azure SKU specifications to clipboard')
    setTimeout(() => setCopiedAll(false), 2500)
  }

  const handleCopyBridgeScript = () => {
    navigator.clipboard.writeText(bookmarkletCode)
    setCopiedBridge(true)
    toast.success('Copied Azure Portal Auto-Fill script to clipboard')
    setTimeout(() => setCopiedBridge(false), 2500)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 overflow-hidden bg-white border-slate-200 shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-blue-200" />
                  Azure Pricing Calculator Bridge
                </span>
                <Badge className="bg-blue-900/60 text-blue-100 border-blue-400/40 text-[10px] uppercase">
                  {scenarioType.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-xs text-blue-100">
                Official Azure Retail Prices REST API &middot; Live regional pricing for {projectName}
              </p>
            </div>

            <div className="text-right shrink-0">
              <div className="text-2xl font-extrabold tracking-tight text-white">
                {formatCost(monthlyCost)}
                <span className="text-xs font-normal text-blue-200">/mo</span>
              </div>
              {annualCost ? (
                <div className="text-[11px] text-blue-200">
                  {formatCost(annualCost)} / year
                </div>
              ) : (
                <div className="text-[11px] text-blue-200">
                  {formatCost(monthlyCost * 12)} / year
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* 1-Click Azure Portal Bridge Banner */}
          <div className="rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50/70 border border-blue-200 p-4 space-y-3 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-md bg-blue-600 text-white mt-0.5">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                    1-Click Auto-Fill for Azure Pricing Portal (Option B)
                  </h4>
                  <p className="text-xs text-blue-900/80 leading-relaxed mt-0.5">
                    Pre-populate the official Microsoft Azure Calculator with this exact architecture in your own browser so the full estimate dashboard is visible and ready to <strong>Share</strong> or <strong>Export</strong> under your Microsoft account.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* Draggable Bookmarklet */}
              <a
                href={bookmarkletCode}
                onClick={(e) => {
                  e.preventDefault()
                  toast.info('Drag this button to your browser bookmarks bar!')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs cursor-grab active:cursor-grabbing transition-transform active:scale-95"
                title="Drag to your bookmarks bar, then click it when on azure.microsoft.com/pricing/calculator"
              >
                <Bookmark className="h-3.5 w-3.5" />
                <span>⚡ Drag: CLOQS Azure Bridge</span>
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyBridgeScript}
                className="h-7 text-xs gap-1 border-blue-300 text-blue-800 hover:bg-blue-100"
              >
                {copiedBridge ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copiedBridge ? 'Copied Script' : 'Copy Script for Console'}
              </Button>

              <a
                href="https://azure.microsoft.com/en-us/pricing/calculator/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white border border-blue-300 text-blue-800 hover:bg-blue-50 text-xs font-semibold shadow-xs ml-auto transition-colors"
              >
                <span>Step 2: Open Azure Portal</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="text-[11px] text-blue-800/80 bg-white/70 p-2 rounded border border-blue-100 flex items-center gap-2">
              <span className="font-bold shrink-0">Quick Steps:</span>
              <span>1. Drag the blue button to your browser bookmarks. 2. Click "Open Azure Portal". 3. Click the bookmark to auto-populate the estimate instantly!</span>
            </div>
          </div>

          {/* Sized Resources Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
            <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-600" />
                Itemized Workload Bill of Materials ({resources.length} Services)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyAllSpecs}
                className="h-6 text-[11px] gap-1 text-slate-600 hover:text-slate-900"
              >
                {copiedAll ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copiedAll ? 'Copied Specs' : 'Copy All Specs'}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 text-[11px]">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Service & Resource</TableHead>
                  <TableHead>Azure SKU Candidate</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Monthly Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {resources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-slate-400">
                      No Azure resources configured for this scenario.
                    </TableCell>
                  </TableRow>
                ) : (
                  resources.map((res, i) => (
                    <TableRow key={i} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-mono text-[11px] text-slate-400">{i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded bg-slate-100">
                            {getServiceIcon(res.service_family, res.service_name)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {res.resource_name || res.service_name || 'Azure Resource'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {res.service_name || res.service_family || 'Azure Platform'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono border border-slate-200">
                            {res.sku || 'Dynamic Consumption'}
                          </code>
                          {res.sku && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopySku(res.sku || '', i)}
                              className="h-5 w-5 p-0 text-slate-400 hover:text-slate-700"
                              title="Copy SKU"
                            >
                              {copiedIndex === i ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-slate-600">
                        {res.region || 'global / eastus'}
                      </TableCell>
                      <TableCell className="text-center font-medium text-slate-800">
                        {res.quantity ?? 1}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        {formatCost(res.monthly_cost)}
                        <span className="text-[10px] font-normal text-slate-400">/mo</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {nativePortalArtifactId && (
              <a
                href={`/api/v1/artifacts/${nativePortalArtifactId}/download`}
                download
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                title="Downloaded directly from Microsoft Azure Pricing Calculator portal"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-blue-200" />
                <span>Download Native Azure Portal Export (.xlsx)</span>
              </a>
            )}

            {xlsxArtifactId && (
              <a
                href={`/api/v1/artifacts/${xlsxArtifactId}/download`}
                download
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download CLOQS Multi-Sheet Excel</span>
              </a>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={onClose} className="w-full sm:w-auto text-xs">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
