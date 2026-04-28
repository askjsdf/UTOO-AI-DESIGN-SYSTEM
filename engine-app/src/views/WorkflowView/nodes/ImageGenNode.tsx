import { useCallback, useEffect, useState } from 'react'
import { Handle, Position, NodeResizer, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { ImagePlay, Plus, X, Eye, EyeOff, Copy, Check } from 'lucide-react'
import NodeShell from './NodeShell'
import { PORT_COLORS } from './portStyles'
import { useAppStore } from '../../../store/appStore'
import { MODELS } from '../../../config/models'

// ── 类型 ─────────────────────────────────────────────────────────

export interface ImageGenInputSlot {
  id: string
  type: 'image' | 'text'
  name: string
}

export interface ImageGenNodeData {
  label: string
  model: string
  aspectRatio: string
  count: number
  negativePrompt?: string
  inputSlots: ImageGenInputSlot[]
  // 运行后填充
  _outputPreviews?: string[]
  _lastPrompt?: string       // 上次运行实际发送的文本 prompt
}

// ── 常量 ─────────────────────────────────────────────────────────

const IMAGE_MODELS = [
  { value: MODELS.IMAGE.FLASH, label: 'Nano Banana 2 (Flash)' },
  { value: MODELS.IMAGE.PRO,   label: 'Nano Banana Pro'       },
]

const ASPECT_RATIOS = [
  { value: '1:1',  label: '1:1',  desc: 'square 1:1 composition' },
  { value: '3:4',  label: '3:4',  desc: 'portrait 3:4 vertical format' },
  { value: '4:3',  label: '4:3',  desc: 'landscape 4:3 horizontal format' },
  { value: '9:16', label: '9:16', desc: 'tall vertical 9:16 portrait format' },
  { value: '16:9', label: '16:9', desc: 'wide horizontal 16:9 widescreen format' },
]

const SLOT_HANDLE_LEFT = -16

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  padding: '5px 8px',
  fontSize: 11,
  color: '#e0e0e0',
  outline: 'none',
  cursor: 'pointer',
}

// ── 子组件：提示词预览弹窗 ────────────────────────────────────────

function PromptPreview({
  lastPrompt,
  slots,
  aspectRatio,
  negativePrompt,
  onClose,
}: {
  lastPrompt?: string
  slots: ImageGenInputSlot[]
  aspectRatio: string
  negativePrompt?: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const arEntry = ASPECT_RATIOS.find((r) => r.value === aspectRatio)

  // 构建预览内容
  const previewLines: string[] = []

  if (lastPrompt) {
    // 上次实际发送的 prompt
    previewLines.push(lastPrompt)
  } else {
    // 设计时预览（用槽名做占位符）
    const textSlots = slots.filter((s) => s.type === 'text')
    const imgSlots  = slots.filter((s) => s.type === 'image')

    if (imgSlots.length > 0) {
      imgSlots.forEach((s) => previewLines.push(`[图片: ${s.name}]`))
    }
    if (textSlots.length > 0) {
      textSlots.forEach((s) => previewLines.push(`{${s.name} 的文本内容}`))
    } else {
      previewLines.push('（未连接任何文本端口）')
    }

    if (arEntry?.desc) previewLines.push(arEntry.desc)
    if (negativePrompt?.trim()) previewLines.push(`avoid: ${negativePrompt.trim()}`)
  }

  const fullText = previewLines.join('\n\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 999,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(4px)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
      }}
    >
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '0.05em' }}>
          {lastPrompt ? '实际发送的提示词' : '提示词预览（运行前）'}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleCopy}
            title="复制"
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4, padding: '3px 7px', cursor: 'pointer',
              color: copied ? '#4ade80' : '#aaa', fontSize: 10,
            }}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? '已复制' : '复制'}
          </button>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#555', padding: 2, borderRadius: 3,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 提示词内容 */}
      <textarea
        readOnly
        value={fullText}
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 11,
          color: '#d0d0d0',
          lineHeight: 1.7,
          resize: 'none',
          outline: 'none',
          fontFamily: 'monospace',
        }}
      />

      {/* 注释 */}
      {!lastPrompt && (
        <div style={{ fontSize: 9, color: '#444', marginTop: 6, lineHeight: 1.5 }}>
          运行后此处将显示实际发送给 Nano Banana 的完整提示词
        </div>
      )}
    </div>
  )
}

