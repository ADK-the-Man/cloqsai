'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

interface CostChartProps {
  data: Array<{
    scenario: string
    monthlyCost: number
    annualCost: number
  }>
}

export function CostComparisonChart({ data }: CostChartProps) {
  return (
    <div className="h-72 w-full rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Monthly Spend Comparison (USD)
        </h4>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="scenario" stroke="#64748b" fontSize={11} tickLine={false} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => `$${val}`} />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Monthly Cost']}
            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
          />
          <Bar dataKey="monthlyCost" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={42} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
