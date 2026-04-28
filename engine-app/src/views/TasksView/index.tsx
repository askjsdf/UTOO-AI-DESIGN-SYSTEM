import { useState } from 'react'
import { Workflow, LayoutDashboard, CheckCircle, XCircle, Loader2, Clock, AlertTriangle, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { TaskRecord } from '../../types'
import TaskDetailPanel from './TaskDetailPanel'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function TaskCard({
  task,
  isSelected,
  onClick,
}: {
  task: TaskRecord
  isSelected: boolean
  onClick: () => void
}) {
  const completedNodes = Object.values(task.nodeLog).filter((n) => n.status === 'completed').length
  const totalNodes = Object.values(task.nodeLog).length
  const totalDuration = task.completedAt && task.startedAt ? task.completedAt - task.startedAt : undefined

  const statusDot = {
    queued: (
      <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid #555', flexShrink: 0 }} />
    ),
    running: (
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
    ),
    completed: <CheckCircle size={9} color="#4ade80" style={{ flexShrink: 0 }} />,
    error: <XCircle size={9} color="#f87171" style={{ flexShrink: 0 }} />,
    interrupted: <AlertTriangle size={9} color="#fb923c" style={{ flexShrink: 0 }} />,
  }[task.status]

  const statusText = {
    queued: '排队中',
    running: '运行中',
    completed: '已完成',
    error: '失败',
    interrupted: '已中断',
  }[task.status]

  const statusColor = {
    queued: '#666',
    running: '#60a5fa',
    completed: '#4ade80',
    error: '#f87171',
    interrupted: '#fb923c',
  }[task.status]

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px',
        marginBottom: 4,
        borderRadius: 8,
        border: isSelected
          ? '1px solid rgba(255,255,255,0.15)'
          : '1px solid rgba(255,255,255,0.06)',
        background: isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {/* 顶行：状态 + 名称 + 来源 + 时间 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {statusDot}
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.workflowName}
        </span>
        {task.source === 'canvas'
          ? <LayoutDashboard size={10} color="#555" style={{ flexShrink: 0 }} />
          : <Workflow size={10} color="#555" style={{ flexShrink: 0 }} />
        }
        <span style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>{formatTimeAgo(task.createdAt)}</span>
      </div>

      {/* 底行：进度 + 耗时 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 输入缩略图 */}
        <div style={{ display: 'flex', gap: 2 }}>
          {task.inputPreviews.slice(0, 3).map((src, i) => (
            <img key={i} src={src} style={{ width: 20, height: 20, borderRadius: 3, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)' }} />
          ))}
        </div>

        {/* 节点进度 */}
        {task.status === 'running' && totalNodes > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <Loader2 size={9} color="#60a5fa" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
              <div style={{
                height: '100%',
                width: `${(completedNodes / totalNodes) * 100}%`,
                background: '#60a5fa',
                borderRadius: 1,
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{completedNodes}/{totalNodes}</span>
          </div>
        )}

        {task.status === 'queued' && (
          <span style={{ fontSize: 10, color: '#555', flex: 1 }}>等待执行…</span>
        )}

        {/* 状态文字 + 耗时 */}
        <span style={{ fontSize: 10, color: statusColor, flexShrink: 0, marginLeft: 'auto' }}>
          {statusText}
          {totalDuration !== undefined && ` · ${formatDuration(totalDuration)}`}
        </span>
      </div>

      {/* 错误摘要 */}
      {task.status === 'error' && task.errorMessage && (
        <div style={{ marginTop: 5, fontSize: 10, color: '#9b5454', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.errorMessage}
        </div>
      )}
    </div>
  )
}

export default function TasksView() {
  const { tasks, clearFinishedTasks, isTaskRunning } = useAppStore()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null
  const queuedCount = tasks.filter((t) => t.status === 'queued').length
  const finishedCount = tasks.filter((t) => ['completed', 'error', 'interrupted'].includes(t.status)).length

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* 左侧：任务列表 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 工具栏 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
          gap: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', flex: 1 }}>任务进度</span>

          {queuedCount > 0 && (
            <span style={{ fontSize: 10, color: '#60a5fa' }}>
              {queuedCount} 个排队
            </span>
          )}

          {isTaskRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} color="#60a5fa" />
              <span style={{ fontSize: 10, color: '#60a5fa' }}>执行中</span>
            </div>
          )}

          {finishedCount > 0 && (
            <button
              onClick={clearFinishedTasks}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: '#555', fontSize: 10, cursor: 'pointer',
              }}
            >
              <Trash2 size={9} />
              清除已完成
            </button>
          )}
        </div>

        {/* 任务列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {tasks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
              <Clock size={24} color="#333" />
              <p style={{ fontSize: 12, color: '#444', textAlign: 'center' }}>
                暂无任务记录<br />
                <span style={{ fontSize: 11, color: '#333' }}>在工作流或画布中发起运行后会显示在这里</span>
              </p>
            </div>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isSelected={selectedTaskId === task.id}
                onClick={() => setSelectedTaskId(selectedTaskId === task.id ? null : task.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* 右侧：详情面板 */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
      `}</style>
    </div>
  )
}
