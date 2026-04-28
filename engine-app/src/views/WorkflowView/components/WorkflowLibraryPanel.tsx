import { useEffect, useRef, useState } from 'react'
import { Copy, Trash2, ChevronLeft, ChevronRight, ChevronDown, Pencil, FolderPlus, FolderOpen, FolderClosed, CornerDownRight, AlertCircle, RefreshCw, Link, GripVertical } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import type { WorkflowDefinition, WorkflowFolder } from '../../../types'

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

/** 按 order 排列某分组的工作流（无 order 的项排在有序项后，按 updatedAt 降序） */
function sortByOrder(list: WorkflowDefinition[]): WorkflowDefinition[] {
  return [...list].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order
    if (a.order !== undefined) return -1
    if (b.order !== undefined) return 1
    return b.updatedAt - a.updatedAt
  })
}

export default function WorkflowLibraryPanel() {
  const [collapsed, setCollapsed] = useState(false)

  // 列表交互
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null)

  // 重命名
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderValue, setRenameFolderValue] = useState('')

  // 移动到文件夹弹出
  const [movingId, setMovingId] = useState<string | null>(null)
  const moveMenuRef = useRef<HTMLDivElement>(null)

  // 新建文件夹
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // ── 拖拽状态 ──────────────────────────────────────────────────
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // 插入线显示在此 id 的工作流上方；'__end__{folderId|unfiled}' 表示插入到某分组末尾
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  // 高亮文件夹头（folder.id | '__unfiled__'）
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  const {
    workflows, currentWorkflowId, openWorkflow, duplicateWorkflow, deleteWorkflow,
    renameWorkflow, reorderWorkflow, isDirty,
    folders, createFolder, renameFolder, deleteFolder, toggleFolderCollapsed, moveWorkflowToFolder,
    workflowDirConnected, workflowDirHandle, workflowDirName, reconnectWorkflowDir, connectWorkflowDir,
  } = useAppStore()

  // 点击外部关闭移动菜单
  useEffect(() => {
    if (!movingId) return
    const handler = (e: MouseEvent) => {
      if (!moveMenuRef.current?.contains(e.target as Node)) setMovingId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [movingId])

  // ── 拖拽工具函数 ──────────────────────────────────────────────

  const clearDrag = () => {
    setDraggingId(null)
    setDragOverItemId(null)
    setDragOverFolderId(null)
  }

  /** 拖拽到分组末尾的 drop zone */
  const endZoneId = (folderId: string | undefined) =>
    `__end__${folderId ?? '__unfiled__'}`

  const handleDrop = (
    dropBeforeId: string | null,
    targetFolderId: string | undefined
  ) => {
    if (!draggingId) return
    reorderWorkflow(draggingId, dropBeforeId, targetFolderId)
    clearDrag()
  }

  // ── 工作流操作 ────────────────────────────────────────────────

  const handleDuplicate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await duplicateWorkflow(id)
  }

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setConfirmDeleteId(id)
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return
    await deleteWorkflow(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  const handleRenameStart = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation()
    setRenamingId(id)
    setRenameValue(currentName)
  }

  const handleRenameCommit = async (id: string) => {
    if (renameValue.trim()) await renameWorkflow(id, renameValue)
    setRenamingId(null)
  }

  const handleMoveClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setMovingId((prev) => (prev === id ? null : id))
  }

  const handleMoveTo = async (workflowId: string, folderId?: string) => {
    await moveWorkflowToFolder(workflowId, folderId)
    setMovingId(null)
  }

  // ── 文件夹操作 ────────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (name) await createFolder(name)
    setCreatingFolder(false)
    setNewFolderName('')
  }

  const handleFolderRenameStart = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation()
    setRenamingFolderId(id)
    setRenameFolderValue(currentName)
  }

  const handleFolderRenameCommit = async (id: string) => {
    if (renameFolderValue.trim()) await renameFolder(id, renameFolderValue)
    setRenamingFolderId(null)
  }

  const handleFolderDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setConfirmDeleteFolderId(id)
  }

  const handleFolderDeleteConfirm = async () => {
    if (!confirmDeleteFolderId) return
    await deleteFolder(confirmDeleteFolderId)
    setConfirmDeleteFolderId(null)
  }

  // ── 分组 ──────────────────────────────────────────────────────

  const unfiledWorkflows = sortByOrder(workflows.filter((w) => !w.folderId))

  // ── 折叠态 ────────────────────────────────────────────────────

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
        title="展开工作流库"
      >
        <ChevronRight size={14} color="#444" />
      </div>
    )
  }

  // ── 工作流列表项 ──────────────────────────────────────────────

  const renderWorkflowItem = (wf: WorkflowDefinition, folderId: string | undefined) => {
    const isActive = wf.id === currentWorkflowId
    const isHovered = hoveredId === wf.id
    const isRenaming = renamingId === wf.id
    const isMoving = movingId === wf.id
    const isDragging = draggingId === wf.id
    const showInsertLine = dragOverItemId === wf.id && draggingId && draggingId !== wf.id
    const indented = folderId !== undefined

    return (
      <div
        key={wf.id}
        draggable={!isRenaming}
        onDragStart={(e) => {
          setDraggingId(wf.id)
          e.dataTransfer.effectAllowed = 'move'
          // Firefox 需要 setData
          e.dataTransfer.setData('text/plain', wf.id)
          e.stopPropagation()
        }}
        onDragEnd={clearDrag}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (draggingId && draggingId !== wf.id) {
            setDragOverItemId(wf.id)
            setDragOverFolderId(null)
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (draggingId && draggingId !== wf.id) {
            handleDrop(wf.id, folderId)
          }
        }}
        onClick={() => !isRenaming && !isDragging && openWorkflow(wf.id)}
        onMouseEnter={() => setHoveredId(wf.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          padding: `6px 10px 6px ${indented ? 24 : 12}px`,
          cursor: isDragging ? 'grabbing' : isRenaming ? 'default' : 'pointer',
          background: isActive ? 'rgba(255,255,255,0.06)' : isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          borderLeft: `2px solid ${isActive ? 'rgba(255,255,255,0.3)' : 'transparent'}`,
          opacity: isDragging ? 0.4 : 1,
          position: 'relative',
          transition: 'background 0.1s, opacity 0.1s',
          userSelect: 'none',
        }}
      >
        {/* 插入线（拖拽时显示在目标项上方） */}
        {showInsertLine && (
          <div style={{
            position: 'absolute', top: 0, left: indented ? 20 : 8, right: 8, height: 2,
            background: '#3b82f6', borderRadius: 1, pointerEvents: 'none', zIndex: 10,
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* 拖拽手柄 */}
          {isHovered && !isRenaming && (
            <div style={{ color: '#333', flexShrink: 0, cursor: 'grab', marginLeft: indented ? -12 : -4 }}>
              <GripVertical size={12} />
            </div>
          )}

          {/* 名称 / 重命名输入 */}
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') handleRenameCommit(wf.id)
                if (e.key === 'Escape') setRenamingId(null)
              }}
              onBlur={() => handleRenameCommit(wf.id)}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1, fontSize: 12,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
                padding: '2px 6px', color: '#e0e0e0', outline: 'none',
              }}
            />
          ) : (
            <span style={{
              flex: 1, fontSize: 12,
              color: isActive ? '#e0e0e0' : '#aaa',
              fontWeight: isActive ? 500 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {wf.name}
            </span>
          )}

          {/* 未保存红点 */}
          {isActive && isDirty && !isRenaming && (
            <span
              title="有未保存的修改"
              style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }}
            />
          )}

          {/* 操作按钮（hover 时） */}
          {isHovered && !isRenaming && (
            <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <ActionBtn title="重命名" onClick={(e) => handleRenameStart(e, wf.id, wf.name)}>
                <Pencil size={10} />
              </ActionBtn>
              <ActionBtn title="复制" onClick={(e) => handleDuplicate(e, wf.id)}>
                <Copy size={10} />
              </ActionBtn>
              {folders.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <ActionBtn title="移动到文件夹" onClick={(e) => handleMoveClick(e, wf.id)}>
                    <CornerDownRight size={10} />
                  </ActionBtn>
                  {isMoving && (
                    <div
                      ref={moveMenuRef}
                      style={{
                        position: 'absolute', top: '100%', right: 0, zIndex: 200,
                        background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6, padding: '4px 0', minWidth: 140,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => handleMoveTo(wf.id, f.id)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '5px 10px',
                            fontSize: 11, color: wf.folderId === f.id ? '#555' : '#ccc',
                            background: 'none', border: 'none',
                            cursor: wf.folderId === f.id ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                          onMouseEnter={(e) => { if (wf.folderId !== f.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                        >
                          <FolderOpen size={10} />{f.name}
                        </button>
                      ))}
                      {wf.folderId && (
                        <>
                          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
                          <button
                            onClick={() => handleMoveTo(wf.id, undefined)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '5px 10px',
                              fontSize: 11, color: '#666', background: 'none', border: 'none', cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                          >
                            移出文件夹
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              <ActionBtn title="删除" danger onClick={(e) => handleDeleteClick(e, wf.id)}>
                <Trash2 size={10} />
              </ActionBtn>
            </div>
          )}
        </div>

        {!isRenaming && (
          <div style={{ fontSize: 10, color: '#333', marginTop: 2 }}>
            {timeAgo(wf.updatedAt)}
          </div>
        )}
      </div>
    )
  }

  /** 每个分组末尾的不可见 drop zone，拖到空白区域可追加到尾部 */
  const renderEndZone = (folderId: string | undefined) => {
    const zoneId = endZoneId(folderId)
    const showLine = dragOverItemId === zoneId && draggingId
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (draggingId) { setDragOverItemId(zoneId); setDragOverFolderId(null) }
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (draggingId) handleDrop(null, folderId)
        }}
        style={{ height: 16, position: 'relative' }}
      >
        {showLine && (
          <div style={{
            position: 'absolute', top: 2, left: folderId ? 20 : 8, right: 8, height: 2,
            background: '#3b82f6', borderRadius: 1, pointerEvents: 'none',
          }} />
        )}
      </div>
    )
  }

  // ── 主体 ──────────────────────────────────────────────────────

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
          工作流库
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#444', display: 'flex' }}
            title="新建文件夹"
          >
            <FolderPlus size={13} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#444', display: 'flex' }}
            title="收起"
          >
            <ChevronLeft size={13} />
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

        {/* 新建文件夹输入行 */}
        {creatingFolder && (
          <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') setCreatingFolder(false)
              }}
              onBlur={handleCreateFolder}
              placeholder="文件夹名称"
              style={{
                width: '100%', fontSize: 12,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
                padding: '4px 8px', color: '#e0e0e0', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* 空状态 */}
        {workflows.length === 0 && folders.length === 0 && !creatingFolder && (
          <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 11, color: '#333', lineHeight: 1.8 }}>
            还没有工作流
            <br />
            点击工具栏「新建」开始
          </div>
        )}

        {/* 文件夹区块 */}
        {folders.map((folder: WorkflowFolder) => {
          const folderWorkflows = sortByOrder(workflows.filter((w) => w.folderId === folder.id))
          const isRenamingFolder = renamingFolderId === folder.id
          const isFolderHovered = hoveredFolderId === folder.id
          const isDragTarget = dragOverFolderId === folder.id

          return (
            <div key={folder.id}>
              {/* 文件夹头 — 拖入目标 */}
              <div
                onClick={() => !isRenamingFolder && toggleFolderCollapsed(folder.id)}
                onMouseEnter={() => setHoveredFolderId(folder.id)}
                onMouseLeave={() => setHoveredFolderId(null)}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (draggingId) { setDragOverFolderId(folder.id); setDragOverItemId(null) }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (draggingId) handleDrop(null, folder.id)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px',
                  cursor: isRenamingFolder ? 'default' : 'pointer',
                  background: isDragTarget
                    ? 'rgba(59,130,246,0.12)'
                    : isFolderHovered ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderTop: isDragTarget ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  borderBottom: isDragTarget ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                {folder.collapsed
                  ? <FolderClosed size={12} color={isDragTarget ? '#60a5fa' : '#555'} />
                  : <FolderOpen size={12} color={isDragTarget ? '#60a5fa' : '#555'} />
                }
                <ChevronDown
                  size={10} color="#444"
                  style={{ transform: folder.collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                />

                {isRenamingFolder ? (
                  <input
                    autoFocus
                    value={renameFolderValue}
                    onChange={(e) => setRenameFolderValue(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') handleFolderRenameCommit(folder.id)
                      if (e.key === 'Escape') setRenamingFolderId(null)
                    }}
                    onBlur={() => handleFolderRenameCommit(folder.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1, fontSize: 11, background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
                      padding: '2px 6px', color: '#e0e0e0', outline: 'none',
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 11, color: isDragTarget ? '#93c5fd' : '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {folder.name}
                    {folderWorkflows.length > 0 && (
                      <span style={{ marginLeft: 4, color: '#3a3a3a', fontSize: 10 }}>({folderWorkflows.length})</span>
                    )}
                  </span>
                )}

                {isFolderHovered && !isRenamingFolder && !isDragTarget && (
                  <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <ActionBtn title="重命名" onClick={(e) => handleFolderRenameStart(e, folder.id, folder.name)}>
                      <Pencil size={10} />
                    </ActionBtn>
                    <ActionBtn title="删除文件夹" danger onClick={(e) => handleFolderDeleteClick(e, folder.id)}>
                      <Trash2 size={10} />
                    </ActionBtn>
                  </div>
                )}
              </div>

              {/* 文件夹内工作流 */}
              {!folder.collapsed && (
                <div>
                  {folderWorkflows.length === 0 ? (
                    // 空文件夹也是 drop zone
                    <div
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (draggingId) { setDragOverFolderId(folder.id); setDragOverItemId(null) }
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (draggingId) handleDrop(null, folder.id)
                      }}
                      style={{
                        padding: '6px 24px', fontSize: 10, color: '#2a2a2a',
                        background: dragOverFolderId === folder.id ? 'rgba(59,130,246,0.06)' : 'transparent',
                      }}
                    >
                      {dragOverFolderId === folder.id ? '松开放入' : '空文件夹'}
                    </div>
                  ) : (
                    <>
                      {folderWorkflows.map((wf) => renderWorkflowItem(wf, folder.id))}
                      {renderEndZone(folder.id)}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* 未分组工作流 */}
        {(unfiledWorkflows.length > 0 || (draggingId && dragOverFolderId === '__unfiled__')) && (
          <div>
            {folders.length > 0 && (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (draggingId) { setDragOverFolderId('__unfiled__'); setDragOverItemId(null) }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (draggingId) handleDrop(null, undefined)
                }}
                style={{
                  padding: '6px 12px 4px',
                  fontSize: 9, color: dragOverFolderId === '__unfiled__' ? '#93c5fd' : '#2e2e2e',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  marginTop: 4,
                  background: dragOverFolderId === '__unfiled__' ? 'rgba(59,130,246,0.06)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                {dragOverFolderId === '__unfiled__' ? '松开移至未分组' : '未分组'}
              </div>
            )}
            {unfiledWorkflows.map((wf) => renderWorkflowItem(wf, undefined))}
            {renderEndZone(undefined)}
          </div>
        )}
      </div>

      {/* 文件系统连接状态 */}
      {!workflowDirConnected && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <AlertCircle size={11} color="#a16207" />
            <span style={{ fontSize: 10, color: '#a16207', flex: 1 }}>
              {workflowDirHandle ? `${workflowDirName} 需重新授权` : '未连接本地文件夹'}
            </span>
          </div>
          <button
            onClick={workflowDirHandle ? reconnectWorkflowDir : connectWorkflowDir}
            style={{
              width: '100%', padding: '4px 0', fontSize: 11, borderRadius: 5, cursor: 'pointer',
              background: 'rgba(161,98,7,0.15)', border: '1px solid rgba(161,98,7,0.3)',
              color: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            {workflowDirHandle
              ? <><RefreshCw size={10} /> 重新授权</>
              : <><Link size={10} /> 连接文件夹</>
            }
          </button>
        </div>
      )}

      {workflowDirConnected && workflowDirName && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          padding: '5px 12px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: '#2a2a2a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workflowDirName}
          </span>
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmOverlay
          message="确认删除此工作流？"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {confirmDeleteFolderId && (
        <ConfirmOverlay
          message="删除文件夹后，其中的工作流将移至「未分组」"
          onCancel={() => setConfirmDeleteFolderId(null)}
          onConfirm={handleFolderDeleteConfirm}
        />
      )}
    </div>
  )
}

// ── 子组件 ────────────────────────────────────────────────────────

function ActionBtn({
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

function ConfirmOverlay({ message, onCancel, onConfirm }: { message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8, padding: '16px 20px', width: 180,
      }}>
        <div style={{ fontSize: 11, color: '#ccc', marginBottom: 12, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '5px 0', fontSize: 11, borderRadius: 5, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '5px 0', fontSize: 11, borderRadius: 5, cursor: 'pointer', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
