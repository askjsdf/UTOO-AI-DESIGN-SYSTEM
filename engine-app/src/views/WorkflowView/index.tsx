import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls,
  addEdge, applyNodeChanges, applyEdgeChanges,
  useReactFlow, ReactFlowProvider,
  type OnConnect, type NodeChange, type EdgeChange,
} from '@xyflow/react'
import { useAppStore } from '../../store/appStore'
import WorkflowToolbar from './components/WorkflowToolbar'
import WorkflowLibraryPanel from './components/WorkflowLibraryPanel'
import CanvasContextMenu from './components/CanvasContextMenu'
import ImageInputNode from './nodes/ImageInputNode'
import ImageSaveNode from './nodes/ImageSaveNode'
import ImageGenNode from './nodes/ImageGenNode'
import TextInputNode from './nodes/TextInputNode'
import TextDisplayNode from './nodes/TextDisplayNode'
import LLMNode from './nodes/LLMNode'
import CodeNode from './nodes/CodeNode'
import SendToCanvasNode from './nodes/SendToCanvasNode'

const NODE_TYPES = {
  imageInput:    ImageInputNode,
  imageSave:     ImageSaveNode,
  imageGen:      ImageGenNode,
  textInput:     TextInputNode,
  textDisplay:   TextDisplayNode,
  llm:           LLMNode,
  code:          CodeNode,
  sendToCanvas:  SendToCanvasNode,
}

// 各节点类型的默认 data
const NODE_DEFAULTS: Record<string, Record<string, unknown>> = {
  imageInput:   { label: '图片输入', sourceMode: 'file', images: [], previews: [], fileNames: [] },
  imageSave:    { label: '图片保存', prefix: 'output' },
  imageGen:     { label: '图片生成', model: 'gemini-3.1-flash-image-preview', aspectRatio: '1:1', count: 1, inputSlots: [] },
  textInput:    { label: '文本输入', text: '' },
  textDisplay:  { label: '文本展示' },
  llm:          { label: 'LLM', model: 'gemini-3-flash-preview', systemPrompt: '', inputSlots: [] },
  code:         { label: 'Code', code: `// inputs: { [端口名]: { text?: string, images?: string[] } }\n// 返回: { text?, images? }\n\nconst raw = inputs['输入']?.text ?? ''\nconst data = JSON.parse(raw)\nreturn { text: String(data) }\n`, inputSlots: [] },
  sendToCanvas: { label: '发送到画布', mode: 'auto', targetProjectId: null },
}

// 各节点类型的初始尺寸
const NODE_SIZES: Record<string, { width: number; height: number }> = {
  imageInput:   { width: 220, height: 220 },
  imageSave:    { width: 230, height: 160 },
  imageGen:     { width: 260, height: 300 },
  textInput:    { width: 260, height: 180 },
  textDisplay:  { width: 260, height: 120 },
  llm:          { width: 300, height: 320 },
  code:         { width: 320, height: 360 },
  sendToCanvas: { width: 220, height: 130 },
}

function WorkflowCanvas() {
  const { rfNodes, rfEdges, setRfNodes, setRfEdges, setSelectedNodeId, markDirty } = useAppStore()
  const { screenToFlowPosition } = useReactFlow()
  const rfWrapper = useRef<HTMLDivElement>(null)

  // 右键菜单状态
  const [menu, setMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)

  // ── 节点 / 边 变更 ──────────────────────────────────────────────

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes(applyNodeChanges(changes, useAppStore.getState().rfNodes))
    markDirty()
  }, [setRfNodes, markDirty])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges(applyEdgeChanges(changes, useAppStore.getState().rfEdges))
    markDirty()
  }, [setRfEdges, markDirty])

  const onConnect = useCallback<OnConnect>((params) => {
    setRfEdges(addEdge({ ...params, animated: false }, useAppStore.getState().rfEdges))
    markDirty()
  }, [setRfEdges, markDirty])

  // ── 右键菜单 ────────────────────────────────────────────────────

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault()
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setMenu({ x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [screenToFlowPosition])

  const handleAddNode = useCallback((type: string) => {
    if (!menu) return
    const id = `${type}-${Date.now()}`
    const sizes = NODE_SIZES[type] ?? { width: 240, height: 200 }
    const newNode = {
      id,
      type,
      position: { x: menu.flowX, y: menu.flowY },
      data: NODE_DEFAULTS[type] ?? { label: type },
      width: sizes.width,
      height: sizes.height,
    }
    setRfNodes([...useAppStore.getState().rfNodes, newNode])
  }, [menu, setRfNodes])

  return (
    <div ref={rfWrapper} style={{ flex: 1, position: 'relative' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => { setSelectedNodeId(null); setMenu(null) }}
        onPaneContextMenu={onPaneContextMenu}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        style={{ background: '#0a0a0a' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255,255,255,0.03)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* 右键菜单 */}
      {menu && (
        <CanvasContextMenu
          x={menu.x}
          y={menu.y}
          onSelect={handleAddNode}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

export default function WorkflowView() {
  const { setRfNodes, enqueueTask, cancelCurrentTask } = useAppStore()

  const handleRun = useCallback(async () => {
    const { rfNodes, rfEdges, currentWorkflowId, currentWorkflowName } = useAppStore.getState()

    // 重置所有节点的运行状态（视觉）
    setRfNodes(rfNodes.map((n) => ({
      ...n,
      data: { ...n.data, _status: undefined, _startedAt: undefined, _duration: undefined, _outputPreviews: undefined },
    })))

    // 收集输入缩略图（用于任务卡片展示）
    const inputPreviews: string[] = []
    for (const node of rfNodes) {
      if (node.type === 'imageInput') {
        const p = (node.data as Record<string, unknown>).previews as string[] | undefined
        if (p) inputPreviews.push(...p.slice(0, 2))
      }
    }

    await enqueueTask({
      workflowId: currentWorkflowId ?? `temp-${Date.now()}`,
      workflowName: currentWorkflowName ?? '未命名工作流',
      source: 'workflow',
      snapshotNodes: rfNodes.map((n) => ({
        id: n.id, type: n.type ?? '', position: n.position,
        width: n.width, height: n.height,
        data: n.data as Record<string, unknown>,
      })),
      snapshotEdges: rfEdges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
      inputPreviews: inputPreviews.slice(0, 4),
    })
  }, [enqueueTask, setRfNodes])

  const handleStop = useCallback(() => {
    cancelCurrentTask()
  }, [cancelCurrentTask])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkflowToolbar onRun={handleRun} onStop={handleStop} />
      <ReactFlowProvider>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <WorkflowLibraryPanel />
          <WorkflowCanvas />
        </div>
      </ReactFlowProvider>
    </div>
  )
}
