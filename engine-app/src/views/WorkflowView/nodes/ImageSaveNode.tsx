import { useCallback, useRef } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { FolderDown, FolderOpen } from 'lucide-react'
import NodeShell from './NodeShell'
import { handleStyle } from './portStyles'
import { useAppStore } from '../../../store/appStore'

export interface ImageSaveNodeData {
  label: string
  dirHandle?: FileSystemDirectoryHandle
  dirName?: string
  prefix: string
  savedPreviews?: string[]
  savedCount?: number
}

export default function ImageSaveNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageSaveNodeData
  const prefixRef = useRef<HTMLInputElement>(null)

  const updateData = useCallback((patch: Partial<ImageSaveNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  const handlePickFolder = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      updateData({ dirHandle: handle, dirName: handle.name })
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') console.error(err)
    }
  }, [updateData])

  const handlePrefixBlur = useCallback(() => {
    if (prefixRef.current) updateData({ prefix: prefixRef.current.value })
  }, [updateData])

  const stopPropagation = (e: React.KeyboardEvent) => e.stopPropagation()
  const hasSaved = (d.savedCount ?? 0) > 0

  return (
    <NodeShell title={d.label ?? '图片保存'} icon={<FolderDown size={13} />} selected={selected} runState={d as any} onRename={(name) => updateData({ label: name })}>
      <NodeResizer minWidth={180} minHeight={120} isVisible={selected} lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }} handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }} />

      <Handle type="target" position={Position.Left} id="images" style={handleStyle('images', 'left')} title="image[]" />

      <div style={{ marginBottom: 8 }}>
        <div style={labelStyle}>保存路径</div>
        <button
          onClick={handlePickFolder}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: d.dirName ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${d.dirName ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 6, cursor: 'pointer', textAlign: 'left', color: d.dirName ? '#fb923c' : '#555', fontSize: 11, overflow: 'hidden' }}
        >
          <FolderOpen size={12} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.dirName ?? '点击选择文件夹'}
          </span>
        </button>
      </div>

      <div style={{ marginBottom: hasSaved ? 10 : 0 }}>
        <div style={labelStyle}>文件名前缀</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            ref={prefixRef}
            defaultValue={d.prefix ?? 'output'}
            onBlur={handlePrefixBlur}
            onKeyDown={stopPropagation}
            placeholder="output"
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '5px 8px', fontSize: 11, color: '#e0e0e0', outline: 'none' }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
            onBlurCapture={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
          />
          <span style={{ fontSize: 10, color: '#444', whiteSpace: 'nowrap' }}>_001.png</span>
        </div>
      </div>

      {hasSaved && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>已保存 {d.savedCount} 张</div>
          {(d.savedPreviews?.length ?? 0) > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
              {d.savedPreviews!.slice(0, 4).map((src, i) => (
                <img key={i} src={src} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }} />
              ))}
            </div>
          )}
        </div>
      )}
    </NodeShell>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
