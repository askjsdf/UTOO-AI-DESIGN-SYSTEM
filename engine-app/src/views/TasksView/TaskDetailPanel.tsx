import { X, RotateCcw, Trash2, Workflow, LayoutDashboard, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'
import type { TaskRecord, TaskNodeLog } from '../../types'
import { useAppStore } from '../../store/appStore'

interface Props {
  task: TaskRecord
  onClose: () => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function NodeLogRow({ entry }: { entry: TaskNodeLog & { id: string } }) {
  const statusIcon = {
    pending:   <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #444' }} />,
    running:   <Loader2 size={10} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />,
    completed: <CheckCircle size={10} color="#4ade80" />,
    error:     <XCircle size={10} color="#f87171" />,
  }[entry.status]

  const statusColor = {
    pending: '#444',
    running: '#60a5fa',
    completed: '#4ade80',
    error: '#f87171',
  }[entry.status]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', flexShrink: 0 }}>{statusIcon}</div>
      <span style={{ flex: 1, fontSize: 11, color: statusColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.label}
      </span>
      {entry.duration !== undefined && (
        <span style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>
          {formatDuration(entry.duration)}
        </span>
      )}
      {entry.status === 'running' && entry.startedAt && (
        <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>运行中…</span>
      )}
    </div>
  )
}

export default function TaskDetailPanel({ task, onClose }: Props) {
  const { retryTask, deleteTask, isTaskRunning, currentTaskId } = useAppStore()

  const isThisRunning = currentTaskId === task.id

  // 节点日志按执行顺序排列：running/completed/error 按 startedAt 排，pending 放最后
  const nodeEntries = Object.entries(task.nodeLog)
    .map(([id, log]) => ({ id, ...log }))
    .sort((a, b) => {
      const aStarted = a.startedAt ?? Infinity
      const bStarted = b.startedAt ?? Infinity
      if (a.status === 'pending' && b.status !== 'pending') return 1
      if (a.status !== 'pending' && b.status === 'pending') return -1
      return aStarted - bStarted
    })

  const totalDuration = task.completedAt && task.startedAt
    ? task.completedAt - task.startedAt
    : undefined

  const handleRetry = async () => {
    await retryTask(task.id)
    onClose()
  }

  const handleDelete = async () => {
    if (!confirm('删除此任务记录？')) return
    await deleteTask(task.id)
    onClose()
  }

  const statusLabel = {
    queued: '排队中',
    running: '运行中',
    completed: '已完成',
    error: '失败',
    interrupted: '已中断',
  }[task.status]

  const statusColor = {
    queued: '#888',
    running: '#60a5fa',
    completed: '#4ade80',
    error: '#f87171',
    interrupted: '#fb923c',
  }[task.status]

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* 标题栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
          ...(task.status === 'running' ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.workflowName}
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>{statusLabel}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 2 }}>
          <X size={13} />
        </button>
      </div>

      {/* 内容区（可滚动）*/}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>

        {/* 来源 + 时间 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={metaChip}>
            {task.source === 'canvas'
              ? <><LayoutDashboard size={9} /><span>画布</span></>
              : <><Workflow size={9} /><span>工作流</span></>
            }
          </div>
          {totalDuration !== undefined && (
            <div style={metaChip}>
              <Clock size={9} />
              <span>{formatDuration(totalDuration)}</span>
            </div>
          )}
        </div>

        {/* 创建时间 */}
        <div style={{ fontSize: 10, color: '#444', marginBottom: 12 }}>
          {formatTime(task.createdAt)}
          {task.startedAt && ` · 开始 ${formatTime(task.startedAt)}`}
        </div>

        {/* 输入图片 */}
        {task.inputPreviews.length > 0 && (
          <section style={{ marginBottom: 14 }}>
            <div style={sectionLabel}>输入图片</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              {task.inputPreviews.map((src, i) => (
                <img key={i} src={src} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.06)' }} />
              ))}
            </div>
          </section>
        )}

        {/* 节点执行日志 */}
        <section style={{ marginBottom: 14 }}>
          <div style={sectionLabel}>执行节点</div>
          {nodeEntries.map((entry) => (
            <NodeLogRow key={entry.id} entry={entry} />
          ))}
        </section>

        {/* 输出图片 */}
        {task.outputPreviews.length > 0 && (
          <section style={{ marginBottom: 14 }}>
            <div style={sectionLabel}>输出图片</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              {task.outputPreviews.map((src, i) => (
                <img key={i} src={src} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 5, border: '1px solid rgba(255,255,255,0.06)' }} />
              ))}
            </div>
          </section>
        )}

        {/* 错误信息 */}
        {task.errorMessage && (
          <div style={{
            padding: '8px 10px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 6,
            fontSize: 10,
            color: '#f87171',
            marginBottom: 12,
            wordBreak: 'break-word',
          }}>
            {task.errorMessage}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        gap: 6,
        flexShrink: 0,
      }}>
        <button
          onClick={handleRetry}
          disabled={isTaskRunning}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '6px 0',
            borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: isTaskRunning ? '#444' : '#ccc',
            fontSize: 11, cursor: isTaskRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <RotateCcw size={11} />
          重新运行
        </button>
        <button
          onClick={handleDelete}
          disabled={isThisRunning}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '6px 10px',
            borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)',
            background: 'rgba(239,68,68,0.08)',
            color: isThisRunning ? '#444' : '#f87171',
            fontSize: 11, cursor: isThisRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
      `}</style>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  color: '#444',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
  fontWeight: 600,
}

const metaChip: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 7px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 10,
  color: '#666',
}
