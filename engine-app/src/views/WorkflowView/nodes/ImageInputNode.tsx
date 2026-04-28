import { useCallback } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { ImageIcon, X, FolderOpen, LayoutPanelLeft } from 'lucide-react'
import NodeShell from './NodeShell'
import { handleStyle } from './portStyles'
import { useAppStore } from '../../../store/appStore'

// 来源模式
export type ImageInputSource = 'file' | 'canvas'

export interface ImageInputNodeData {
  label: string
  sourceMode: ImageInputSource
  // 当前持有的图片（base64 数组，支持多张用于批量）
  images: string[]
  previews: string[]   // data URL，用于显示
  fileNames: string[]
  // 运行状态
  _status?: 'idle' | 'running' | 'completed' | 'error'
  _startedAt?: number
  _duration?: number
  errorMessage?: string
}

export default function ImageInputNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageInputNodeData
  const images = d.images ?? []
  const previews = d.previews ?? []
  const source = d.sourceMode ?? 'file'

  const updateData = useCallback((patch: Partial<ImageInputNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  // 文件来源：点击选择单张图片
  const handlePickFile = useCallback(async () => {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }],
      })
      const file = await handle.getFile()
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        const base64 = dataUrl.split(',')[1]
        updateData({ images: [base64], previews: [dataUrl], fileNames: [file.name] })
      }
      reader.readAsDataURL(file)
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e)
    }
  }, [updateData])

  const handleClear = useCallback(() => {
    updateData({ images: [], previews: [], fileNames: [] })
  }, [updateData])

  const hasImages = images.length > 0

  return (
    <NodeShell
      title={d.label ?? '图片输入'}
      icon={<ImageIcon size={13} />}
      selected={selected}
      runState={d as any}
      onRename={(name) => updateData({ label: name })}
    >
      <NodeResizer minWidth={200} minHeight={160} isVisible={selected} lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }} handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }} />

      {/* 来源切换 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['file', 'canvas'] as ImageInputSource[]).map((mode) => {
          const labels = { file: '📁 文件', canvas: '🎨 画布' }
          const isActive = source === mode
          return (
            <button
              key={mode}
              onClick={() => updateData({ sourceMode: mode, images: [], previews: [], fileNames: [] })}
              style={{
                flex: 1, fontSize: 10, padding: '4px 0', borderRadius: 5, cursor: 'pointer',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                color: isActive ? '#e0e0e0' : '#555',
                transition: 'all 0.15s',
              }}
            >
              {labels[mode]}
            </button>
          )
        })}
      </div>

      {/* 图片区域 */}
      {hasImages ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* 缩略图网格 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: previews.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 4, flex: 1, minHeight: 0,
          }}>
            {previews.slice(0, 4).map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={src} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.06)', display: 'block' }} />
                {previews.length > 4 && i === 3 && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 600 }}>
                    +{previews.length - 3}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#555' }}>
              {images.length} 张图片
              {source === 'canvas' && <span style={{ color: '#2dd4bf', marginLeft: 4 }}>· 来自画布</span>}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {source === 'file' && (
                <button onClick={handlePickFile} style={smallBtnStyle}>
                  <FolderOpen size={10} />
                </button>
              )}
              <button onClick={handleClear} style={{ ...smallBtnStyle, color: '#f87171' }}>
                <X size={10} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 空状态 */
        source === 'file' ? (
          <button
            onClick={handlePickFile}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: '#555', transition: 'border-color 0.15s', minHeight: 80 }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          >
            <ImageIcon size={18} color="#444" />
            <span style={{ fontSize: 11 }}>点击选择图片</span>
          </button>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1.5px dashed rgba(20,184,166,0.2)', borderRadius: 6, minHeight: 80 }}>
            <LayoutPanelLeft size={18} color="#2dd4bf" style={{ opacity: 0.5 }} />
            <span style={{ fontSize: 11, color: '#2dd4bf', opacity: 0.6 }}>等待画布注入图片</span>
          </div>
        )
      )}

      <Handle type="source" position={Position.Right} id="image" style={handleStyle('image', 'right')} title="image" />
    </NodeShell>
  )
}

const smallBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#666',
}
