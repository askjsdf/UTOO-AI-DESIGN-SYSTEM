/**
 * LibraryInspector — 右侧文件检视器面板
 * 预览 / 评分 / 标签（带自动补全）/ 备注 / 主色调 / 文件信息
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Plus, File } from 'lucide-react'
import { getFileObjectUrl, getFileText, type LibraryFile } from '../../../services/LibraryFileService'
import { useLibraryStore } from '../../../store/libraryStore'
import StarRating from './StarRating'
import NoteEditor from './NoteEditor'
import ColorPalette from './ColorPalette'

// ── 工具 ─────────────────────────────────────────────────────────

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 10, color: '#666', width: 44, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

// ── 标签编辑器（带自动补全 + 快速添加） ──────────────────────────

function TagEditor({ file }: { file: LibraryFile }) {
  const { updateTags, allTags } = useLibraryStore()
  const tags = file.tags
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (addingTag) setTimeout(() => tagInputRef.current?.focus(), 0) }, [addingTag])

  // 所有可用标签（按使用频率排序，排除已有标签）
  const availableTags = useMemo(() => (
    [...allTags.entries()]
      .filter(([t]) => !tags.includes(t))
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
  ), [allTags, tags])

  // 输入框建议：空输入时显示前10个，有输入时按名称过滤
  const suggestions = useMemo(() => {
    if (!tagInput.trim()) return availableTags.slice(0, 10)
    return availableTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase())).slice(0, 8)
  }, [tagInput, availableTags])

  const addTag = async (tag?: string) => {
    const t = (tag ?? tagInput).trim()
    if (!t || tags.includes(t)) { setAddingTag(false); setTagInput(''); setShowSuggestions(false); return }
    await updateTags(file, [...tags, t])
    setTagInput('')
    setShowSuggestions(false)
    setTimeout(() => tagInputRef.current?.focus(), 0)
  }

  const removeTag = (tag: string) => updateTags(file, tags.filter((t) => t !== tag))
  const quickAdd  = (tag: string) => { if (!tags.includes(tag)) updateTags(file, [...tags, tag]) }

  return (
    <div>
      {/* 已有标签 + 添加输入 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {tags.map((tag) => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: 'rgba(255,255,255,0.07)', color: '#777',
          }}>
            {tag}
            <button
              onClick={() => removeTag(tag)}
              style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 0 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f87171')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#444')}
            >
              <X size={9} />
            </button>
          </span>
        ))}

        {addingTag ? (
          <div style={{ position: 'relative' }}>
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => { setTimeout(() => { setAddingTag(false); setTagInput(''); setShowSuggestions(false) }, 150) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTag() }
                if (e.key === 'Escape') { setAddingTag(false); setTagInput(''); setShowSuggestions(false) }
              }}
              placeholder="输入或选择…"
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4, outline: 'none',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                color: '#e0e0e0', width: 90,
              }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 2,
                background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '3px 0', zIndex: 50,
                minWidth: 130, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
              }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', textAlign: 'left',
                      padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                      background: 'transparent', border: 'none', color: '#888',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#c0c0c0' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#888' }}
                  >
                    <span>{s}</span>
                    <span style={{ fontSize: 9, color: '#3a3a3a', marginLeft: 8 }}>{allTags.get(s) ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAddingTag(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.1)', color: '#555',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#888'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            <Plus size={9} /> 添加标签
          </button>
        )}
      </div>

      {/* 快速添加：点击已有标签直接添加 */}
      {availableTags.length > 0 && !addingTag && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: '#444', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            快速添加
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {availableTags.slice(0, 10).map((tag) => (
              <button
                key={tag}
                onClick={() => quickAdd(tag)}
                style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  color: '#555',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#aaa'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 主组件 ───────────────────────────────────────────────────────

export default function LibraryInspector() {
  const { selectedFile } = useLibraryStore()
  const file = selectedFile

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [mdContent, setMdContent] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const prevUrlRef = useRef<string | null>(null)

  useEffect(() => {
    // 清理上一个预览 URL
    if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = null }
    setPreviewUrl(null)
    setMdContent(null)
    setFileSize(null)
    setIsExtracting(false)

    if (!file) return

    file.handle.getFile().then((f) => {
      setFileSize(f.size)
      if (file.type === 'image' || file.type === 'pdf') {
        const url = URL.createObjectURL(f)
        setPreviewUrl(url)
        prevUrlRef.current = url
      }
      if (file.type === 'image' && file.colors.length === 0) {
        setIsExtracting(true)
      }
    })

    if (file.type === 'md') {
      getFileText(file.handle).then(setMdContent)
    }

    return () => {
      if (prevUrlRef.current) { URL.revokeObjectURL(prevUrlRef.current); prevUrlRef.current = null }
    }
  }, [file?.name, file?.folderPath.join('/')])

  // 颜色提取完成后关闭骨架动画
  useEffect(() => {
    if (file && file.colors.length > 0) setIsExtracting(false)
  }, [file?.colors.length])

  // ── 空状态 ───────────────────────────────────────────────────

  if (!file) {
    return (
      <div style={{
        width: 260, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8, color: '#1e1e1e',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
      }}>
        <File size={28} style={{ opacity: 0.3, color: '#666' }} />
        <span style={{ fontSize: 11, color: '#666' }}>选择文件查看详情</span>
      </div>
    )
  }

  return (
    <div style={{
      width: 260, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      borderLeft: '1px solid rgba(255,255,255,0.05)',
      background: '#0f0f0f',
    }}>
      {/* ── 预览区 ─────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: '#080808',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', minHeight: 140, maxHeight: 260, position: 'relative',
      }}>
        {file.type === 'image' && previewUrl && (
          <img
            src={previewUrl}
            alt={file.name}
            style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }}
          />
        )}
        {file.type === 'pdf' && previewUrl && (
          <iframe src={previewUrl} style={{ width: '100%', height: 220, border: 'none' }} title={file.name} />
        )}
        {file.type === 'md' && mdContent !== null && (
          <div style={{ width: '100%', height: 160, overflow: 'auto', padding: '10px 12px', fontSize: 11, color: '#555', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {mdContent}
          </div>
        )}
        {file.type === 'other' && (
          <div style={{ padding: 24, textAlign: 'center', color: '#2a2a2a' }}>
            <File size={28} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 10 }}>暂不支持预览</div>
          </div>
        )}
        {(file.type === 'image' || file.type === 'pdf') && !previewUrl && (
          <div style={{ fontSize: 11, color: '#2a2a2a', padding: 24 }}>加载中…</div>
        )}
      </div>

      {/* ── 元数据区 ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* 文件名 */}
        <div style={{ padding: '12px 14px 0' }}>
          <div style={{ fontSize: 12, color: '#c0c0c0', fontWeight: 500, wordBreak: 'break-all', lineHeight: 1.5 }}>
            {file.name}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {fileSize != null ? formatBytes(fileSize) : ''}
            {file.dimensions && (
              <span style={{ marginLeft: 8 }}>{file.dimensions[0]} × {file.dimensions[1]} px</span>
            )}
          </div>
        </div>

        <div style={{ margin: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

        <div style={{ padding: '0 14px' }}>
          {/* 评分 */}
          <MetaRow label="评分">
            <StarRating file={file} />
          </MetaRow>

          {/* 标签 */}
          <MetaRow label="标签">
            <TagEditor file={file} />
          </MetaRow>

          {/* 备注 */}
          <MetaRow label="备注">
            <NoteEditor file={file} />
          </MetaRow>

          {/* 主色调 */}
          <MetaRow label="主色调">
            <ColorPalette colors={file.colors} isExtracting={isExtracting} />
          </MetaRow>

          <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }} />

          {/* 文件信息 */}
          <div style={{ paddingBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              文件信息
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {fileSize != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#555' }}>大小</span>
                  <span style={{ fontSize: 10, color: '#888' }}>{formatBytes(fileSize)}</span>
                </div>
              )}
              {file.dimensions && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#555' }}>尺寸</span>
                  <span style={{ fontSize: 10, color: '#888' }}>{file.dimensions[0]} × {file.dimensions[1]} px</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: '#555' }}>格式</span>
                <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>
                  {file.name.split('.').pop() ?? '-'}
                </span>
              </div>
              {file.addedAt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#555' }}>导入时间</span>
                  <span style={{ fontSize: 10, color: '#888' }}>{formatDate(file.addedAt)}</span>
                </div>
              )}
              {file.folderPath.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#555' }}>文件夹</span>
                  <span style={{ fontSize: 10, color: '#888', textAlign: 'right', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.folderPath.join(' / ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
