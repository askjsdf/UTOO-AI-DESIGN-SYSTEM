// 所有节点共享的外壳

import { useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

export interface RunState {
  _status?: 'running' | 'completed' | 'error'
  _startedAt?: number
  _duration?: number
}

interface NodeShellProps {
  title: string
  icon?: React.ReactNode
  selected?: boolean
  runState?: RunState
  children: React.ReactNode
  onRename?: (name: string) => void
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// 标题栏右侧的状态指示器
function StatusBadge({ runState }: { runState?: RunState }) {
  const [elapsed, setElapsed] = useState(0)
  const status = runState?._status
  const startedAt = runState?._startedAt
  const duration = runState?._duration

  useEffect(() => {
    if (status !== 'running' || !startedAt) {
      setElapsed(0)
      return
    }
    setElapsed(Date.now() - startedAt)
    const id = setInterval(() => setElapsed(Date.now() - startedAt!), 100)
    return () => clearInterval(id)
  }, [status, startedAt])

  if (!status) return null

  if (status === 'running') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{
          width: 12, height: 12, borderRadius: '50%',
          border: '1.5px solid rgba(99,179,237,0.8)',
          borderTopColor: 'transparent',
          animation: 'spin 0.7s linear infinite',
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: 10, color: 'rgba(99,179,237,0.9)', fontVariantNumeric: 'tabular-nums' }}>
          {formatMs(elapsed)}
        </span>
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <CheckCircle size={12} color="#4ade80" />
        {duration !== undefined && (
          <span style={{ fontSize: 10, color: '#4ade80', fontVariantNumeric: 'tabular-nums' }}>
            {formatMs(duration)}
          </span>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return <XCircle size={12} color="#f87171" />
  }

  return null
}

// 边框颜色
function borderColor(selected: boolean, status?: string): string {
  if (status === 'running') return 'rgba(99,179,237,0.6)'
  if (status === 'completed') return 'rgba(74,222,128,0.4)'
  if (status === 'error') return 'rgba(248,113,113,0.6)'
  return selected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'
}

// 外发光
function boxShadow(selected: boolean, status?: string): string {
  if (status === 'running') return '0 0 0 2px rgba(99,179,237,0.15), 0 2px 12px rgba(0,0,0,0.5)'
  if (status === 'error') return '0 0 0 2px rgba(248,113,113,0.15), 0 2px 12px rgba(0,0,0,0.5)'
  return selected ? '0 0 0 3px rgba(255,255,255,0.06)' : '0 2px 12px rgba(0,0,0,0.5)'
}

export default function NodeShell({ title, icon, selected = false, runState, children, onRename }: NodeShellProps) {
  const status = runState?._status
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    if (!onRename) return
    setEditValue(title)
    setEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  const commitEdit = () => {
    const name = editValue.trim()
    if (name && name !== title) onRename?.(name)
    setEditing(false)
  }

  return (
    <>
      {/* spin 关键帧：注入一次即可，重复注入无害 */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 10,
          border: `1.5px solid ${borderColor(selected, status)}`,
          background: '#161616',
          boxShadow: boxShadow(selected, status),
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '8px 8px 0 0',
            overflow: 'hidden',
          }}
        >
          {icon && <span style={{ color: '#888', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>}
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#e0e0e0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '0 5px', outline: 'none', minWidth: 0 }}
            />
          ) : (
            <span
              style={{ fontSize: 12, fontWeight: 500, color: '#e0e0e0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: onRename ? 'text' : 'default' }}
              onDoubleClick={startEdit}
              title={onRename ? '双击重命名' : undefined}
            >
              {title}
            </span>
          )}
          <StatusBadge runState={runState} />
        </div>

        {/* 内容 */}
        <div style={{ padding: '10px', height: 'calc(100% - 32px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </>
  )
}
