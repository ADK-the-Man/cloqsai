'use client'

import React, { useMemo, useCallback, useState, useRef } from 'react'
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
  addEdge,
  Connection,
  MarkerType,
  ConnectionMode,
  ReactFlowInstance
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Server,
  Database,
  HardDrive,
  Shield,
  Activity,
  Globe,
  Zap,
  Wand2,
  Plus,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Bot,
  X,
  Trash2,
  Check,
  Layers,
  ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

// Pre-defined palette of modern cloud building blocks for + Add Component
const CLOUD_COMPONENT_TEMPLATES = [
  {
    name: 'Amazon ElastiCache Redis',
    service_name: 'AmazonElastiCache',
    service_family: 'database',
    region: 'us-east-1',
    purpose: 'Sub-millisecond in-memory caching & session clustering tier',
    rationale: 'Reduces database read traffic by 80% and guarantees low p99 latency',
    estimated_cost: 34.00,
  },
  {
    name: 'Amazon S3 Object Storage',
    service_name: 'AmazonS3',
    service_family: 'storage',
    region: 'us-east-1',
    purpose: 'Durable media, video uploads and static asset lake',
    rationale: 'Scalable 99.999999999% durability with automated Intelligent-Tiering',
    estimated_cost: 18.20,
  },
  {
    name: 'AWS Web App Firewall (WAF)',
    service_name: 'AWSWAF',
    service_family: 'security',
    region: 'us-east-1',
    purpose: 'Layer-7 protection against SQLi, XSS, and DDoS rate-limiting',
    rationale: 'Blocks malicious bot crawlers at the edge before hitting ALB',
    estimated_cost: 15.00,
  },
  {
    name: 'Amazon CloudFront CDN',
    service_name: 'AmazonCloudFront',
    service_family: 'networking',
    region: 'us-east-1',
    purpose: 'Low-latency global edge content caching & TLS acceleration',
    rationale: 'Terminates connections close to users and slashes compute egress',
    estimated_cost: 12.50,
  },
  {
    name: 'Amazon SQS Decoupled Queue',
    service_name: 'AmazonSQS',
    service_family: 'messaging',
    region: 'us-east-1',
    purpose: 'Asynchronous event ingestion and worker task buffer',
    rationale: 'Absorbs spiky traffic and decouples ingestion from heavy processing',
    estimated_cost: 4.80,
  },
  {
    name: 'AWS Lambda Microservice',
    service_name: 'AWSLambda',
    service_family: 'compute',
    region: 'us-east-1',
    purpose: 'On-demand serverless thumbnail generation & webhooks',
    rationale: 'Pay-per-use execution scales to zero with zero idle server overhead',
    estimated_cost: 8.50,
  },
]

