import { useCallback, useEffect, useRef } from 'react'
import { Handle, Position, NodeResizer, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { Sparkles, Plus, X } from 'lucide-react'
import NodeShell from './NodeShell'
import { PORT_COLORS } from './portStyles'
import { useAppStore } from '../../../store/appStore'

// ── 类型 ─────────────────────────────────────────────────────────

export interface LLMInputSlot {
  id: string
  type: 'image' | 'text'
  name: string
}

export interface LLMNodeData {
  label: string
  model: string
  systemPrompt: string
  inputSlots: LLMInputSlot[]
  // 运行后填充
  outputText?: string
}

const MODELS = [
  { value: 'gemini-3.1-pro-preview',       label: 'Gemini 3.1 Pro' },
  { value: 'gemini-3-flash-preview',        label: 'Gemini 3 Flash' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
]

// NodeShell 的 content padding 是 10px，所以槽的 Handle 需要偏移 -(10+6) = -16
const SLOT_HANDLE_LEFT = -16

// ── 组件 ─────────────────────────────────────────────────────────

export default function LLMNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as LLMNodeData
  const slots: LLMInputSlot[] = d.inputSlots ?? []
  const systemPromptRef = useRef<HTMLTextAreaElement>(null)
  const updateNodeInternals = useUpdateNodeInternals()

  // 槽位数量变化时通知 React Flow 重新测量 Handle 位置
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, slots.length, updateNodeInternals])

  const updateData = useCallback((patch: Partial<LLMNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  const stopProp = (e: React.KeyboardEvent) => e.stopPropagation()

  // ── 槽操作 ───────────────────────────────────────────────────

  const addSlot = useCallback(() => {
    const newSlot: LLMInputSlot = {
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
      inputSlots: slots.map((s) =>
        s.id === slotId ? { ...s, name } : s
      ),
    })
  }, [slots, updateData])

  return (
    <NodeShell title={d.label ?? 'LLM'} icon={<Sparkles size={13} />} selected={selected} runState={d as any} onRename={(name) => updateData({ label: name })}>
      <NodeResizer minWidth={240} minHeight={200} isVisible={selected} lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }} handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }} />
      {/* ── 模型选择 ──────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>模型</div>
        <select
          value={d.model ?? 'gemini-2.0-flash'}
          onChange={(e) => updateData({ model: e.target.value })}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '5px 8px',
            fontSize: 11,
            color: '#e0e0e0',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── System Prompt ─────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={labelStyle}>System Prompt</div>
        <textarea
          ref={systemPromptRef}
          defaultValue={d.systemPrompt ?? ''}
          onBlur={(e) => updateData({ systemPrompt: e.target.value })}
          onKeyDown={stopProp}
          placeholder="系统指令（可选）"
          rows={4}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '7px 8px',
            fontSize: 11,
            color: '#e0e0e0',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.6,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(168,85,247,0.4)')}
          onBlurCapture={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
        />
      </div>

      {/* ── 输入端口 ──────────────────────────────────────── */}
      <div style={{ marginBottom: slots.length > 0 ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={labelStyle}>输入端口</div>
          <button
            onClick={addSlot}
            title="添加输入槽"
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '2px 6px',
              cursor: 'pointer',
              color: '#aaa',
              fontSize: 10,
            }}
          >
            <Plus size={10} /> 添加
          </button>
        </div>

        {slots.map((slot) => (
          <div
            key={slot.id}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginBottom: 5,
              paddingLeft: 4,
            }}
          >
            {/* Handle — 偏移到节点左边缘 */}
            <Handle
              type="target"
              position={Position.Left}
              id={slot.id}
              style={{
                background: slot.type === 'image' ? PORT_COLORS.image : PORT_COLORS.text,
                border: '2px solid #0a0a0a',
                width: 11,
                height: 11,
                position: 'absolute',
                left: SLOT_HANDLE_LEFT,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />

            {/* 类型切换按钮 */}
            <button
              onClick={() => toggleSlotType(slot.id)}
              title="切换类型"
              style={{
                flexShrink: 0,
                background: slot.type === 'image'
                  ? 'rgba(249,115,22,0.15)'
                  : 'rgba(59,130,246,0.15)',
                border: `1px solid ${slot.type === 'image' ? 'rgba(249,115,22,0.3)' : 'rgba(59,130,246,0.3)'}`,
                borderRadius: 4,
                padding: '2px 5px',
                cursor: 'pointer',
                fontSize: 9,
                color: slot.type === 'image' ? '#fb923c' : '#60a5fa',
                whiteSpace: 'nowrap',
              }}
            >
              {slot.type === 'image' ? 'img' : 'txt'}
            </button>

            {/* 名称输入 */}
            <input
              key={slot.id + '-name'}
              defaultValue={slot.name}
              onBlur={(e) => renameSlot(slot.id, e.target.value)}
              onKeyDown={stopProp}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                padding: '3px 6px',
                fontSize: 11,
                color: '#ccc',
                outline: 'none',
                minWidth: 0,
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
              onBlurCapture={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.06)')}
            />

            {/* 删除按钮 */}
            <button
              onClick={() => removeSlot(slot.id)}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#444',
                padding: 2,
                borderRadius: 3,
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

      {/* 输出端口 */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        style={{
          background: PORT_COLORS.text,
          border: '2px solid #0a0a0a',
          width: 11,
          height: 11,
          right: -6,
        }}
        title="text"
      />
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
