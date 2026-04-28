import { useCallback } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { Type } from 'lucide-react'
import NodeShell from './NodeShell'
import { handleStyle } from './portStyles'
import { useAppStore } from '../../../store/appStore'

export interface TextInputNodeData {
  label: string
  text: string
}

export default function TextInputNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TextInputNodeData

  const updateData = useCallback((patch: Partial<TextInputNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  const stopPropagation = (e: React.KeyboardEvent) => e.stopPropagation()
  const charCount = (d.text ?? '').length

  return (
    <NodeShell title={d.label ?? '文本输入'} icon={<Type size={13} />} selected={selected} runState={d as any} onRename={(name) => updateData({ label: name })}>
      <NodeResizer minWidth={180} minHeight={100} isVisible={selected} lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }} handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }} />

      <div style={{ position: 'relative', height: '100%' }}>
        <textarea
          defaultValue={d.text ?? ''}
          onBlur={(e) => updateData({ text: e.target.value })}
          onKeyDown={stopPropagation}
          placeholder="在此输入提示词..."
          style={{
            width: '100%',
            height: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '8px 8px 20px',
            fontSize: 11,
            color: '#e0e0e0',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.6,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(59,130,246,0.4)')}
          onBlurCapture={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
        />
        <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, color: '#444', pointerEvents: 'none' }}>
          {charCount}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="text" style={handleStyle('text', 'right')} title="text" />
    </NodeShell>
  )
}
