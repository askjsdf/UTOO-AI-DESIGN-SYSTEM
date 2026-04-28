import { useState, useEffect, useRef } from 'react'
import {
  ChevronRight, ChevronDown, FolderOpen, Folder,
  Plus, Pencil, Trash2, Search, Grid2x2, Clock, Tag,
  Star,
} from 'lucide-react'
import {
  listSubFolders, createSubFolder, deleteFolderRecursive, renameFolderEntry,
  type LibraryFolder,
} from '../../services/LibraryFileService'
import { useLibraryStore, type NavTarget } from '../../store/libraryStore'

// ── 标签颜色（与 TagGroupView 保持一致） ─────────────────────────
const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]
function hashTagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

interface Props {
  rootHandle: FileSystemDirectoryHandle
  rootName: string
}

// ── 工具按钮 ─────────────────────────────────────────────────────

function IconBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string
  onClick: (e: React.MouseEvent) => void; danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 4, cursor: 'pointer',
        background: 'transparent', border: 'none',
        color: danger ? '#f87171' : '#666',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}

// ── 可交互导航项（固定导航） ──────────────────────────────────────

function NavItem({ icon: Icon, label, target }: {
  icon: React.ElementType
  label: string
  target: NavTarget
}) {
  const { navTarget, setNavTarget, loadFiles } = useLibraryStore()
  const [hovered, setHovered] = useState(false)

  const isSame = (() => {
    if (!navTarget) return false
    if (navTarget.type !== target.type) return false
    if (target.type === 'color' && navTarget.type === 'color') return target.hex === navTarget.hex
    if (target.type === 'tag' && navTarget.type === 'tag') return target.tag === navTarget.tag
    return true
  })()

  const handleClick = () => {
    setNavTarget(target)
    loadFiles()
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px', height: 28, margin: '0 4px',
        borderRadius: 5, cursor: 'pointer',
        background: isSame ? 'rgba(255,255,255,0.08)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderLeft: `2px solid ${isSame ? 'rgba(255,255,255,0.25)' : 'transparent'}`,
        userSelect: 'none',
      }}
    >
      <Icon size={13} style={{ color: isSame ? '#c0c0c0' : '#666', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: isSame ? '#e0e0e0' : '#666', flex: 1 }}>
        {label}
      </span>
    </div>
  )
}

// ── 分区标题 ─────────────────────────────────────────────────────

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px 4px',
      fontSize: 10, fontWeight: 600, color: '#555',
      textTransform: 'uppercase', letterSpacing: '0.07em',
    }}>
      <span>{label}</span>
      {action}
    </div>
  )
}

// ── 文件夹节点 ───────────────────────────────────────────────────

interface FolderNodeProps {
  folder: LibraryFolder
  depth: number
  rootHandle: FileSystemDirectoryHandle
  onDeleted: () => void
  onRenamed: (oldName: string, newHandle: FileSystemDirectoryHandle) => void
}