// Custom node rendering component with 4-directional handles, cost badge, and hover interactions
function ServiceNodeComponent({ data, selected }: NodeProps) {
  const getFamilyIcon = () => {
    switch (data.service_family) {
      case 'database':
        return <Database className="h-4 w-4 text-emerald-600" />
      case 'storage':
        return <HardDrive className="h-4 w-4 text-amber-600" />
      case 'networking':
        return <Globe className="h-4 w-4 text-blue-600" />
      case 'monitoring':
        return <Activity className="h-4 w-4 text-purple-600" />
      case 'security':
        return <Shield className="h-4 w-4 text-red-600" />
      case 'messaging':
        return <Zap className="h-4 w-4 text-amber-500" />
      default:
        return <Server className="h-4 w-4 text-indigo-600" />
    }
  }

  const getBorderColor = () => {
    if (selected) return 'border-blue-600 ring-2 ring-blue-400/50 bg-white shadow-xl scale-[1.02]'
    switch (data.service_family) {
      case 'database':
        return 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-400 hover:shadow-md'
      case 'storage':
        return 'border-amber-300 bg-amber-50/40 hover:border-amber-400 hover:shadow-md'
      case 'networking':
        return 'border-blue-300 bg-blue-50/40 hover:border-blue-400 hover:shadow-md'
      case 'monitoring':
        return 'border-purple-300 bg-purple-50/40 hover:border-purple-400 hover:shadow-md'
      case 'security':
        return 'border-red-300 bg-red-50/40 hover:border-red-400 hover:shadow-md'
      case 'messaging':
        return 'border-amber-300 bg-amber-50/40 hover:border-amber-400 hover:shadow-md'
      default:
        return 'border-slate-300 bg-white hover:border-slate-400 hover:shadow-md'
    }
  }

  return (
    <div
      className={`min-w-[205px] max-w-[250px] rounded-xl border-2 p-3 shadow-xs transition-all duration-150 select-none cursor-grab active:cursor-grabbing ${getBorderColor()}`}
    >
      {/* 4-way connect handles with dual source and target */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{ left: '42%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        style={{ left: '58%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ left: '58%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        style={{ left: '42%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />

      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ top: '42%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        style={{ top: '58%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />

      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ top: '58%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        style={{ top: '42%' }}
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />

      {/* Node Header with Icon and Name */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-lg bg-white p-1.5 shadow-2xs border border-slate-200 shrink-0">
            {getFamilyIcon()}
          </div>
          <div className="text-xs font-bold text-slate-900 truncate" title={data.name}>
            {data.name}
          </div>
        </div>

        {/* Live Traffic Pulse when selected or simulated */}
        <span className="flex h-2 w-2 relative shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </div>

      {/* Cloud Service SKU & Region */}
      <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1.5">
        <span className="truncate pr-1 text-slate-700 font-semibold">{data.service_name}</span>
        {data.region && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
            {data.region}
          </span>
        )}
      </div>

      {/* Estimated Cost Badge & Purpose */}
      <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
        <span className="text-[10px] text-slate-500 line-clamp-1 flex-1 pr-1" title={data.purpose}>
          {data.purpose}
        </span>
        {data.monthly_cost !== undefined && data.monthly_cost !== null && (
          <Badge className="text-[9px] font-bold bg-slate-900 text-white shrink-0 px-1.5 py-0.2">
            ${Number(data.monthly_cost).toFixed(0)}/mo
          </Badge>
        )}
      </div>
    </div>
  )
}

interface ArchitectureDiagramProps {
  initialNodes: Node[]
  initialEdges: Edge[]
  onChange?: (data: { nodes: Node[]; edges: Edge[] }) => void
}

export function ArchitectureDiagram({
  initialNodes,
  initialEdges,
  onChange,
}: ArchitectureDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const nodeTypes = useMemo(() => ({ serviceNode: ServiceNodeComponent }), [])

  // Nodes & Edges State
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes || [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (initialEdges || []).map((e) => ({
      ...e,
      type: e.type || 'smoothstep',
      animated: e.animated ?? true,
      style: { stroke: '#2563eb', strokeWidth: 2, ...e.style },
      markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed, color: '#2563eb' },
    }))
  )

  // Interactive Features State
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isTrafficSimulating, setIsTrafficSimulating] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingNodeData, setEditingNodeData] = useState<{ name: string; purpose: string; region: string } | null>(null)

  // Keep internal state aligned if parent switches provider tab
  React.useEffect(() => {
    setNodes(initialNodes || [])
  }, [initialNodes, setNodes])

  React.useEffect(() => {
    setEdges(
      (initialEdges || []).map((e) => ({
        ...e,
        type: e.type || 'smoothstep',
        animated: isTrafficSimulating ? true : (e.animated ?? true),
        style: isTrafficSimulating
          ? { stroke: '#8b5cf6', strokeWidth: 2.5, strokeDasharray: '6,6' }
          : { stroke: '#2563eb', strokeWidth: 2, ...e.style },
        markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed, color: isTrafficSimulating ? '#8b5cf6' : '#2563eb' },
      }))
    )
  }, [initialEdges, setEdges, isTrafficSimulating])

  // Connect handler: user drags connection handle between nodes
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        source: params.source || '',
        target: params.target || '',
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#2563eb', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
      }
      setEdges((eds) => {
        const next = addEdge(newEdge, eds)
        if (onChange) onChange({ nodes, edges: next })
        return next
      })
      toast.success('Components connected')
    },
    [nodes, onChange, setEdges]
  )

  // Persist node drag end
  const handleNodeDragStop = useCallback(
    (_: any, node: Node) => {
      if (!onChange) return
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === node.id ? { ...n, position: node.position } : n))
        onChange({ nodes: next, edges })
        return next
      })
    },
    [edges, onChange, setNodes]
  )

  // Persist edge deletions
  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (!onChange) return
      const remaining = edges.filter((e) => !deletedEdges.some((d) => d.id === e.id))
      onChange({ nodes, edges: remaining })
      toast.info('Connection removed')
    },
    [edges, nodes, onChange]
  )

  // Node Click Selection for Inspector Drawer
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node)
    setEditingNodeData({
      name: node.data?.name || '',
      purpose: node.data?.purpose || '',
      region: node.data?.region || 'us-east-1',
    })
  }, [])

  // Auto-Arrange: Hierarchical Architectural Tier Layout (DAG)
  const handleAutoArrange = useCallback(() => {
    if (!nodes || nodes.length === 0) return

    // Categorize into architectural layers
    const tierIngress: Node[] = []
    const tierCompute: Node[] = []
    const tierCacheMsg: Node[] = []
    const tierDatabase: Node[] = []
    const tierSecurityOps: Node[] = []

    nodes.forEach((n) => {
      const fam = (n.data?.service_family || '').toLowerCase()
      const name = (n.data?.name || '').toLowerCase()

      if (fam === 'networking' || name.includes('load balancer') || name.includes('alb') || name.includes('cdn') || name.includes('waf')) {
        tierIngress.push(n)
      } else if (fam === 'database' && (name.includes('redis') || name.includes('cache') || name.includes('memcached'))) {
        tierCacheMsg.push(n)
      } else if (fam === 'messaging' || name.includes('sqs') || name.includes('kafka') || name.includes('sns')) {
        tierCacheMsg.push(n)
      } else if (fam === 'database' || fam === 'storage' || name.includes('rds') || name.includes('s3') || name.includes('aurora') || name.includes('postgres')) {
        tierDatabase.push(n)
      } else if (fam === 'security' || fam === 'monitoring' || name.includes('secret') || name.includes('kms')) {
        tierSecurityOps.push(n)
      } else {
        tierCompute.push(n)
      }
    })

    const nodeWidth = 220
    const xGap = 40
    const canvasCenterX = 450

    const layoutTier = (tierNodes: Node[], y: number) => {
      const totalWidth = tierNodes.length * nodeWidth + Math.max(0, tierNodes.length - 1) * xGap
      const startX = Math.max(50, canvasCenterX - totalWidth / 2)
      return tierNodes.map((node, idx) => ({
        ...node,
        position: {
          x: Math.round(startX + idx * (nodeWidth + xGap)),
          y,
        },
      }))
    }

    const arranged: Node[] = [
      ...layoutTier(tierIngress, 40),
      ...layoutTier(tierCompute, 200),
      ...layoutTier(tierCacheMsg, 360),
      ...layoutTier(tierDatabase, 520),
      ...layoutTier(tierSecurityOps, 680),
    ]

    setNodes(arranged)
    if (onChange) onChange({ nodes: arranged, edges })
    rfInstance?.fitView({ padding: 0.2, duration: 400 })
    toast.success('Architecture tidied into multi-tier topology!')
  }, [nodes, edges, onChange, rfInstance])

  // + Add Component from Palette
  const handleAddComponent = (tmpl: typeof CLOUD_COMPONENT_TEMPLATES[0]) => {
    const id = `svc-custom-${Date.now()}`
    const newNode: Node = {
      id,
      type: 'serviceNode',
      position: {
        x: 200 + (nodes.length % 4) * 50,
        y: 220 + (nodes.length % 3) * 60,
      },
      data: {
        name: tmpl.name,
        service_name: tmpl.service_name,
        service_family: tmpl.service_family,
        region: tmpl.region,
        purpose: tmpl.purpose,
        rationale: tmpl.rationale,
        monthly_cost: tmpl.estimated_cost,
      },
    }

    const updated = [...nodes, newNode]
    setNodes(updated)
    if (onChange) onChange({ nodes: updated, edges })
    setIsAddModalOpen(false)
    toast.success(`Added ${tmpl.name} to architecture!`)
    setSelectedNode(newNode)
  }

  // Delete Selected Node
  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return
    const remainingNodes = nodes.filter((n) => n.id !== selectedNode.id)
    const remainingEdges = edges.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
    setNodes(remainingNodes)
    setEdges(remainingEdges)
    if (onChange) onChange({ nodes: remainingNodes, edges: remainingEdges })
    setSelectedNode(null)
    toast.info('Component removed from canvas')
  }

  // Save Inline Node Edit
  const handleSaveNodeEdit = () => {
    if (!selectedNode || !editingNodeData) return
    const updatedNodes = nodes.map((n) =>
      n.id === selectedNode.id
        ? {
            ...n,
            data: {
              ...n.data,
              name: editingNodeData.name,
              purpose: editingNodeData.purpose,
              region: editingNodeData.region,
            },
          }
        : n
    )
    setNodes(updatedNodes)
    if (onChange) onChange({ nodes: updatedNodes, edges })
    setSelectedNode((prev) => (prev ? { ...prev, data: { ...prev.data, ...editingNodeData } } : null))
    toast.success('Node specifications updated')
  }

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner relative overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'h-screen fixed inset-0 z-50 rounded-none' : 'h-[520px] sm:h-[620px]'
      }`}
    >
      {/* ReactFlow Interactive Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        onEdgesDelete={handleEdgesDelete}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedNode(null)}
        onInit={setRfInstance}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-right"
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionLineStyle={{ stroke: '#2563eb', strokeWidth: 2, strokeDasharray: '5,5' }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#2563eb', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
        }}
      >
        <Background color="#cbd5e1" gap={16} size={1} />
        <Controls showInteractive={false} className="!bg-white !border !border-slate-200 !shadow-xs" />
        <MiniMap
          nodeStrokeColor="#94a3b8"
          nodeColor="#f8fafc"
          className="!bg-white !border !border-slate-200 !rounded-md"
        />
      </ReactFlow>

      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left Action Toolbar */}
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-md pointer-events-auto">
          {/* + Add Component */}
          <Button
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 px-2.5 cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Component</span>
          </Button>

          {/* Auto-Arrange Layout */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoArrange}
            className="h-7 text-xs text-slate-700 hover:text-blue-600 hover:border-blue-300 gap-1 px-2.5 cursor-pointer"
            title="Auto-organize topology into multi-tier layout"
          >
            <Wand2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="hidden sm:inline">Auto-Arrange</span>
          </Button>

          {/* Traffic Simulation Toggle */}
          <Button
            size="sm"
            variant={isTrafficSimulating ? 'default' : 'outline'}
            onClick={() => {
              setIsTrafficSimulating(!isTrafficSimulating)
              toast.info(isTrafficSimulating ? 'Traffic simulation paused' : 'Simulating live traffic flow pulses!')
            }}
            className={`h-7 text-xs gap-1 px-2.5 cursor-pointer ${
              isTrafficSimulating
                ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
                : 'text-slate-700 hover:text-purple-700 hover:border-purple-300'
            }`}
            title="Simulate live request flows across microservices"
          >
            {isTrafficSimulating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 text-purple-600" />}
            <span className="hidden sm:inline">Flow Simulation</span>
          </Button>

          {/* Ask AI Architect */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('open-architect-chat'))
              }
            }}
            className="h-7 text-xs text-purple-800 bg-purple-50/90 border-purple-200 hover:bg-purple-100 font-semibold gap-1 px-2.5 cursor-pointer shadow-2xs"
            title="Open Principal Cloud Solutions Architect"
          >
            <Bot className="h-3.5 w-3.5 text-purple-600" />
            <span>Ask Architect</span>
          </Button>
        </div>

        {/* Right Canvas Helpers */}
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-md pointer-events-auto">
          <div className="flex items-center gap-1 text-[11px] text-slate-500 px-2 hidden md:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Drag handles to wire components &bull; Backspace to sever</span>
          </div>

          {/* Fullscreen Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleToggleFullscreen}
            className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900 cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Interactive Node Inspector Panel (Slides in when node is clicked) */}
      {selectedNode && (
        <div className="absolute top-16 right-3 bottom-3 w-80 sm:w-96 bg-white/98 backdrop-blur-md rounded-xl border border-slate-300 shadow-2xl z-20 flex flex-col p-4 animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 truncate max-w-[200px]" title={selectedNode.data?.name}>
                  {selectedNode.data?.name}
                </h4>
                <span className="text-[10px] text-slate-500 font-medium">Component Inspector</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedNode(null)}
              className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
            {/* Quick Sizing & Cost Badges */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Est. Monthly Cost</span>
                <span className="text-sm font-extrabold text-slate-900">
                  ${selectedNode.data?.monthly_cost ? Number(selectedNode.data.monthly_cost).toFixed(2) : '32.00'}/mo
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Architecture Tier</span>
                <Badge variant="outline" className="text-[10px] capitalize bg-white text-blue-700 border-blue-300">
                  {selectedNode.data?.service_family || 'Compute Tier'}
                </Badge>
              </div>
            </div>

            {/* Editable Name & Purpose */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700">Display Component Name</label>
              <Input
                value={editingNodeData?.name || ''}
                onChange={(e) => setEditingNodeData((prev) => prev ? { ...prev, name: e.target.value } : null)}
                className="text-xs h-8 bg-slate-50 focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700">Region / Deployment Zone</label>
              <Input
                value={editingNodeData?.region || ''}
                onChange={(e) => setEditingNodeData((prev) => prev ? { ...prev, region: e.target.value } : null)}
                className="text-xs h-8 bg-slate-50 focus:bg-white"
                placeholder="e.g. us-east-1"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700">Workload Purpose & Function</label>
              <Textarea
                value={editingNodeData?.purpose || ''}
                onChange={(e) => setEditingNodeData((prev) => prev ? { ...prev, purpose: e.target.value } : null)}
                rows={2}
                className="text-xs bg-slate-50 focus:bg-white resize-none"
              />
            </div>

            {selectedNode.data?.rationale && (
              <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 text-[11px] text-slate-600">
                <strong className="text-blue-900 block font-semibold mb-0.5">AI Selection Rationale:</strong>
                {selectedNode.data.rationale}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveNodeEdit}
                className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Save Changes</span>
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={handleDeleteSelectedNode}
                className="h-8 px-2.5 text-xs cursor-pointer shadow-xs"
                title="Delete component from canvas"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('open-architect-chat'))
                }
              }}
              className="w-full h-7 text-[11px] text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200 font-semibold gap-1.5 cursor-pointer"
            >
              <Bot className="h-3.5 w-3.5 text-purple-600" />
              <span>Ask Architect: &quot;How to optimize {selectedNode.data?.name}?&quot;</span>
            </Button>
          </div>
        </div>
      )}

      {/* Add Component Palette Modal */}
      {isAddModalOpen && (
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs z-30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Cloud Infrastructure Component</h3>
                  <p className="text-[11px] text-slate-500">Pick a pre-configured building block to spawn onto the canvas</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAddModalOpen(false)}
                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
              {CLOUD_COMPONENT_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddComponent(tmpl)}
                  className="flex flex-col text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-blue-700 truncate pr-1">
                      {tmpl.name}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono bg-white text-slate-600 shrink-0">
                      ~${tmpl.estimated_cost}/mo
                    </Badge>
                  </div>
                  <span className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                    {tmpl.purpose}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsAddModalOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
