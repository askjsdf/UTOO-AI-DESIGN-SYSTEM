/**
 * Lightbox — 全屏大图查看器
 * 键盘：← → 切图，Esc 关闭，空格下一张
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import type { LibraryFile } from '../../../services/LibraryFileService'

interface Props {
  files: LibraryFile[]       // 可导航的图片文件列表（type==='image'）
  initialIndex: number
  onClose: () => void
}

export default function Lightbox({ files, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, files.length - 1)))
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const urlRef = useRef<string | null>(null)
  const file = files[index]

  // 加载当前图片
  useEffect(() => {
    if (!file || file.type !== 'image') return
    let active = true
    setLoading(true)
    setScale(1)
    file.handle.getFile().then((f) => {
      if (!active) return
      // 撤销上一个
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
      const u = URL.createObjectURL(f)
      urlRef.current = u
      setUrl(u)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [file?.name, file?.folderPath?.join('/')])

  // 组件卸载时撤销 URL
  useEffect(() => {
    return () => {
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    }
  }, [])

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : files.length - 1)), [files.length])
  const next = useCallback(() => setIndex((i) => (i < files.length - 1 ? i + 1 : 0)), [files.length])

  // 键盘导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(s + 0.25, 4))
      if (e.key === '-') setScale((s) => Math.max(s - 0.25, 0.25))
      if (e.key === '0') setScale(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, prev, next])

  if (!file) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={onClose}
    >
      {/* 顶部工具栏 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', flexShrink: 0,
          background: 'linear-gradient(rgba(0,0,0,0.6), transparent)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 13, color: '#d0d0d0', fontWeight: 500 }}>{file.name}</div>
          <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
            {index + 1} / {files.length}
            {file.dimensions && (
              <span style={{ marginLeft: 10 }}>{file.dimensions[0]} × {file.dimensions[1]} px</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 缩放 */}
          <button onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))} style={iconBtnStyle}>
            <ZoomOut size={15} />
          </button>
          <span style={{ fontSize: 11, color: '#555', minWidth: 36, textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale((s) => Math.min(s + 0.25, 4))} style={iconBtnStyle}>
            <ZoomIn size={15} />
          </button>
          <button onClick={() => setScale(1)} style={{ ...iconBtnStyle, fontSize: 10, color: '#555' }}>1:1</button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

          {/* 关闭 */}
          <button onClick={onClose} style={iconBtnStyle}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 图片区域 */}
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 上一张 */}
        {files.length > 1 && (
          <button
            onClick={prev}
            style={{
              position: 'absolute', left: 16, zIndex: 1,
              ...navBtnStyle,
            }}
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {/* 图片 */}
        <div style={{ overflow: 'auto', maxWidth: '100%', maxHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && (
            <div style={{ color: '#333', fontSize: 12 }}>加载中…</div>
          )}
          {url && !loading && (
            <img
              src={url}
              alt={file.name}
              draggable={false}
              style={{
                maxWidth: `${scale === 1 ? '100%' : 'none'}`,
                maxHeight: `${scale === 1 ? '100%' : 'none'}`,
                width: scale === 1 ? undefined : `${scale * 100}%`,
                transform: scale !== 1 ? `scale(${scale})` : undefined,
                transformOrigin: 'center center',
                display: 'block',
                objectFit: 'contain',
                userSelect: 'none',
              }}
            />
          )}
        </div>

        {/* 下一张 */}
        {files.length > 1 && (
          <button
            onClick={next}
            style={{
              position: 'absolute', right: 16, zIndex: 1,
              ...navBtnStyle,
            }}
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* 底部缩略图条（≥2张时显示） */}
      {files.length > 1 && (
        <div
          style={{
            flexShrink: 0, padding: '10px 16px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
            display: 'flex', gap: 6, overflowX: 'auto', justifyContent: 'center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {files.slice(Math.max(0, index - 10), index + 11).map((f, i) => {
            const realIdx = Math.max(0, index - 10) + i
            const isActive = realIdx === index
            return (
              <ThumbStrip
                key={f.name + f.folderPath.join('/')}
                file={f}
                active={isActive}
                onClick={() => setIndex(realIdx)}
              />
            )
          })}
        </div>
      )}

      {/* 键盘提示 */}
      <div style={{
        position: 'absolute', bottom: files.length > 1 ? 72 : 12, right: 16,
        fontSize: 10, color: '#2a2a2a',
      }}>
        ← → 切换 · Esc 关闭 · +/- 缩放
      </div>
    </div>
  )
}

// ── 底部缩略图 ────────────────────────────────────────────────────

function ThumbStrip({ file, active, onClick }: { file: LibraryFile; active: boolean; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    file.handle.getFile().then((f) => {
      u = URL.createObjectURL(f)
      setUrl(u)
    })
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [file.name])

  return (
    <div
      onClick={onClick}
      style={{
        width: 48, height: 36, borderRadius: 4, flexShrink: 0, overflow: 'hidden',
        border: `2px solid ${active ? '#3b82f6' : 'transparent'}`,
        cursor: 'pointer', background: '#222',
        transition: 'border-color 0.1s',
      }}
    >
      {url && (
        <img src={url} alt="" draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
    </div>
  )
}

// ── 样式常量 ──────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 6, border: 'none',
  background: 'rgba(255,255,255,0.06)', color: '#888', cursor: 'pointer',
}

const navBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 44, height: 44, borderRadius: '50%', border: 'none',
  background: 'rgba(255,255,255,0.1)', color: '#aaa', cursor: 'pointer',
  backdropFilter: 'blur(4px)',
}