function FolderNode({ folder, depth, rootHandle, onDeleted, onRenamed }: FolderNodeProps) {
  const { navTarget, setNavTarget, loadFiles } = useLibraryStore()
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<LibraryFolder[]>([])
  const [loadedChildren, setLoadedChildren] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [creatingChild, setCreatingChild] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const newFolderRef = useRef<HTMLInputElement>(null)

  const isSelected = navTarget?.type === 'folder' && navTarget.path.join('/') === folder.path.join('/')

  const loadChildren = async () => {
    const subs = await listSubFolders(folder.handle, folder.path)
    setChildren(subs)
    setLoadedChildren(true)
  }

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!expanded && !loadedChildren) await loadChildren()
    setExpanded((v) => !v)
  }

  const handleSelect = async () => {
    if (!loadedChildren) await loadChildren()
    setExpanded(true)
    const target: NavTarget = { type: 'folder', handle: folder.handle, path: folder.path }
    setNavTarget(target)
    loadFiles()
  }

  const handleNewFolder = async () => {
    const name = newFolderName.trim()
    if (!name) { setCreatingChild(false); return }
    const newDir = await createSubFolder(folder.handle, name)
    setCreatingChild(false)
    setNewFolderName('')
    setExpanded(true)
    const newFolder: LibraryFolder = { name, handle: newDir, path: [...folder.path, name], hasChildren: false }
    setChildren((prev) => [...prev, newFolder].sort((a, b) => a.name.localeCompare(b.name, 'zh')))
    setLoadedChildren(true)
    // 自动导航到新文件夹
    const target: NavTarget = { type: 'folder', handle: newDir, path: [...folder.path, name] }
    setNavTarget(target)
    loadFiles()
  }

  const handleRename = async () => {
    const name = renameValue.trim()
    if (!name || name === folder.name) { setRenaming(false); return }
    const parentHandle = await getParentHandle(rootHandle, folder.path)
    if (!parentHandle) { setRenaming(false); return }
    const newHandle = await renameFolderEntry(parentHandle, folder.name, name)
    setRenaming(false)
    onRenamed(folder.name, newHandle)
    // 如果当前正在浏览此文件夹，更新导航
    if (isSelected) {
      const newPath = [...folder.path.slice(0, -1), name]
      const target: NavTarget = { type: 'folder', handle: newHandle, path: newPath }
      setNavTarget(target)
      loadFiles()
    }
  }

  const handleDelete = async () => {
    const parentHandle = await getParentHandle(rootHandle, folder.path)
    if (!parentHandle) return
    await deleteFolderRecursive(parentHandle, folder.name)
    onDeleted()
    if (isSelected) { setNavTarget(null) }
  }

  useEffect(() => { if (renaming) setTimeout(() => renameRef.current?.select(), 0) }, [renaming])
  useEffect(() => { if (creatingChild) setTimeout(() => newFolderRef.current?.focus(), 0) }, [creatingChild])

  const cancelBtnStyle: React.CSSProperties = {
    fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#666',
  }
  const deleteBtnStyle: React.CSSProperties = {
    fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
    background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
  }

  return (
    <div>
      <div
        onClick={handleSelect}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center',
          paddingLeft: 8 + depth * 14, paddingRight: 6, height: 28,
          cursor: 'pointer',
          background: isSelected ? 'rgba(255,255,255,0.08)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
          borderLeft: `2px solid ${isSelected ? 'rgba(255,255,255,0.25)' : 'transparent'}`,
          userSelect: 'none',
        }}
      >
        <span onClick={handleToggle} style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginRight: 2, color: '#444' }}>
          {folder.hasChildren || children.length > 0
            ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            : <span style={{ width: 12 }} />}
        </span>

        {expanded
          ? <FolderOpen size={13} style={{ color: '#888', flexShrink: 0, marginRight: 6 }} />
          : <Folder size={13} style={{ color: '#666', flexShrink: 0, marginRight: 6 }} />}

        {renaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
              color: '#e0e0e0', padding: '1px 4px', outline: 'none',
            }}
          />
        ) : (
          <span style={{
            flex: 1, fontSize: 12, color: isSelected ? '#e0e0e0' : '#777',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {folder.name}
          </span>
        )}

        {hovered && !renaming && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <IconBtn title="新建子文件夹" onClick={() => { setCreatingChild(true); setExpanded(true) }}>
              <Plus size={10} />
            </IconBtn>
            <IconBtn title="重命名" onClick={() => { setRenaming(true); setRenameValue(folder.name) }}>
              <Pencil size={10} />
            </IconBtn>
            <IconBtn title="删除" danger onClick={() => setConfirmDelete(true)}>
              <Trash2 size={10} />
            </IconBtn>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div style={{ margin: '4px 8px', padding: '8px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: '#f87171', marginBottom: 6 }}>删除「{folder.name}」及其所有内容？</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setConfirmDelete(false)} style={cancelBtnStyle}>取消</button>
            <button onClick={handleDelete} style={deleteBtnStyle}>确认删除</button>
          </div>
        </div>
      )}

      {expanded && loadedChildren && (
        <div>
          {creatingChild && (
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 8 + (depth + 1) * 14, paddingRight: 6, height: 28 }}>
              <span style={{ width: 12, marginRight: 2 }} />
              <Folder size={13} style={{ color: '#666', flexShrink: 0, marginRight: 6 }} />
              <input
                ref={newFolderRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={handleNewFolder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewFolder()
                  if (e.key === 'Escape') { setCreatingChild(false); setNewFolderName('') }
                }}
                placeholder="文件夹名称"
                style={{ flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#e0e0e0', padding: '1px 4px', outline: 'none' }}
              />
            </div>
          )}
          {children.map((child) => (
            <FolderNode
              key={child.path.join('/')}
              folder={child}
              depth={depth + 1}
              rootHandle={rootHandle}
              onDeleted={() => setChildren((prev) => prev.filter((c) => c.name !== child.name))}
              onRenamed={(oldName, newHandle) => {
                setChildren((prev) => prev.map((c) => c.name === oldName
                  ? { ...c, name: newHandle.name, handle: newHandle, path: [...folder.path, newHandle.name] }
                  : c
                ))
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── 获取父文件夹句柄 ─────────────────────────────────────────────

async function getParentHandle(root: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemDirectoryHandle | null> {
  if (path.length === 1) return root
  let current = root
  for (let i = 0; i < path.length - 1; i++) {
    try { current = await current.getDirectoryHandle(path[i]) }
    catch { return null }
  }
  return current
}

// ── 标签导航列表 ─────────────────────────────────────────────────

function TagNavList() {
  const { allTags, navTarget, setNavTarget, loadFiles } = useLibraryStore()

  if (allTags.size === 0) {
    return (
      <div style={{ padding: '8px 16px', fontSize: 10, color: '#444', textAlign: 'center' }}>
        暂无标签
      </div>
    )
  }

  const sorted = [...allTags.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div style={{ padding: '2px 6px 8px' }}>
      {sorted.map(([tag, count]) => {
        const isActive = navTarget?.type === 'tag' && navTarget.tag === tag
        return (
          <button
            key={tag}
            onClick={() => { setNavTarget({ type: 'tag', tag }); loadFiles() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              width: '100%', padding: '4px 8px', borderRadius: 5, border: 'none',
              background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
              cursor: 'pointer', textAlign: 'left',
              borderLeft: `2px solid ${isActive ? 'rgba(59,130,246,0.6)' : 'transparent'}`,
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: hashTagColor(tag), flexShrink: 0 }} />
            <span style={{
              flex: 1, fontSize: 11,
              color: isActive ? '#93c5fd' : '#777',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {tag}
            </span>
            <span style={{ fontSize: 9, color: '#3a3a3a', flexShrink: 0 }}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── 根面板 ───────────────────────────────────────────────────────

export default function LibraryTreePanel({ rootHandle, rootName }: Props) {
  const [rootFolders, setRootFolders] = useState<LibraryFolder[]>([])
  const [creatingRoot, setCreatingRoot] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderRef = useRef<HTMLInputElement>(null)
  const { setNavTarget, loadFiles } = useLibraryStore()

  useEffect(() => { loadRoot() }, [rootHandle])

  const loadRoot = async () => {
    const subs = await listSubFolders(rootHandle, [])
    setRootFolders(subs)
  }

  const handleCreateRoot = async () => {
    const name = newFolderName.trim()
    if (!name) { setCreatingRoot(false); return }
    const newDir = await createSubFolder(rootHandle, name)
    setCreatingRoot(false)
    setNewFolderName('')
    const newFolder: LibraryFolder = { name, handle: newDir, path: [name], hasChildren: false }
    setRootFolders((prev) => [...prev, newFolder].sort((a, b) => a.name.localeCompare(b.name, 'zh')))
    const target: NavTarget = { type: 'folder', handle: newDir, path: [name] }
    setNavTarget(target)
    loadFiles()
  }

  useEffect(() => { if (creatingRoot) setTimeout(() => newFolderRef.current?.focus(), 0) }, [creatingRoot])

  return (
    <div style={{
      width: 200, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: '#0f0f0f',
      borderRight: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* 库名称 */}
      <div style={{ padding: '14px 12px 10px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rootName}
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>视觉资产库</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
        {/* 搜索栏 stub */}
        <div style={{ padding: '8px 10px' }}>
          <div
            title="搜索功能暂未实现"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.04)', borderRadius: 6,
              padding: '5px 8px', cursor: 'not-allowed', opacity: 0.3,
            }}
          >
            <Search size={11} style={{ color: '#444' }} />
            <span style={{ fontSize: 11, color: '#555' }}>搜索…</span>
          </div>
        </div>

        {/* 快速导航（激活） */}
        <div style={{ padding: '2px 0' }}>
          <NavItem icon={Grid2x2} label="全部"   target={{ type: 'all' }} />
          <NavItem icon={Clock}   label="最近添加" target={{ type: 'recent' }} />
          <NavItem icon={Tag}     label="未分类"   target={{ type: 'untagged' }} />
        </div>

        <div style={{ margin: '4px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }} />

        {/* 智能分组 */}
        <SectionLabel label="智能分组" />
        <div style={{ padding: '2px 0' }}>
          <NavItem icon={Star} label="已加星标" target={{ type: 'starred' }} />
        </div>

        <div style={{ margin: '4px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }} />

        {/* 文件夹树 */}
        <SectionLabel
          label="文件夹"
          action={
            <IconBtn title="新建文件夹" onClick={() => setCreatingRoot(true)}>
              <Plus size={11} />
            </IconBtn>
          }
        />

        {rootFolders.length === 0 && !creatingRoot && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: 11, color: '#555', lineHeight: 1.8 }}>
            还没有文件夹<br />点击 + 新建
          </div>
        )}

        {creatingRoot && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 6 }}>
            <Folder size={13} style={{ color: '#666', flexShrink: 0 }} />
            <input
              ref={newFolderRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={handleCreateRoot}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateRoot()
                if (e.key === 'Escape') { setCreatingRoot(false); setNewFolderName('') }
              }}
              placeholder="文件夹名称"
              style={{ flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#e0e0e0', padding: '2px 6px', outline: 'none' }}
            />
          </div>
        )}

        {rootFolders.map((folder) => (
          <FolderNode
            key={folder.path.join('/')}
            folder={folder}
            depth={0}
            rootHandle={rootHandle}
            onDeleted={() => setRootFolders((prev) => prev.filter((f) => f.name !== folder.name))}
            onRenamed={(oldName, newHandle) => {
              setRootFolders((prev) => prev.map((f) => f.name === oldName
                ? { ...f, name: newHandle.name, handle: newHandle, path: [newHandle.name] }
                : f
              ))
            }}
          />
        ))}

        <div style={{ margin: '4px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }} />

        {/* 标签导航 */}
        <SectionLabel label="标签" />
        <TagNavList />
      </div>
    </div>
  )
}
