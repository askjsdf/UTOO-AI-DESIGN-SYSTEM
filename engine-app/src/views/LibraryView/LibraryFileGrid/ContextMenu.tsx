/**
 * ContextMenu — 资产库文件右键菜单
 */

import { useEffect, useRef } from 'react'
import { Trash2, FolderInput, Download, Pencil, Maximize2, Copy, Tag } from 'lucide-react'
import type { LibraryFile } from '../../../services/LibraryFileService'

interface Props {
  x: number
  y: number
  files: LibraryFile[]
  onClose: () => void
  onDelete: () => void
  onMoveTo: () => void
  onDownload: () => void
  onRename?: () => void
  onOpenLightbox?: () => void
  onCopyImage?: () => void
  onAddTag?: () => void
}

interface ItemProps {
  icon: React.ReactNode
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

function MenuItem({ icon, label, shortcut, danger, disabled, onClick }: ItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '6px 12px', border: 'none',
        background: 'transparent', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#444' : danger ? '#f87171' : '#aaa',
        fontSize: 12, textAlign: 'left',
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          const el = e.currentTarget as HTMLElement
          el.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)'
          el.style.color = danger ? '#fca5a5' : '#e0e0e0'
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'transparent'
        el.style.color = disabled ? '#444' : danger ? '#f87171' : '#aaa'
      }}
    >
      <span style={{ width: 14, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span style={{ fontSize: 10, color: '#555', marginLeft: 12 }}>{shortcut}</span>}
    </button>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />
}

export default function ContextMenu({
  x, y, files, onClose,
  onDelete, onMoveTo, onDownload, onRename, onOpenLightbox, onCopyImage, onAddTag,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const count = files.length
  const isSingle = count === 1
  const isSingleImage = isSingle && files[0].type === 'image'

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const handleClick = () => onClose()
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: x, top: y, zIndex: 9999,
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '4px 0', minWidth: 200,
    boxShadow: '0 8px 32px rgba(0,0,0,0.7)', pointerEvents: 'auto',
  }

  const wrap = (fn: () => void) => () => { fn(); onClose() }

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 选中数量提示（多选时） */}
      {!isSingle && (
        <>
          <div style={{ padding: '4px 12px 6px', fontSize: 10, color: '#555' }}>
            已选 {count} 个文件
          </div>
          <Divider />
        </>
      )}

      {/* 大图查看 */}
      {isSingleImage && onOpenLightbox && (
        <MenuItem icon={<Maximize2 size={13} />} label="大图查看" shortcut="回车" onClick={wrap(onOpenLightbox)} />
      )}

      {/* 复制图片 */}
      {isSingleImage && onCopyImage && (
        <MenuItem icon={<Copy size={13} />} label="复制图片" onClick={wrap(onCopyImage)} />
      )}

      {(isSingleImage && (onOpenLightbox || onCopyImage)) && <Divider />}

      {/* 添加标签 */}
      {onAddTag && (
        <MenuItem
          icon={<Tag size={13} />}
          label={isSingle ? '标签…' : `批量打标签…`}
          onClick={wrap(onAddTag)}
        />
      )}

      <Divider />

      {/* 下载 */}
      <MenuItem
        icon={<Download size={13} />}
        label={isSingle ? '下载到本地' : `下载 ${count} 个文件`}
        onClick={wrap(onDownload)}
      />

      {/* 移动到 */}
      <MenuItem
        icon={<FolderInput size={13} />}
        label={isSingle ? '移动到文件夹…' : `移动 ${count} 个到文件夹…`}
        onClick={wrap(onMoveTo)}
      />

      <Divider />

      {/* 重命名（仅单选） */}
      <MenuItem
        icon={<Pencil size={13} />}
        label="重命名"
        disabled={!isSingle}
        onClick={wrap(onRename ?? (() => {}))}
      />

      <Divider />

      {/* 删除 */}
      <MenuItem
        icon={<Trash2 size={13} />}
        label={isSingle ? '删除' : `删除 ${count} 个文件`}
        shortcut="⌫"
        danger
        onClick={wrap(onDelete)}
      />
    </div>
  )
}
