/**
 * Diagram Export Utility for CLOQS AI Architecture Canvas.
 * Supports:
 * - High-Res PNG (Raster for slides and reports)
 * - Scalable Vector SVG (Vector for Figma, Adobe Illustrator, Inkscape)
 * - Draw.io / Diagrams.net XML (.drawio format - fully editable visual graph)
 * - Architecture JSON Spec
 */

import { toPng, toSvg } from 'html-to-image'

export async function downloadCanvasAsPng(containerEl: HTMLElement, filename = 'cloud-architecture.png') {
  try {
    const dataUrl = await toPng(containerEl, {
      backgroundColor: '#ffffff',
      quality: 0.95,
      pixelRatio: 2,
      filter: (node: HTMLElement) => {
        // Exclude floating controls and overlays from screenshot
        if (node.classList) {
          if (
            node.classList.contains('react-flow__controls') ||
            node.classList.contains('react-flow__minimap') ||
            node.classList.contains('react-flow__attribution') ||
            node.dataset?.exportIgnore === 'true'
          ) {
            return false
          }
        }
        return true
      },
    })

    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
    return true
  } catch (error) {
    console.error('Failed to export PNG', error)
    throw error
  }
}

export async function downloadCanvasAsSvg(containerEl: HTMLElement, filename = 'cloud-architecture.svg') {
  try {
    const dataUrl = await toSvg(containerEl, {
      backgroundColor: '#ffffff',
      filter: (node: HTMLElement) => {
        if (node.classList) {
          if (
            node.classList.contains('react-flow__controls') ||
            node.classList.contains('react-flow__minimap') ||
            node.classList.contains('react-flow__attribution') ||
            node.dataset?.exportIgnore === 'true'
          ) {
            return false
          }
        }
        return true
      },
    })

    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
    return true
  } catch (error) {
    console.error('Failed to export SVG', error)
    throw error
  }
}

export function downloadAsDrawio(
  nodes: any[],
  edges: any[],
  title = 'Cloud Architecture',
  filename = 'cloud-architecture.drawio'
) {
  try {
    // Generate native Draw.io (mxGraph XML) format
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="CLOQS-AI" version="22.0.0" type="device">
  <diagram id="diagram-1" name="${escapeXml(title)}">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1100" background="#f8fafc">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
`

    // Add Nodes
    nodes.forEach((node) => {
      const data = node.data || {}
      const label = `${escapeXml(data.name || node.id)}\n${escapeXml(data.region || '')}`
      const x = Math.round(node.position?.x || 100)
      const y = Math.round(node.position?.y || 100)
      const width = 220
      const height = 75

      let fillColor = '#ffffff'
      let strokeColor = '#94a3b8'

      if (data.service_family === 'compute') {
        fillColor = '#eff6ff'
        strokeColor = '#3b82f6'
      } else if (data.service_family === 'database') {
        fillColor = '#ecfdf5'
        strokeColor = '#10b981'
      } else if (data.service_family === 'storage') {
        fillColor = '#fefce8'
        strokeColor = '#f59e0b'
      } else if (data.service_family === 'networking') {
        fillColor = '#f0fdf4'
        strokeColor = '#06b6d4'
      } else if (data.service_family === 'security') {
        fillColor = '#fff1f2'
        strokeColor = '#f43f5e'
      }

      xml += `        <mxCell id="${escapeXml(node.id)}" value="${label}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${fillColor};strokeColor=${strokeColor};strokeWidth=2;fontFamily=Helvetica;fontSize=12;fontStyle=1;align=center;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />
        </mxCell>
`
    })

    // Add Edges
    edges.forEach((edge, idx) => {
      xml += `        <mxCell id="edge-${idx}" value="${escapeXml(edge.label || '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#475569;strokeWidth=2;exitX=0.5;exitY=1;entryX=0.5;entryY=0;" edge="1" parent="1" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
`
    })

    xml += `      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = filename
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
    return true
  } catch (error) {
    console.error('Failed to export Draw.io XML', error)
    throw error
  }
}

export function downloadAsJson(data: any, filename = 'cloud-architecture.json') {
  const jsonStr = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  link.click()
  URL.revokeObjectURL(url)
}

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '\'':
        return '&apos;'
      case '"':
        return '&quot;'
      default:
        return c
    }
  })
}
