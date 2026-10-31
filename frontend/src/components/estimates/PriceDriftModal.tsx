'use client'

import React from 'react'
import { X, RefreshCw, AlertTriangle, TrendingDown, TrendingUp, CheckCircle, ExternalLink, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface LineItemDrift {
  resource_id: string
  resource_name: string
  previous_cost_usd: number
  current_cost_usd: number
  variance_usd: number
  variance_percent: number
  change_type: string
  note?: string
}

interface FreshnessReport {
  status: string
  pricing_as_of?: string
  age_days: number
  is_stale: boolean
  drift_amount_usd: number
  drift_percentage: number
  latest_catalog_version: string
  summary_message: string
  line_item_drifts: LineItemDrift[]
}

interface PriceDriftModalProps {
  isOpen: boolean
  onClose: () => void
  scenario: any
  freshness?: FreshnessReport | null
  onSync: (scenarioId: string) => Promise<void>
  isSyncing: boolean
}

export function PriceDriftModal({
  isOpen,
  onClose,
  scenario,
  freshness,
  onSync,
  isSyncing,
}: PriceDriftModalProps) {
  if (!scenario) return null

  const drifts = freshness?.line_item_drifts || []
  const hasDrift = drifts.length > 0 || (freshness?.drift_amount_usd && Math.abs(freshness.drift_amount_usd) > 0.01)
  const isStale = freshness?.is_stale

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>AWS Pricing Freshness & Rate Drift Analysis</span>
              </DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Compare active estimate line items against live AWS Pricing Calculator rates and catalog revisions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1 text-xs">
          {/* Status Banner */}
          <div className={`p-3.5 rounded-lg border flex items-start gap-3 ${
            hasDrift
              ? 'bg-amber-50/70 border-amber-200 text-amber-950'
              : isStale
              ? 'bg-amber-50/50 border-amber-200 text-amber-900'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
          }`}>
            {hasDrift ? (
              <TrendingDown className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            ) : isStale ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-bold text-xs flex items-center gap-2">
                <span>
                  {hasDrift
                    ? 'Catalog Rate Drift Detected'
                    : isStale
                    ? 'Estimate Stale (>30 Days)'
                    : 'Estimate Rates Up-To-Date'}
                </span>
                <Badge variant="outline" className="text-[10px] bg-white font-mono">
                  {freshness?.latest_catalog_version || 'AWS 2026.10'}
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                {freshness?.summary_message || 'Rates verified with official AWS Pricing Calculator catalog.'}
              </p>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500">Current Cost</span>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                ${Number(scenario.monthly_cost_usd || 0).toFixed(2)}/mo
              </div>
              <span className="text-[10px] text-slate-400">Baseline in scenario</span>
            </div>

            <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500">Net Drift Variance</span>
              <div className={`text-sm font-bold mt-0.5 ${
                (freshness?.drift_amount_usd || 0) < 0
                  ? 'text-emerald-600'
                  : (freshness?.drift_amount_usd || 0) > 0
                  ? 'text-rose-600'
                  : 'text-slate-600'
              }`}>
                {(freshness?.drift_amount_usd || 0) < 0 ? '-' : '+'}
                ${Math.abs(freshness?.drift_amount_usd || 0).toFixed(2)}/mo
              </div>
              <span className="text-[10px] text-slate-400">
                {freshness?.drift_percentage ? `${freshness.drift_percentage}% variance` : 'Zero variance'}
              </span>
            </div>

            <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500">Pricing Age</span>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {freshness?.age_days !== undefined ? `${freshness.age_days} day(s)` : 'Fresh'}
              </div>
              <span className="text-[10px] text-slate-400">
                Last synced: {scenario.pricing_as_of ? new Date(scenario.pricing_as_of).toLocaleDateString() : 'Initial run'}
              </span>
            </div>
          </div>

          {/* Line Item Diff Table */}
          {drifts.length > 0 ? (
            <div className="space-y-2">
              <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider">
                Updated Line Items & Catalog Adjustments
              </span>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50 text-[10px]">
                    <TableRow>
                      <TableHead>Service / Resource</TableHead>
                      <TableHead className="text-right">Previous</TableHead>
                      <TableHead className="text-right">Live Rate</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 text-xs">
                    {drifts.map((d, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-slate-800">
                          <div>{d.resource_name}</div>
                          {d.note && (
                            <div className="text-[10px] text-slate-500 italic mt-0.5">{d.note}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-slate-500">
                          ${d.previous_cost_usd.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-slate-800">
                          ${d.current_cost_usd.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          <span className={d.variance_usd < 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {d.variance_usd < 0 ? '-' : '+'}${Math.abs(d.variance_usd).toFixed(2)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center text-slate-500">
              All line items currently match the latest AWS calculator rates exactly to the cent.
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              Syncing stamps a fresh timestamp and recalculates the full estimate report.
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isSyncing}>
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => onSync(scenario.id)}
                disabled={isSyncing}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs font-semibold text-xs cursor-pointer"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Syncing Rates...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>1-Click Sync Rates</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
