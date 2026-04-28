/**
 * MoveToDialog — 移动文件到文件夹对话框
 * 显示完整文件夹树，用户选择目标文件夹后确认
 */

import { useState, useEffect } from 'react'
import { Folder, FolderOpen, ChevronRight, ChevronDown, X } from 'lucide-react'
import { listSubFolders, type LibraryFolder } from '../../../services/LibraryFileService'

interface Props {
  rootHandle: FileSystemDirectoryHandle
  fileCount: number
  onConfirm: (target: { handle: FileSystemDirectoryHandle; path: string[] }) => void
  onClose: () => void
}

// ── 文件夹节点 ────────────────────────────────────────────────────

interface FolderNodeProps {
  folder: LibraryFolder
  depth: number
  selectedPath: string | null
  onSelect: (folder: LibraryFolder) => void
}

function FolderNode({ folder, depth, selectedPath, onSelect }: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<LibraryFolder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const isSelected = selectedPath === folder.path.join('/')

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!expanded && !loaded) {
      const subs = await listSubFolders(folder.handle, folder.path)
      setChildren(subs)
      setLoaded(true)
    }
    setExpanded((v) => !v)
  }

  return (
    <div>
      <div
        onClick={() => onSelect(folder)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center',
          paddingLeft: 12 + depth * 16, paddingRight: 8, height: 30,
          cursor: 'pointer', borderRadius: 5, margin: '1px 4px',
          background: isSelected
            ? 'rgba(59,130,246,0.18)'
            : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
          border: isSelected ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
          userSelect: 'none',
        }}
      >
        <span onClick={toggle} style={{ display: 'flex', flexShrink: 0, color: '#444', marginRight: 4 }}>
          {folder.hasChildren || children.length > 0
            ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            : <span style={{ width: 12 }} />}
        </span>
        {expanded
          ? <FolderOpen size={13} style={{ color: '#888', marginRight: 6, flexShrink: 0 }} />
          : <Folder size={13} style={{ color: '#666', marginRight: 6, flexShrink: 0 }} />}
        <span style={{ fontSize: 12, color: isSelected ? '#93c5fd' : '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </span>
      </div>

      {expanded && loaded && children.map((child) => (
        <FolderNode
          key={child.path.join('/')}
          folder={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

// ── 主对话框 ──────────────────────────────────────────────────────

export default function MoveToDialog({ rootHandle, fileCount, onConfirm, onClose }: Props) {
  const [rootFolders, setRootFolders] = useState<LibraryFolder[]>([])
  const [selected, setSelected] = useState<LibraryFolder | null>(null)

  useEffect(() => {
    listSubFolders(rootHandle, []).then(setRootFolders)
  }, [rootHandle])

  return (
    <>
      {/* 背景遮罩 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* 对话框 */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9999, width: 340,
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#d0d0d0' }}>移动到文件夹</div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
              移动 {fileCount} 个文件
            </div>
          </div>
          <button onClick={onClose} style={{
            display: 'flex', background: 'none', border: 'none', cursor: 'pointer',
            color: '#444', padding: 4,
          }}>
            <X size={14} />
          </button>
        </div>

        {/* 文件夹树 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', maxHeight: 340 }}>
          {rootFolders.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#333' }}>
              还没有子文件夹
            </div>
          )}
          {rootFolders.map((folder) => (
            <FolderNode
              key={folder.path.join('/')}
              folder={folder}
              depth={0}
              selectedPath={selected?.path.join('/') ?? null}
              onSelect={setSelected}
            />
          ))}
        </div>

        {/* 操作按钮 */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: '#666', fontSize: 12, cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={() => selected && onConfirm({ handle: selected.handle, path: selected.path })}
            disabled={!selected}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: selected ? '#3b82f6' : 'rgba(59,130,246,0.2)',
              color: selected ? '#fff' : '#4a5a7a', fontSize: 12,
              cursor: selected ? 'pointer' : 'not-allowed',
              fontWeight: 500,
            }}
          >
            移动到「{selected?.name ?? '请选择'}」
          </button>
        </div>
      </div>
    </>
  )
}
