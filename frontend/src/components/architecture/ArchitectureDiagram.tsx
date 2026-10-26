'use client'

import React, { useMemo, useCallback } from 'react'
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
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Server, Database, HardDrive, Shield, Activity, Globe, Zap, Cpu } from 'lucide-react'

// Custom node rendering component with 4-directional handles for smooth routing
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
    if (selected) return 'border-blue-500 ring-2 ring-blue-400 bg-white shadow-lg'
    switch (data.service_family) {
      case 'database':
        return 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-400'
      case 'storage':
        return 'border-amber-300 bg-amber-50/40 hover:border-amber-400'
      case 'networking':
        return 'border-blue-300 bg-blue-50/40 hover:border-blue-400'
      case 'monitoring':
        return 'border-purple-300 bg-purple-50/40 hover:border-purple-400'
      case 'security':
        return 'border-red-300 bg-red-50/40 hover:border-red-400'
      default:
        return 'border-slate-300 bg-white hover:border-slate-400'
    }
  }

  return (
    <div
      className={`min-w-[195px] max-w-[240px] rounded-xl border-2 p-3 shadow-xs transition-shadow duration-150 select-none cursor-grab active:cursor-grabbing ${getBorderColor()}`}
    >
      {/* 4-way connect handles (Top, Bottom, Left, Right) */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2.5 !h-2.5 !bg-blue-600 !border-2 !border-white hover:!scale-125 transition-transform"
      />

      <div className="flex items-center gap-2 mb-1.5">
        <div className="rounded-md bg-white p-1.5 shadow-2xs border border-slate-200 shrink-0">
          {getFamilyIcon()}
        </div>
        <div className="text-xs font-bold text-slate-900 truncate" title={data.name}>
          {data.name}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 mb-1">
        <span className="truncate pr-1">{data.service_name}</span>
        {data.region && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
            {data.region}
          </span>
        )}
      </div>

      <div className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
        {data.purpose}
      </div>
    </div>
  )
}

interface ArchitectureDiagramProps {
  initialNodes: Node[]
  initialEdges: Edge[]
  onChange?: (data: { nodes: Node[]; edges: Edge[] }) => void
}

export function ArchitectureDiagram({ initialNodes, initialEdges, onChange }: ArchitectureDiagramProps) {
  const nodeTypes = useMemo(() => ({ serviceNode: ServiceNodeComponent }), [])

  // Standard ReactFlow internal reactive state for 60fps cursor drag sync
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

  // Keep internal state aligned if parent switches provider tab
  React.useEffect(() => {
    setNodes(initialNodes || [])
  }, [initialNodes, setNodes])

  React.useEffect(() => {
    setEdges(
      (initialEdges || []).map((e) => ({
        ...e,
        type: e.type || 'smoothstep',
        animated: e.animated ?? true,
        style: { stroke: '#2563eb', strokeWidth: 2, ...e.style },
        markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed, color: '#2563eb' },
      }))
    )
  }, [initialEdges, setEdges])

  // Interactive connector handler: user can drag from any node handle to another
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
    },
    [nodes, onChange, setEdges]
  )

  // Notify parent on node drag end or edge deletion to persist to PostgreSQL
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

  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (!onChange) return
      const remaining = edges.filter((e) => !deletedEdges.some((d) => d.id === e.id))
      onChange({ nodes, edges: remaining })
    },
    [edges, nodes, onChange]
  )

  return (
    <div className="h-[580px] w-full rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner relative overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        onEdgesDelete={handleEdgesDelete}
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

      {/* Floating Canvas Helper Bar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs text-[11px] text-slate-600">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>Smooth 60fps drag &bull; Drag handles to connect &bull; Select link + Delete to sever</span>
      </div>
    </div>
  )
}
