'use client'

import React, { useMemo, useState, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
  useNodesState,
  useEdgesState,
  MarkerType,
  ConnectionMode,
  ReactFlowInstance
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Globe,
  Shield,
  Layers,
  Database,
  Zap,
  HardDrive,
  Lock,
  Unlock,
  Activity,
  Play,
  Pause,
  Maximize2,
  Copy,
  Check,
  Search,
  ExternalLink,
  X,
  FileCode,
  ArrowRight,
  Server,
  Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

// ── Custom Node Components ────────────────────────────────────────────────────

// 1. Ingress Node
function IngressNodeComponent({ data, selected }: NodeProps) {
  return (
    <div
      className={`group relative min-w-[220px] rounded-xl border-2 bg-gradient-to-br from-slate-900 to-indigo-950 p-4 text-white shadow-xl transition-all select-none ${
        selected ? 'ring-2 ring-indigo-400 scale-[1.02]' : 'hover:shadow-2xl'
      }`}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2.5 !h-2.5 !bg-indigo-400 !border-2 !border-slate-900 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
          <Globe className="h-4 w-4" />
        </div>
        <div>
          <span className="text-[10px] font-semibold tracking-wider uppercase text-indigo-300">Edge Gateway</span>
          <h3 className="text-xs font-bold leading-tight">{data.title || 'API Gateway'}</h3>
        </div>
      </div>
      <p className="text-[11px] text-slate-300 mb-3">{data.subtitle}</p>
      <div className="flex items-center gap-2 pt-2 border-t border-indigo-900/60">
        <span className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-200">
          <Shield className="h-3 w-3" />
          {data.badge || 'TLS 1.3'}
        </span>
        <span className="text-[10px] text-slate-400">{data.rate_limit || '5k req/s'}</span>
      </div>
    </div>
  )
}

// 2. Controller Group Node
function ControllerNodeComponent({ data, selected }: NodeProps) {
  return (
    <div
      className={`group relative min-w-[210px] rounded-xl border-2 bg-white p-3.5 shadow-sm transition-all select-none ${
        selected
          ? 'border-indigo-600 ring-2 ring-indigo-200 shadow-md'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-indigo-500 !border !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !bg-indigo-500 !border !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{data.subsystem}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 text-slate-600">
          {data.endpoints_count || 0} routes
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Server className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-xs font-semibold text-slate-900 truncate" title={data.title}>
          {data.title}
        </h4>
      </div>
      <p className="mt-1 text-[10px] font-mono text-slate-500 truncate">{data.module}.py</p>
    </div>
  )
}

// 3. Endpoint Node
function EndpointNodeComponent({ data, selected }: NodeProps) {
  const method = data.method || 'GET'

  const methodColors: Record<string, { bg: string; text: string; border: string }> = {
    GET: { bg: 'bg-sky-50', text: 'text-sky-700 border-sky-300', border: 'hover:border-sky-400' },
    POST: { bg: 'bg-emerald-50', text: 'text-emerald-700 border-emerald-300', border: 'hover:border-emerald-400' },
    PUT: { bg: 'bg-amber-50', text: 'text-amber-700 border-amber-300', border: 'hover:border-amber-400' },
    PATCH: { bg: 'bg-orange-50', text: 'text-orange-700 border-orange-300', border: 'hover:border-orange-400' },
    DELETE: { bg: 'bg-rose-50', text: 'text-rose-700 border-rose-300', border: 'hover:border-rose-400' },
  }

  const mc = methodColors[method] || { bg: 'bg-slate-50', text: 'text-slate-700 border-slate-300', border: 'hover:border-slate-400' }

  return (
    <div
      className={`group relative min-w-[280px] max-w-[320px] rounded-xl border bg-white p-3 shadow-xs transition-all select-none cursor-pointer ${
        selected
          ? 'border-indigo-600 ring-2 ring-indigo-300 shadow-lg scale-[1.02]'
          : `border-slate-200 ${mc.border} hover:shadow-md`
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-indigo-500 !border !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2 !h-2 !bg-indigo-500 !border !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold border tracking-wider ${mc.bg} ${mc.text}`}>
            {method}
          </span>
          {data.auth_required ? (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-500" title={`Requires ${data.auth_type}`}>
              <Lock className="h-2.5 w-2.5 text-slate-400" />
              Auth
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-600" title="Public Endpoint">
              <Unlock className="h-2.5 w-2.5" />
              Public
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium text-slate-400">{data.p95_latency_ms}ms p95</span>
      </div>

      <div className="font-mono text-[11px] font-semibold text-slate-900 truncate mb-1" title={data.path}>
        {data.path}
      </div>

      <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
        {data.summary}
      </p>

      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[10px] text-slate-400">
        <span className="truncate max-w-[170px]" title={data.controller}>{data.controller}</span>
        <span className="font-mono text-slate-600">{data.est_rps} rps</span>
      </div>
    </div>
  )
}

// 4. Resource Node (Downstream DB/Cache/Storage)
function ResourceNodeComponent({ data, selected }: NodeProps) {
  const getResourceMeta = () => {
    switch (data.resource_type) {
      case 'database':
        return {
          icon: Database,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 border-emerald-200',
          badgeBg: 'bg-emerald-100 text-emerald-800'
        }
      case 'cache':
        return {
          icon: Zap,
          color: 'text-amber-500',
          bg: 'bg-amber-50 border-amber-200',
          badgeBg: 'bg-amber-100 text-amber-800'
        }
      case 'storage':
        return {
          icon: HardDrive,
          color: 'text-blue-600',
          bg: 'bg-blue-50 border-blue-200',
          badgeBg: 'bg-blue-100 text-blue-800'
        }
      case 'queue':
        return {
          icon: Layers,
          color: 'text-purple-600',
          bg: 'bg-purple-50 border-purple-200',
          badgeBg: 'bg-purple-100 text-purple-800'
        }
      default:
        return {
          icon: Database,
          color: 'text-slate-600',
          bg: 'bg-slate-50 border-slate-200',
          badgeBg: 'bg-slate-100 text-slate-800'
        }
    }
  }

  const meta = getResourceMeta()
  const Icon = meta.icon

  return (
    <div
      className={`group relative min-w-[210px] max-w-[240px] rounded-xl border-2 bg-white p-3.5 shadow-xs transition-all select-none ${
        selected
          ? 'border-indigo-600 ring-2 ring-indigo-200 shadow-md'
          : `${meta.bg} hover:shadow-md`
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2 !h-2 !bg-indigo-500 !border !border-white !rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      />
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{data.resource_type}</span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${meta.badgeBg}`}>
          {data.badge}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.bg} ${meta.color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-xs font-bold text-slate-900 truncate" title={data.name}>
          {data.name}
        </h4>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">{data.detail}</p>
    </div>
  )
}

const nodeTypes = {
  ingressNode: IngressNodeComponent,
  controllerNode: ControllerNodeComponent,
  endpointNode: EndpointNodeComponent,
  resourceNode: ResourceNodeComponent,
}

// ── Main Graph Canvas Component ───────────────────────────────────────────────

interface ApiGraphCanvasProps {
  initialNodes: Node[]
  initialEdges: Edge[]
  endpoints: any[]
  projectName: string
  methodsBreakdown: Record<string, number>
}

export function ApiGraphCanvas({
  initialNodes,
  initialEdges,
  endpoints,
  projectName,
  methodsBreakdown,
}: ApiGraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)

  const [selectedMethod, setSelectedMethod] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSimulatingTraffic, setIsSimulatingTraffic] = useState(true)
  const [activeEndpoint, setActiveEndpoint] = useState<any | null>(endpoints[0] || null)
  const [copiedCurl, setCopiedCurl] = useState(false)

  // Filter nodes & edges based on search and method
  const filteredNodes = useMemo(() => {
    return nodes.map((node) => {
      if (node.type !== 'endpointNode') return { ...node, hidden: false }
      const data = node.data
      const matchesMethod = selectedMethod === 'ALL' || data.method === selectedMethod
      const matchesSearch =
        !searchQuery ||
        data.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        data.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        data.controller.toLowerCase().includes(searchQuery.toLowerCase())

      const isVisible = matchesMethod && matchesSearch
      return {
        ...node,
        hidden: !isVisible,
      }
    })
  }, [nodes, selectedMethod, searchQuery])

  // Toggle Traffic Animation on Edges
  const toggleTrafficSimulation = () => {
    const nextState = !isSimulatingTraffic
    setIsSimulatingTraffic(nextState)
    setEdges((prev) =>
      prev.map((edge) => ({
        ...edge,
        animated: nextState,
      }))
    )
    toast.success(nextState ? 'Live traffic animation enabled' : 'Traffic simulation paused')
  }

  // Handle clicking node
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'endpointNode') {
        const ep = endpoints.find((e) => e.id === node.data.id)
        if (ep) {
          setActiveEndpoint(ep)
        }
      }
    },
    [endpoints]
  )

  const handleCopyCurl = (ep: any) => {
    if (!ep) return
    const curl = `curl -X ${ep.method} "https://api.cloqs.io${ep.path}" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json"`
    navigator.clipboard.writeText(curl)
    setCopiedCurl(true)
    toast.success('Curl command copied to clipboard')
    setTimeout(() => setCopiedCurl(false), 2000)
  }

  const handleExportOpenApi = () => {
    const openapi = {
      openapi: '3.0.3',
      info: {
        title: `${projectName} API Surface`,
        version: '1.0.0',
        description: 'Auto-generated API specification from CLOQS Architecture Engine',
      },
      paths: endpoints.reduce((acc: any, ep) => {
        acc[ep.path] = acc[ep.path] || {}
        acc[ep.path][ep.method.toLowerCase()] = {
          summary: ep.summary,
          tags: ep.tags,
          responses: {
            '200': { description: 'Successful response' },
          },
        }
        return acc
      }, {}),
    }

    const blob = new Blob([JSON.stringify(openapi, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-openapi.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported OpenAPI 3.0 specification')
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm">
      {/* Canvas Area */}
      <div className="relative flex-1 h-full">
        {/* Top Control Bar */}
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/80 bg-white/95 p-2 backdrop-blur-md shadow-xs">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search endpoints..."
                className="h-8 w-48 pl-8 text-xs bg-slate-50 border-slate-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Method Filter Pills */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              {['ALL', 'GET', 'POST', 'PUT', 'DELETE'].map((m) => {
                const count = m === 'ALL' ? endpoints.length : methodsBreakdown[m] || 0
                const isActive = selectedMethod === m
                return (
                  <button
                    key={m}
                    onClick={() => setSelectedMethod(m)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{m}</span>
                    <span className={`text-[10px] px-1 rounded-full ${isActive ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-600'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTrafficSimulation}
              className={`h-8 text-xs gap-1.5 font-medium ${isSimulatingTraffic ? 'border-emerald-300 text-emerald-700 bg-emerald-50/50' : 'text-slate-600'}`}
            >
              {isSimulatingTraffic ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isSimulatingTraffic ? 'Live Flowing' : 'Simulate Traffic'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => reactFlowInstance?.fitView({ padding: 0.2, duration: 400 })}
              className="h-8 text-xs text-slate-600 gap-1.5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Fit View
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleExportOpenApi}
              className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              OpenAPI JSON
            </Button>
          </div>
        </div>

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[10px] font-medium text-slate-600 backdrop-blur-xs shadow-xs">
          <span className="font-semibold text-slate-800">Layers:</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-900"></span> Ingress</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500"></span> Controllers</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500"></span> Endpoints</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span> Downstream DB/Queues</span>
        </div>

        {/* React Flow Viewport */}
        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onInit={setReactFlowInstance}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: isSimulatingTraffic,
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={1.5}
          className="bg-slate-50/40"
        >
          <Background color="#cbd5e1" gap={20} size={1} />
          <Controls position="bottom-right" className="!bg-white !border-slate-200 !shadow-sm" />
          <MiniMap
            position="bottom-left"
            className="!hidden lg:!block !border-slate-200 !rounded-lg !overflow-hidden !shadow-sm !bottom-12"
            nodeColor={(n) => {
              if (n.type === 'ingressNode') return '#0f172a'
              if (n.type === 'controllerNode') return '#6366f1'
              if (n.type === 'endpointNode') return '#38bdf8'
              return '#10b981'
            }}
          />
        </ReactFlow>
      </div>

      {/* Endpoint Inspector Slide-Over Panel */}
      {activeEndpoint && (
        <aside className="w-80 md:w-96 shrink-0 border-l border-slate-200 bg-white p-5 overflow-y-auto flex flex-col justify-between shadow-xl">
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold border tracking-wider ${
                      activeEndpoint.method === 'GET'
                        ? 'bg-sky-50 text-sky-700 border-sky-300'
                        : activeEndpoint.method === 'POST'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : activeEndpoint.method === 'PUT'
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-rose-50 text-rose-700 border-rose-300'
                    }`}
                  >
                    {activeEndpoint.method}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-slate-500">
                    {activeEndpoint.tags?.[0] || 'Core'}
                  </Badge>
                </div>
                <h3 className="font-mono text-xs font-bold text-slate-900 break-all">
                  {activeEndpoint.path}
                </h3>
              </div>
              <button
                onClick={() => setActiveEndpoint(null)}
                className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Description</label>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">{activeEndpoint.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <div>
                <span className="text-[10px] font-medium text-slate-400">Security & Auth</span>
                <p className="mt-0.5 text-xs font-semibold text-slate-800 flex items-center gap-1">
                  {activeEndpoint.auth_required ? (
                    <>
                      <Lock className="h-3 w-3 text-amber-500" />
                      {activeEndpoint.auth_type}
                    </>
                  ) : (
                    <>
                      <Unlock className="h-3 w-3 text-emerald-600" />
                      Public Access
                    </>
                  )}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-medium text-slate-400">Throughput Target</span>
                <p className="mt-0.5 text-xs font-semibold text-slate-800 font-mono">
                  {activeEndpoint.est_rps} req/min
                </p>
              </div>
              <div>
                <span className="text-[10px] font-medium text-slate-400">SLA p95 Latency</span>
                <p className="mt-0.5 text-xs font-semibold text-slate-800 font-mono">
                  &lt; {activeEndpoint.p95_latency_ms} ms
                </p>
              </div>
              <div>
                <span className="text-[10px] font-medium text-slate-400">Handler Module</span>
                <p className="mt-0.5 text-xs font-semibold text-slate-800 truncate" title={activeEndpoint.controller}>
                  {activeEndpoint.controller}
                </p>
              </div>
            </div>

            {/* Downstream Data Dependencies */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Downstream Dependencies
              </label>
              <div className="mt-2 space-y-1.5">
                {activeEndpoint.downstream_targets?.map((target: string, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-2xs"
                  >
                    <ArrowRight className="h-3 w-3 text-indigo-500 shrink-0" />
                    <span className="truncate">{target}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Curl Sample Code */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Executable Curl Snippet
                </label>
                <button
                  onClick={() => handleCopyCurl(activeEndpoint)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                >
                  {copiedCurl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedCurl ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-200 overflow-x-auto leading-relaxed border border-slate-800">
{`curl -X ${activeEndpoint.method} \\
  "https://api.cloqs.io${activeEndpoint.path}" \\
  -H "Authorization: Bearer <TOKEN>"`}
              </pre>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5 text-slate-600 hover:text-slate-900"
              onClick={() => handleCopyCurl(activeEndpoint)}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Request Signature
            </Button>
          </div>
        </aside>
      )}
    </div>
  )
}
