import { useCallback } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { ImageIcon, X } from 'lucide-react'
import NodeShell from './NodeShell'
import { handleStyle } from './portStyles'
import { useAppStore } from '../../../store/appStore'

export interface ImageUploadNodeData {
  label: string
  imageBase64?: string
  imagePreview?: string
  imageName?: string
}

export default function ImageUploadNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageUploadNodeData

  const updateData = useCallback((patch: Partial<ImageUploadNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  const handleClick = useCallback(async () => {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }],
      })
      const file = await handle.getFile()
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        const base64 = dataUrl.split(',')[1]
        updateData({ imageBase64: base64, imagePreview: dataUrl, imageName: file.name })
      }
      reader.readAsDataURL(file)
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e)
    }
  }, [updateData])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    updateData({ imageBase64: undefined, imagePreview: undefined, imageName: undefined })
  }, [updateData])

  return (
    <NodeShell title={d.label ?? '图片加载'} icon={<ImageIcon size={13} />} selected={selected} runState={d as any}>
      <NodeResizer minWidth={180} minHeight={140} isVisible={selected} lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }} handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }} />

      {d.imagePreview ? (
        <div style={{ position: 'relative' }}>
          <img
            src={d.imagePreview}
            style={{
              width: '100%',
              aspectRatio: '16/9',
              objectFit: 'cover',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'block',
            }}
          />
          <div style={{ fontSize: 10, color: '#666', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.imageName}
          </div>
          <button
            onClick={handleClear}
            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: 4, padding: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#ccc' }}
          >
            <X size={11} />
          </button>
          <button
            onClick={handleClick}
            style={{ marginTop: 6, width: '100%', fontSize: 11, color: '#666', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 0', cursor: 'pointer' }}
          >
            重新选择
          </button>
        </div>
      ) : (
        <button
          onClick={handleClick}
          style={{ width: '100%', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed rgba(255,255,255,0.12)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#555', transition: 'border-color 0.15s' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
        >
          <ImageIcon size={20} color="#444" />
          <span style={{ fontSize: 11 }}>点击选择图片</span>
        </button>
      )}

      <Handle type="source" position={Position.Right} id="image" style={handleStyle('image', 'right')} title="image" />
    </NodeShell>
  )
}
