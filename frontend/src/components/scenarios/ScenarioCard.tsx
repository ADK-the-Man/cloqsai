'use client'

import React from 'react'
import { Check, ShieldCheck, Zap, AlertTriangle, Layers } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ScenarioCardProps {
  scenario: {
    id: string
    scenario_type: string
    provider: string
    monthly_cost_usd: number
    annual_cost_usd: number
    resources: Array<{
      id: string
      resource_name: string
      sku: string
      quantity: number
      monthly_cost_usd: number
    }>
    assumptions: string[]
    limitations: string[]
  }
  isSelected: boolean
  onSelect: () => void
}

export function ScenarioCard({ scenario, isSelected, onSelect }: ScenarioCardProps) {
  const getBadgeConfig = () => {
    switch (scenario.scenario_type) {
      case 'cost_optimized':
        return { label: 'Cost-Optimized', icon: Zap, variant: 'secondary' as const, border: 'border-slate-300' }
      case 'high_availability':
        return { label: 'High Availability', icon: ShieldCheck, variant: 'default' as const, border: 'border-purple-300' }
      default:
        return { label: 'Recommended', icon: Layers, variant: 'default' as const, border: 'border-blue-500' }
    }
  }

  const config = getBadgeConfig()
  const Icon = config.icon

  return (
    <Card
      className={cn(
        'relative flex flex-col justify-between transition-all duration-200 cursor-pointer hover:shadow-md border-2',
        isSelected ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/10' : 'border-slate-200'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-1">
          <Badge variant={config.variant} className="gap-1 px-2.5 py-0.5">
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {scenario.provider.toUpperCase()}
          </span>
        </div>

        <div className="mt-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">
              ${scenario.monthly_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-medium text-slate-500">/mo</span>
          </div>
          <div className="text-xs text-slate-500">
            ${scenario.annual_cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2 })} /year
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        {/* Resources preview */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-slate-700">Infrastructure ({scenario.resources.length} items):</span>
            <span className="text-[10px] text-blue-600 font-medium">Scrollable</span>
          </div>
          <div className="space-y-1.5 max-h-[130px] overflow-y-auto pr-1">
            {scenario.resources.map((r) => (
              <div key={r.id} className="flex justify-between items-center text-slate-600 border-b border-slate-100 pb-1">
                <span className="truncate max-w-[140px] font-medium" title={r.resource_name}>{r.resource_name}</span>
                <span className="font-mono text-slate-500 text-[11px]">{r.quantity}x {r.sku}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Assumptions */}
        <div>
          <span className="font-semibold text-slate-700 block mb-1">Workload Profile:</span>
          <ul className="space-y-1 text-slate-500">
            {scenario.assumptions.slice(0, 2).map((asm, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                <span className="line-clamp-1">{asm}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Limitations & Budget Feasibility Analysis */}
        {scenario.limitations && scenario.limitations.length > 0 && (
          <div className="rounded-md bg-amber-50/90 border border-amber-200 p-2.5 text-amber-900 text-[11px] flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-0.5 leading-snug">
              <span className="font-semibold block text-amber-800">
                {scenario.limitations[0].toLowerCase().includes('budget') ? 'Budget Feasibility Analysis:' : 'Engineering Trade-off:'}
              </span>
              <span>{scenario.limitations[0]}</span>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        <Button
          variant={isSelected ? 'default' : 'outline'}
          className={cn('w-full gap-2', isSelected ? 'bg-blue-600' : '')}
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
        >
          {isSelected ? (
            <>
              <Check className="h-4 w-4" />
              Selected Scenario
            </>
          ) : (
            'Select Scenario'
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
