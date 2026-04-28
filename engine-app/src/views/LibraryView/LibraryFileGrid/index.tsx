/**
 * LibraryFileGrid — 文件网格主组件
 * 整合：工具栏 / 过滤栏 / JustifiedGrid / TagGroupView / ContextMenu / TagPickerPopup / Lightbox / MoveToDialog
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { ImageIcon, Upload } from 'lucide-react'
import { useLibraryStore, getFileKey } from '../../../store/libraryStore'
import { useAppStore } from '../../../store/appStore'
import type { LibraryFile } from '../../../services/LibraryFileService'
import GridToolbar from './GridToolbar'
import FilterBar from './FilterBar'
import JustifiedGrid from './JustifiedGrid'
import TagGroupView from './TagGroupView'
import ContextMenu from './ContextMenu'
import TagPickerPopup from './TagPickerPopup'
import Lightbox from './Lightbox'
import MoveToDialog from './MoveToDialog'

export default function LibraryFileGrid() {
  const {
    navTarget, rawFiles, isLoading,
    selectedFile, selectedIds,
    toggleSelection, selectRange, clearSelection, getSelectedFiles,
    view, uploadFiles, getDisplayFiles,
    deleteFiles, moveFiles, renameFile,
  } = useLibraryStore()
  const libraryRoot = useAppStore((s) => s.libraryRoot)

  const [showFilter, setShowFilter] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  // ── ContextMenu 状态 ─────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; files: LibraryFile[] } | null>(null)

  // ── TagPickerPopup 状态 ──────────────────────────────────────────
  const [tagPicker, setTagPicker] = useState<{ x: number; y: number; files: LibraryFile[] } | null>(null)

  // ── Lightbox 状态 ────────────────────────────────────────────────
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // ── MoveToDialog 状态 ────────────────────────────────────────────
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [moveTargetFiles, setMoveTargetFiles] = useState<LibraryFile[]>([])

  // ── 重命名状态 ───────────────────────────────────────────────────
  const [renamingFile, setRenamingFile] = useState<LibraryFile | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const displayFiles = getDisplayFiles()
  const imageFiles = displayFiles.filter((f) => f.type === 'image')

  const getTitle = () => {
    if (!navTarget) return '全部'
    if (navTarget.type === 'folder') return navTarget.path[navTarget.path.length - 1]
    if (navTarget.type === 'all') return '全部'
    if (navTarget.type === 'recent') return '最近添加'
    if (navTarget.type === 'untagged') return '未分类'
    if (navTarget.type === 'starred') return '已加星标'
    if (navTarget.type === 'color') return '颜色相近'
    if (navTarget.type === 'tag') return `# ${navTarget.tag}`
    return ''
  }

  // ── 点击处理（单选 / Cmd多选 / Shift范围选） ─────────────────────

  const handleCardClick = useCallback((file: LibraryFile, e: React.MouseEvent) => {
    const additive = e.metaKey || e.ctrlKey
    const range = e.shiftKey
    if (range) selectRange(file, displayFiles)
    else toggleSelection(file, additive)
  }, [displayFiles, selectRange, toggleSelection])

  // ── 右键菜单 ─────────────────────────────────────────────────────

  const handleCardContextMenu = useCallback((file: LibraryFile, e: React.MouseEvent) => {
    e.preventDefault()
    const key = getFileKey(file)
    const files = selectedIds.has(key) ? getSelectedFiles() : [file]
    if (!selectedIds.has(key)) toggleSelection(file, false)
    setCtxMenu({ x: e.clientX, y: e.clientY, files })
  }, [selectedIds, getSelectedFiles, toggleSelection])

  // ── 双击打开 Lightbox ────────────────────────────────────────────

  const handleCardDoubleClick = useCallback((file: LibraryFile) => {
    if (file.type !== 'image') return
    const idx = imageFiles.findIndex((f) => getFileKey(f) === getFileKey(file))
    if (idx !== -1) setLightboxIndex(idx)
  }, [imageFiles])

  // ── 键盘：Delete 删除，Escape 清除选中，Enter 打开大图 ───────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = getSelectedFiles()
        if (selected.length === 0) return
        e.preventDefault()
        const msg = selected.length === 1
          ? `确认删除「${selected[0].name}」？`
          : `确认删除 ${selected.length} 个文件？`
        if (window.confirm(msg)) deleteFiles(selected)
      }
      if (e.key === 'Escape') clearSelection()
      if (e.key === 'Enter' && selectedFile) handleCardDoubleClick(selectedFile)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [getSelectedFiles, deleteFiles, clearSelection, selectedFile, handleCardDoubleClick])

  // ── 点击空白处清除选中 ────────────────────────────────────────────

  const handleGridAreaClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.gridarea === 'true') clearSelection()
  }

  // ── 上传 ─────────────────────────────────────────────────────────

  const handleUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const folder = navTarget?.type === 'folder'
      ? { handle: navTarget.handle, path: navTarget.path } : null
    if (!folder) { alert('请先在左侧选择一个文件夹，再上传文件'); e.target.value = ''; return }
    await uploadFiles(folder, Array.from(e.target.files))
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const folder = navTarget?.type === 'folder'
      ? { handle: navTarget.handle, path: navTarget.path } : null
    if (!folder) { alert('请先在左侧选择一个文件夹，再拖入文件'); return }
    await uploadFiles(folder, Array.from(e.dataTransfer.files))
  }

  // ── ContextMenu 操作 ──────────────────────────────────────────────

  const handleCtxDelete = () => {
    const files = ctxMenu?.files ?? []
    if (!files.length) return
    const msg = files.length === 1
      ? `确认删除「${files[0].name}」？`
      : `确认删除 ${files.length} 个文件？`
    if (window.confirm(msg)) deleteFiles(files)
  }

  const handleCtxMoveTo = () => {
    const files = ctxMenu?.files ?? []
    if (!files.length) return
    setMoveTargetFiles(files); setShowMoveDialog(true)
  }

  const handleCtxDownload = async () => {
    for (const file of (ctxMenu?.files ?? [])) {
      try {
        const f = await file.handle.getFile()
        const url = URL.createObjectURL(f)
        const a = document.createElement('a')
        a.href = url; a.download = file.name; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch { /* ignore */ }
    }
  }

  const handleCtxRename = () => {
    const file = ctxMenu?.files[0]
    if (!file) return
    setRenamingFile(file); setRenameValue(file.name)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  const handleCtxOpenLightbox = () => {
    const file = ctxMenu?.files[0]
    if (!file || file.type !== 'image') return
    handleCardDoubleClick(file)
  }

  const handleCtxCopyImage = async () => {
    const file = ctxMenu?.files[0]
    if (!file || file.type !== 'image') return
    try {
      const f = await file.handle.getFile()
      const blob = await (async () => {
        const bmp = await createImageBitmap(f)
        const canvas = document.createElement('canvas')
        canvas.width = bmp.width; canvas.height = bmp.height
        const ctx = canvas.getContext('2d')!
        // 白色背景防止透明区域在目标应用中渲染为黑色
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(bmp, 0, 0)
        return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
      })()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch { /* ignore */ }
  }

  // 触发标签选择器（菜单关闭后展示）
  const handleCtxAddTag = () => {
    if (!ctxMenu) return
    setTagPicker({ x: ctxMenu.x, y: ctxMenu.y, files: ctxMenu.files })
  }

  // ── 确认移动 ──────────────────────────────────────────────────────

  const handleMoveConfirm = async (target: { handle: FileSystemDirectoryHandle; path: string[] }) => {
    setShowMoveDialog(false)
    if (moveTargetFiles.length > 0) await moveFiles(moveTargetFiles, target)
    setMoveTargetFiles([])
  }

  // ── 重命名确认 ────────────────────────────────────────────────────

  const handleRenameCommit = async () => {
    if (!renamingFile || !renameValue.trim() || renameValue === renamingFile.name) {
      setRenamingFile(null); return
    }
    await renameFile(renamingFile, renameValue.trim())
    setRenamingFile(null)
  }

  // ── 空状态 ──────────────────────────────────────────────────────

  const imageCount = displayFiles.filter((f) => f.type === 'image').length

  if (!navTarget) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#555' }}>
        <ImageIcon size={36} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 12 }}>选择左侧文件夹或导航项</span>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
      {/* 工具栏 */}
      <GridToolbar
        fileCount={displayFiles.length}
        imageCount={imageCount}
        title={getTitle()}
        showFilter={showFilter}
        onToggleFilter={() => setShowFilter((v) => !v)}
        onUploadClick={() => uploadRef.current?.click()}
      />

      {/* 多选状态栏 */}
      {selectedIds.size > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '4px 14px', fontSize: 11, color: '#888',
          background: 'rgba(59,130,246,0.06)',
          borderBottom: '1px solid rgba(59,130,246,0.15)', flexShrink: 0,
        }}>
          <span>已选 <strong style={{ color: '#93c5fd' }}>{selectedIds.size}</strong> 个文件</span>
          <button
            onClick={() => {
              const selected = getSelectedFiles()
              if (window.confirm(`确认删除 ${selected.length} 个文件？`)) deleteFiles(selected)
            }}
            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer' }}
          >删除</button>
          <button
            onClick={() => { setMoveTargetFiles(getSelectedFiles()); setShowMoveDialog(true) }}
            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.07)', color: '#aaa', cursor: 'pointer' }}
          >移动到…</button>
          <button
            onClick={() => setTagPicker({ x: 200, y: 60, files: getSelectedFiles() })}
            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', background: 'rgba(255,255,255,0.07)', color: '#aaa', cursor: 'pointer' }}
          >添加标签…</button>
          <button
            onClick={clearSelection}
            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: '#555', cursor: 'pointer' }}
          >取消选择</button>
        </div>
      )}

      {/* 过滤栏 */}
      {showFilter && <FilterBar />}

      {/* 内容区 */}
      <div
        data-gridarea="true"
        style={{ flex: 1, overflowY: 'auto' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={handleGridAreaClick}
      >
        {isLoading && (
          <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#555' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #444', borderTopColor: '#888', animation: 'lspin 0.8s linear infinite' }} />
            <span style={{ fontSize: 11 }}>加载中…</span>
          </div>
        )}

        {!isLoading && displayFiles.length === 0 && (
          <div style={{ padding: '60px 16px', textAlign: 'center', color: '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <Upload size={32} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 12, lineHeight: 1.8 }}>
              {rawFiles.length > 0 ? '没有符合筛选条件的文件' : '文件夹为空'}
              {navTarget.type === 'folder' && rawFiles.length === 0 && (
                <><br /><span style={{ fontSize: 11, color: '#444' }}>拖入文件或点击「上传」</span></>
              )}
            </div>
          </div>
        )}

        {/* 图墙视图 */}
        {!isLoading && displayFiles.length > 0 && view.mode === 'grid' && (
          <JustifiedGrid
            files={displayFiles}
            rowHeight={view.thumbSize}
            gap={5}
            selectedIds={selectedIds}
            onCardClick={handleCardClick}
            onCardContextMenu={handleCardContextMenu}
            onCardDoubleClick={handleCardDoubleClick}
          />
        )}

        {/* 标签分组视图 */}
        {!isLoading && displayFiles.length > 0 && view.mode === 'tagGroup' && (
          <TagGroupView
            files={displayFiles}
            rowHeight={view.thumbSize}
            selectedIds={selectedIds}
            onCardClick={handleCardClick}
            onCardContextMenu={handleCardContextMenu}
            onCardDoubleClick={handleCardDoubleClick}
          />
        )}
      </div>

      {/* 重命名弹层 */}
      {renamingFile && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setRenamingFile(null)}
        >
          <div
            style={{ background: '#1e1e1e', borderRadius: 8, padding: 16, minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>重命名文件</div>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameCommit()
                if (e.key === 'Escape') setRenamingFile(null)
              }}
              style={{ width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 6, outline: 'none', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#e0e0e0', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setRenamingFile(null)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#666', cursor: 'pointer' }}>取消</button>
              <button onClick={handleRenameCommit} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>确认</button>
            </div>
          </div>
        </div>
      )}

      <input ref={uploadRef} type="file" multiple accept="image/*,.pdf,.md,.txt" style={{ display: 'none' }} onChange={handleUploadChange} />

      {/* 右键菜单 */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} files={ctxMenu.files}
          onClose={() => setCtxMenu(null)}
          onDelete={handleCtxDelete}
          onMoveTo={handleCtxMoveTo}
          onDownload={handleCtxDownload}
          onRename={handleCtxRename}
          onOpenLightbox={handleCtxOpenLightbox}
          onCopyImage={handleCtxCopyImage}
          onAddTag={handleCtxAddTag}
        />
      )}

      {/* 标签选择器 */}
      {tagPicker && (
        <TagPickerPopup
          x={tagPicker.x} y={tagPicker.y} files={tagPicker.files}
          onClose={() => setTagPicker(null)}
        />
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && imageFiles.length > 0 && (
        <Lightbox
          files={imageFiles}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* MoveToDialog */}
      {showMoveDialog && libraryRoot && (
        <MoveToDialog
          rootHandle={libraryRoot}
          fileCount={moveTargetFiles.length}
          onConfirm={handleMoveConfirm}
          onClose={() => { setShowMoveDialog(false); setMoveTargetFiles([]) }}
        />
      )}

      <style>{`@keyframes lspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
