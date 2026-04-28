import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export default function CanvasProjectPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const {
    canvasProjects,
    currentCanvasProjectId,
    createCanvasProject,
    deleteCanvasProject,
    renameCanvasProject,
    setCurrentCanvasProject,
  } = useAppStore()

  const handleNewProject = async () => {
    const name = `项目 ${canvasProjects.length + 1}`
    await createCanvasProject(name)
  }

  const startRename = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation()
    setEditingId(id)
    setEditingValue(currentName)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const commitRename = async () => {
    if (!editingId) return
    const name = editingValue.trim()
    if (name) await renameCanvasProject(editingId, name)
    setEditingId(null)
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return
    await deleteCanvasProject(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  if (collapsed) {
    return (
      <div
        style={{
          width: 28, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: '#111',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 12, cursor: 'pointer',
        }}
        onClick={() => setCollapsed(false)}
        title="展开项目列表"
      >
        <ChevronRight size={14} color="#444" />
      </div>
    )
  }

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderRight: '1px solid rgba(255,255,255,0.06)',
      background: '#111',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: '#666', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          方案项目
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <IconBtn title="新建项目" onClick={handleNewProject}>
            <Plus size={12} />
          </IconBtn>
          <IconBtn title="收起" onClick={() => setCollapsed(true)}>
            <ChevronLeft size={13} />
          </IconBtn>
        </div>
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {canvasProjects.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 11, color: '#333', lineHeight: 1.8 }}>
            还没有项目
            <br />
            点击 + 新建
          </div>
        ) : (
          canvasProjects.map((project) => {
            const isActive = project.id === currentCanvasProjectId
            const isHovered = hoveredId === project.id

            return (
              <div
                key={project.id}
                onClick={() => setCurrentCanvasProject(project.id)}
                onMouseEnter={() => setHoveredId(project.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: isActive
                    ? 'rgba(255,255,255,0.06)'
                    : isHovered
                    ? 'rgba(255,255,255,0.03)'
                    : 'transparent',
                  borderLeft: `2px solid ${isActive ? 'rgba(255,255,255,0.3)' : 'transparent'}`,
                  transition: 'background 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  {editingId === project.id ? (
                    <input
                      ref={editInputRef}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
                        color: '#e0e0e0', padding: '1px 4px', outline: 'none', marginRight: 4,
                      }}
                    />
                  ) : (
                    <span style={{
                      fontSize: 12, color: isActive ? '#e0e0e0' : '#aaa',
                      fontWeight: isActive ? 500 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1, marginRight: 4,
                    }}>
                      {project.name}
                    </span>
                  )}

                  {isHovered && !editingId && (
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <IconBtn title="重命名" onClick={(e) => startRename(e, project.id, project.name)}>
                        <Pencil size={11} />
                      </IconBtn>
                      <IconBtn title="删除" danger onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(project.id) }}>
                        <Trash2 size={11} />
                      </IconBtn>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 10, color: '#3a3a3a' }}>
                  {timeAgo(project.updatedAt)}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 删除确认弹层 */}
      {confirmDeleteId && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8, padding: '16px 20px', width: 180,
          }}>
            <div style={{ fontSize: 12, color: '#e0e0e0', marginBottom: 4 }}>确认删除项目？</div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 12 }}>画布内容将一并清除</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, padding: '5px 0', fontSize: 11, borderRadius: 5, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{ flex: 1, padding: '5px 0', fontSize: 11, borderRadius: 5, cursor: 'pointer', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IconBtn({
  children, title, onClick, danger,
}: {
  children: React.ReactNode
  title: string
  onClick: (e: React.MouseEvent) => void
  danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
        background: 'transparent', border: 'none',
        color: danger ? '#f87171' : '#555',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}
