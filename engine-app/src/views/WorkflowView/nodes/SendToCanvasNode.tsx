import { useCallback } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { LayoutPanelLeft, CheckCircle, Zap, Settings2 } from 'lucide-react'
import NodeShell from './NodeShell'
import { handleStyle } from './portStyles'
import { useAppStore } from '../../../store/appStore'

export interface SendToCanvasNodeData {
  label: string
  mode: 'auto' | 'manual'       // 自动回源 | 手动指定
  targetProjectId: string | null // 手动模式下的目标项目
  status?: 'idle' | 'running' | 'completed' | 'error'
  errorMessage?: string
  _sentCount?: number
  _resolvedProjectId?: string    // 执行后填入：实际发送到的项目 ID
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

export default function SendToCanvasNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as SendToCanvasNodeData
  const canvasProjects = useAppStore((s) => s.canvasProjects)
  const currentCanvasProjectId = useAppStore((s) => s.currentCanvasProjectId)

  const mode = d.mode ?? 'auto'
  const hasSent = (d._sentCount ?? 0) > 0

  // 自动模式下预览目标项目名
  const autoTargetProject = canvasProjects.find(
    (p) => p.id === (currentCanvasProjectId ?? undefined)
  )

  // 手动模式下已选择的项目
  const manualTargetProject = canvasProjects.find((p) => p.id === d.targetProjectId)

  // 执行后实际发送到的项目
  const resolvedProject = canvasProjects.find((p) => p.id === d._resolvedProjectId)

  const updateData = useCallback((patch: Partial<SendToCanvasNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  return (
    <NodeShell
      title={d.label ?? '发送到画布'}
      icon={<LayoutPanelLeft size={13} />}
      selected={selected}
      runState={d as any}
      onRename={(name) => updateData({ label: name })}
    >
      <NodeResizer
        minWidth={200} minHeight={130} isVisible={selected}
        lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }}
        handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }}
      />

      <Handle type="target" position={Position.Left} id="images" style={handleStyle('images', 'left')} title="image[]" />

      {/* ── 模式切换 ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['auto', 'manual'] as const).map((m) => {
          const isActive = mode === m
          const Icon = m === 'auto' ? Zap : Settings2
          const label = m === 'auto' ? '自动' : '手动'
          return (
            <button
              key={m}
              onClick={() => updateData({ mode: m })}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontSize: 11, padding: '5px 0', borderRadius: 6, cursor: 'pointer',
                background: isActive
                  ? m === 'auto' ? 'rgba(20,184,166,0.15)' : 'rgba(99,102,241,0.15)'
                  : 'transparent',
                border: `1px solid ${isActive
                  ? m === 'auto' ? 'rgba(20,184,166,0.4)' : 'rgba(99,102,241,0.4)'
                  : 'rgba(255,255,255,0.06)'}`,
                color: isActive
                  ? m === 'auto' ? '#2dd4bf' : '#818cf8'
                  : '#555',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={10} />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── 自动模式说明 ──────────────────────────────────── */}
      {mode === 'auto' && (
        <div style={{
          padding: '8px 10px',
          background: 'rgba(20,184,166,0.06)',
          border: '1px solid rgba(20,184,166,0.15)',
          borderRadius: 6,
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, color: '#2dd4bf', marginBottom: 4, fontWeight: 600 }}>
            自动回源
          </div>
          <div style={{ fontSize: 10, color: '#666', lineHeight: 1.6 }}>
            画布触发时 → 发回来源画布<br />
            手动运行时 → 发到当前打开的画布
          </div>
          {autoTargetProject && (
            <div style={{
              marginTop: 6,
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: '#2dd4bf', opacity: 0.8,
            }}>
              <LayoutPanelLeft size={9} />
              当前：{autoTargetProject.name}
            </div>
          )}
          {!autoTargetProject && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#555' }}>
              当前无打开的画布项目
            </div>
          )}
        </div>
      )}

      {/* ── 手动模式：项目选择 ────────────────────────────── */}
      {mode === 'manual' && (
        <div style={{ marginBottom: 8 }}>
          <div style={labelStyle}>目标项目</div>
          <select
            value={d.targetProjectId ?? ''}
            onChange={(e) => updateData({ targetProjectId: e.target.value || null })}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: d.targetProjectId ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${d.targetProjectId ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6, padding: '6px 8px',
              fontSize: 11,
              color: d.targetProjectId ? '#818cf8' : '#555',
              outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">选择目标项目…</option>
            {canvasProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {!d.targetProjectId && (
            <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>
              无论何种触发方式，都发送到此项目
            </div>
          )}
        </div>
      )}

      {/* ── 执行结果 ──────────────────────────────────────── */}
      {hasSent && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 8px',
          background: 'rgba(20,184,166,0.08)',
          border: '1px solid rgba(20,184,166,0.2)',
          borderRadius: 6,
        }}>
          <CheckCircle size={11} color="#2dd4bf" />
          <span style={{ fontSize: 11, color: '#2dd4bf' }}>
            已发送 {d._sentCount} 张
            {resolvedProject ? `→「${resolvedProject.name}」` : ''}
          </span>
        </div>
      )}

      {/* 手动模式已选项目但未发送时的预览提示 */}
      {!hasSent && mode === 'manual' && manualTargetProject && (
        <div style={{ fontSize: 10, color: '#444', textAlign: 'center', padding: '4px 0' }}>
          运行后发送到「{manualTargetProject.name}」
        </div>
      )}
    </NodeShell>
  )
}
