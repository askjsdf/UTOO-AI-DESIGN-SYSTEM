/**
 * TagPickerPopup — 浮动标签选择器
 * 从右键菜单触发，用于快速给单/多个文件打标签
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Check } from 'lucide-react'
import { useLibraryStore, getFileKey } from '../../../store/libraryStore'
import type { LibraryFile } from '../../../services/LibraryFileService'

interface Props {
  x: number
  y: number
  files: LibraryFile[]   // 右键时选中的文件（从 ctxMenu 传入，可能为初始快照）
  onClose: () => void
}

export default function TagPickerPopup({ x, y, files, onClose }: Props) {
  const { allTags, rawFiles, updateTags } = useLibraryStore()
  const [search, setSearch] = useState('')
  const [applying, setApplying] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0) }, [])

  // 关闭：点击外部 / Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const isSingle = files.length === 1

  // 从 rawFiles 中取最新的文件数据（避免使用初始快照中的陈旧 tags）
  const freshFiles = useMemo(() =>
    files.map((f) => rawFiles.find((rf) => getFileKey(rf) === getFileKey(f)) ?? f),
    [files, rawFiles]
  )
  const freshFile = freshFiles[0]

  // 当前文件已有的标签（实时）
  const currentTags: string[] = isSingle ? freshFile.tags : []
  // 多选时：所有文件都有的标签
  const commonTags: string[] = !isSingle
    ? [...allTags.keys()].filter((t) => freshFiles.every((f) => f.tags.includes(t)))
    : []

  const visibleTags = useMemo(() => {
    const trimmed = search.trim().toLowerCase()
    return [...allTags.entries()]
      .filter(([t]) => !trimmed || t.toLowerCase().includes(trimmed))
      .sort((a, b) => b[1] - a[1])
      .map(([t, count]) => ({ tag: t, count }))
  }, [allTags, search])

  const isApplied = (tag: string) => isSingle ? currentTags.includes(tag) : commonTags.includes(tag)

  const handleToggle = async (tag: string) => {
    if (applying) return
    setApplying(tag)
    try {
      if (isSingle) {
        const fresh = rawFiles.find((rf) => getFileKey(rf) === getFileKey(files[0])) ?? files[0]
        const has = fresh.tags.includes(tag)
        await updateTags(fresh, has ? fresh.tags.filter((t) => t !== tag) : [...fresh.tags, tag])
      } else {
        for (const f of files) {
          const fresh = rawFiles.find((rf) => getFileKey(rf) === getFileKey(f)) ?? f
          if (!fresh.tags.includes(tag)) {
            await updateTags(fresh, [...fresh.tags, tag])
          }
        }
      }
    } finally {
      setApplying(null)
    }
  }

  const handleCreate = async () => {
    const tag = search.trim()
    if (!tag || applying) return
    setApplying(tag)
    try {
      for (const f of files) {
        const fresh = rawFiles.find((rf) => getFileKey(rf) === getFileKey(f)) ?? f
        if (!fresh.tags.includes(tag)) {
          await updateTags(fresh, [...fresh.tags, tag])
        }
      }
      setSearch('')
    } finally {
      setApplying(null)
    }
  }

  // 自动调整位置，防止超出视口
  const safeX = Math.min(x, window.innerWidth - 244)
  const safeY = Math.min(y, window.innerHeight - 320)

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed', left: safeX, top: safeY,
        zIndex: 10000, width: 228,
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}
    >
      {/* 搜索 / 新建输入 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
            if (e.key === 'Escape') onClose()
          }}
          placeholder="搜索或新建标签…"
          style={{
            flex: 1, fontSize: 11, background: 'transparent',
            border: 'none', outline: 'none', color: '#e0e0e0', padding: 0,
          }}
        />
        {files.length > 1 && (
          <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>
            {files.length} 个
          </span>
        )}
      </div>

      {/* 标签列表 */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {/* 新建标签项 */}
        {search.trim() && !allTags.has(search.trim()) && (
          <button
            onClick={handleCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 12px', border: 'none', cursor: 'pointer',
              background: 'transparent', color: '#a3e635', fontSize: 11, textAlign: 'left',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(163,230,53,0.08)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
          >
            <Plus size={11} />
            创建 "{search.trim()}"
          </button>
        )}

        {/* 无标签提示 */}
        {visibleTags.length === 0 && !search.trim() && (
          <div style={{ padding: '14px 12px', fontSize: 11, color: '#444', textAlign: 'center' }}>
            还没有标签，输入内容新建
          </div>
        )}

        {/* 已有标签 */}
        {visibleTags.map(({ tag, count }) => {
          const applied = isApplied(tag)
          const loading = applying === tag
          return (
            <button
              key={tag}
              onClick={() => handleToggle(tag)}
              disabled={!!applying}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 12px', border: 'none',
                cursor: applying ? 'default' : 'pointer',
                background: 'transparent',
                color: applied ? '#c0c0c0' : '#888',
                fontSize: 11, textAlign: 'left',
                opacity: applying && !loading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!applying) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              <span style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: applied ? '#3b82f6' : 'rgba(255,255,255,0.08)',
                border: applied ? 'none' : '1px solid rgba(255,255,255,0.15)',
              }}>
                {applied && <Check size={8} strokeWidth={3} color="white" />}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
              <span style={{ fontSize: 9, color: '#3a3a3a', flexShrink: 0 }}>{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
