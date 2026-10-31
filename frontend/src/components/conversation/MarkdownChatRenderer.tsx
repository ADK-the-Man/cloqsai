'use client'

import React from 'react'

interface MarkdownChatRendererProps {
  content: string
  className?: string
}

export function MarkdownChatRenderer({ content, className = '' }: MarkdownChatRendererProps) {
  if (!content) return null

  // Format inline bold, code, and text
  const formatInline = (text: string) => {
    // Split by bold (**text**) and code (`text`)
    const parts: React.ReactNode[] = []
    let remaining = text

    // Regex for bold **...** and inline code `...`
    const regex = /(\*\*.*?\*\*|`.*?`)/g
    const matches = text.split(regex)

    return matches.map((chunk, i) => {
      if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length >= 4) {
        return (
          <strong key={i} className="font-bold text-slate-900">
            {chunk.slice(2, -2)}
          </strong>
        )
      }
      if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length >= 2) {
        return (
          <code key={i} className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[11px] text-purple-700 border border-slate-200">
            {chunk.slice(1, -1)}
          </code>
        )
      }
      return chunk
    })
  }

  // Parse blocks: tables, headings, lists, paragraphs
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 1. Detect Markdown Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0].split('|').map((s) => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
        const dataRows = tableLines.slice(2).map((r) =>
          r.split('|').map((s) => s.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
        )

        blocks.push(
          <div key={`table-${i}`} className="my-2.5 overflow-x-auto rounded-lg border border-slate-200/90 shadow-2xs">
            <table className="w-full text-left text-[11px] border-collapse bg-white">
              <thead>
                <tr className="bg-purple-50/80 border-b border-purple-100 text-purple-900 font-bold">
                  {headerRow.map((h, hIdx) => (
                    <th key={hIdx} className="py-1.5 px-2.5 whitespace-nowrap">
                      {formatInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-1.5 px-2.5 text-slate-700 leading-tight">
                        {formatInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
    }

    // 2. Headings
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`h3-${i}`} className="font-bold text-xs text-slate-900 mt-2.5 mb-1 flex items-center gap-1.5 border-b border-slate-100 pb-1">
          {formatInline(trimmed.slice(4))}
        </h4>
      )
      i++
      continue
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`h2-${i}`} className="font-bold text-sm text-purple-950 mt-3 mb-1.5 flex items-center gap-1.5 border-b border-purple-100 pb-1">
          {formatInline(trimmed.slice(3))}
        </h3>
      )
      i++
      continue
    }

    // 3. Bullet list items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const listItems: string[] = []
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().slice(2))
        i++
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1 pl-4 list-disc text-slate-700 text-xs">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // 4. Numbered list items
    if (/^\d+\.\s/.test(trimmed)) {
      const numItems: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        numItems.push(lines[i].trim().replace(/^\d+\.\s/, ''))
        i++
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-1.5 space-y-1 pl-4 list-decimal text-slate-700 text-xs">
          {numItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // 5. Standard paragraph or blank line
    if (trimmed) {
      blocks.push(
        <p key={`p-${i}`} className="my-1 text-slate-800 leading-relaxed text-xs">
          {formatInline(trimmed)}
        </p>
      )
    }
    i++
  }

  return <div className={`space-y-1 select-text ${className}`}>{blocks}</div>
}