// ── 主节点组件 ────────────────────────────────────────────────────

export default function ImageGenNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageGenNodeData
  const slots: ImageGenInputSlot[] = d.inputSlots ?? []
  const updateNodeInternals = useUpdateNodeInternals()
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, slots.length, updateNodeInternals])

  const updateData = useCallback((patch: Partial<ImageGenNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  const stopProp = (e: React.KeyboardEvent) => e.stopPropagation()

  // ── 槽操作 ────────────────────────────────────────────────────

  const addSlot = useCallback(() => {
    const newSlot: ImageGenInputSlot = {
      id: `slot-${Date.now()}`,
      type: 'text',
      name: `输入${slots.length + 1}`,
    }
    updateData({ inputSlots: [...slots, newSlot] })
  }, [slots, updateData])

  const removeSlot = useCallback((slotId: string) => {
    updateData({ inputSlots: slots.filter((s) => s.id !== slotId) })
  }, [slots, updateData])

  const toggleSlotType = useCallback((slotId: string) => {
    updateData({
      inputSlots: slots.map((s) =>
        s.id === slotId ? { ...s, type: s.type === 'image' ? 'text' : 'image' } : s
      ),
    })
  }, [slots, updateData])

  const renameSlot = useCallback((slotId: string, name: string) => {
    updateData({
      inputSlots: slots.map((s) => s.id === slotId ? { ...s, name } : s),
    })
  }, [slots, updateData])

  return (
    <NodeShell
      title={d.label ?? '图片生成'}
      icon={<ImagePlay size={13} />}
      selected={selected}
      runState={d as any}
      onRename={(name) => updateData({ label: name })}
    >
      <NodeResizer
        minWidth={240} minHeight={200}
        isVisible={selected}
        lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }}
        handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }}
      />

      {/* ── 提示词预览覆盖层 ──────────────────────────────── */}
      {showPreview && (
        <PromptPreview
          lastPrompt={d._lastPrompt}
          slots={slots}
          aspectRatio={d.aspectRatio ?? '1:1'}
          negativePrompt={d.negativePrompt}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* ── 模型 ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>模型</div>
        <select
          value={d.model ?? MODELS.IMAGE.FLASH}
          onChange={(e) => updateData({ model: e.target.value })}
          onKeyDown={stopProp}
          style={selectStyle}
        >
          {IMAGE_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── 比例 + 数量 ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 2 }}>
          <div style={labelStyle}>比例</div>
          <select
            value={d.aspectRatio ?? '1:1'}
            onChange={(e) => updateData({ aspectRatio: e.target.value })}
            onKeyDown={stopProp}
            style={selectStyle}
          >
            {ASPECT_RATIOS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>数量</div>
          <select
            value={d.count ?? 1}
            onChange={(e) => updateData({ count: Number(e.target.value) })}
            onKeyDown={stopProp}
            style={selectStyle}
          >
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* ── 负面提示词 ────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>负面提示词</div>
        <textarea
          defaultValue={d.negativePrompt ?? ''}
          onBlur={(e) => updateData({ negativePrompt: e.target.value })}
          onKeyDown={stopProp}
          placeholder="不希望出现的元素，如：no text, no watermark, no blurry"
          rows={2}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 11,
            color: '#e0e0e0',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.5,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(248,113,113,0.4)')}
          onBlurCapture={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
        />
      </div>

      {/* ── 输入端口 ──────────────────────────────────────── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={labelStyle}>输入端口</div>
          <button
            onClick={addSlot}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, padding: '2px 6px',
              cursor: 'pointer', color: '#aaa', fontSize: 10,
            }}
          >
            <Plus size={10} /> 添加
          </button>
        </div>

        {slots.map((slot) => (
          <div
            key={slot.id}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center',
              gap: 5, marginBottom: 5, paddingLeft: 4,
            }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={slot.id}
              style={{
                background: slot.type === 'image' ? PORT_COLORS.image : PORT_COLORS.text,
                border: '2px solid #0a0a0a',
                width: 11, height: 11,
                position: 'absolute',
                left: SLOT_HANDLE_LEFT,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />

            {/* 类型切换 */}
            <button
              onClick={() => toggleSlotType(slot.id)}
              title="切换类型"
              style={{
                flexShrink: 0,
                background: slot.type === 'image' ? 'rgba(249,115,22,0.15)' : 'rgba(59,130,246,0.15)',
                border: `1px solid ${slot.type === 'image' ? 'rgba(249,115,22,0.3)' : 'rgba(59,130,246,0.3)'}`,
                borderRadius: 4, padding: '2px 5px',
                cursor: 'pointer', fontSize: 9,
                color: slot.type === 'image' ? '#fb923c' : '#60a5fa',
                whiteSpace: 'nowrap',
              }}
            >
              {slot.type === 'image' ? 'img' : 'txt'}
            </button>

            {/* 名称 */}
            <input
              key={slot.id + '-name'}
              defaultValue={slot.name}
              onBlur={(e) => renameSlot(slot.id, e.target.value)}
              onKeyDown={stopProp}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4, padding: '3px 6px',
                fontSize: 11, color: '#ccc',
                outline: 'none', minWidth: 0,
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
              onBlurCapture={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.06)')}
            />

            {/* 删除 */}
            <button
              onClick={() => removeSlot(slot.id)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center',
                background: 'transparent', border: 'none',
                cursor: 'pointer', color: '#444', padding: 2, borderRadius: 3,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
            >
              <X size={11} />
            </button>
          </div>
        ))}

        {slots.length === 0 && (
          <div style={{ fontSize: 10, color: '#333', textAlign: 'center', padding: '8px 0' }}>
            点击"添加"配置输入端口
          </div>
        )}
      </div>

      {/* ── 提示词预览按钮 ────────────────────────────────── */}
      <button
        onClick={() => setShowPreview(true)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '6px 0',
          background: d._lastPrompt ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${d._lastPrompt ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 6,
          cursor: 'pointer',
          color: d._lastPrompt ? '#D4AF37' : '#555',
          fontSize: 10,
          marginBottom: d._outputPreviews?.length ? 8 : 0,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(212,175,55,0.45)'
          e.currentTarget.style.color = '#D4AF37'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = d._lastPrompt ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.08)'
          e.currentTarget.style.color = d._lastPrompt ? '#D4AF37' : '#555'
        }}
      >
        {showPreview ? <EyeOff size={11} /> : <Eye size={11} />}
        提示词预览
        {d._lastPrompt && (
          <span style={{ fontSize: 9, opacity: 0.6 }}>· 上次运行</span>
        )}
      </button>

      {/* ── 生成结果预览 ──────────────────────────────────── */}
      {d._outputPreviews && d._outputPreviews.length > 0 && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 8,
          display: 'grid',
          gridTemplateColumns: d._outputPreviews.length === 1 ? '1fr' : '1fr 1fr',
          gap: 4,
        }}>
          {d._outputPreviews.map((src, i) => (
            <img
              key={i}
              src={src}
              style={{
                width: '100%',
                aspectRatio: (d.aspectRatio ?? '1:1').replace(':', '/'),
                objectFit: 'cover',
                borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'block',
              }}
            />
          ))}
        </div>
      )}

      {/* ── 输出端口 ──────────────────────────────────────── */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        style={{
          background: PORT_COLORS.image,
          border: '2px solid #0a0a0a',
          width: 11, height: 11,
          right: -6,
        }}
        title="generated image"
      />
    </NodeShell>
  )
}
