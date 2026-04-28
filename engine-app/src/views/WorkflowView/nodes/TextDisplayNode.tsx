import { useCallback } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { AlignLeft } from 'lucide-react'
import NodeShell from './NodeShell'
import { handleStyle } from './portStyles'
import { useAppStore } from '../../../store/appStore'

export interface TextDisplayNodeData {
  label: string
  receivedText?: string
}

export default function TextDisplayNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TextDisplayNodeData
  const hasText = !!d.receivedText

  const updateData = useCallback((patch: Partial<TextDisplayNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
  }, [id])

  return (
    <NodeShell title={d.label ?? '文本展示'} icon={<AlignLeft size={13} />} selected={selected} runState={d as any} onRename={(name) => updateData({ label: name })}>
      <NodeResizer minWidth={180} minHeight={80} isVisible={selected} lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }} handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }} />

      <Handle type="target" position={Position.Left} id="text" style={handleStyle('text', 'left')} title="text" />

      <div style={{
        height: '100%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 6,
        padding: '8px',
        fontSize: 11,
        lineHeight: 1.6,
        color: hasText ? '#c0c0c0' : '#3a3a3a',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        userSelect: 'text',
        overflowY: 'auto',
      }}>
        {hasText ? d.receivedText : '等待运行...'}
      </div>

      <Handle type="source" position={Position.Right} id="text" style={handleStyle('text', 'right')} title="text" />
    </NodeShell>
  )
}
