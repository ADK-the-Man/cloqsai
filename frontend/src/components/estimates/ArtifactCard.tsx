'use client'

import React from 'react'
import { FileSpreadsheet, FileText, Download, ShieldCheck } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ArtifactCardProps {
  artifact: {
    id: string
    file_name: string
    file_type: string
    provenance_label: string
    file_size?: number
    checksum?: string
    download_count?: number
    download_url?: string
  }
}

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  const isExcel = artifact.file_type.toLowerCase() === 'xlsx'
  const sizeKb = artifact.file_size ? (artifact.file_size / 1024).toFixed(1) : '0'

  const handleDownload = () => {
    const url = artifact.download_url || `/api/v1/artifacts/${artifact.id}/download`
    const a = document.createElement('a')
    a.href = url
    a.download = artifact.file_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-all">
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2.5 rounded-lg border ${isExcel ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
            {isExcel ? <FileSpreadsheet className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
          </div>

          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-900 truncate" title={artifact.file_name}>
              {artifact.file_name}
            </h4>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-slate-300">
                <ShieldCheck className="h-3 w-3 text-blue-600" />
                {artifact.provenance_label}
              </Badge>
              <span className="text-[11px] text-slate-400">
                {sizeKb} KB
              </span>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          className="gap-1.5 shrink-0 bg-slate-900 hover:bg-slate-800 text-white"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      </CardContent>
    </Card>
  )
}
