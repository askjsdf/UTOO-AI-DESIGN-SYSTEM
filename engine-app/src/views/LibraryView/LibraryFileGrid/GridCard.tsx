import { useState, useEffect, useRef } from 'react'
import { Loader2, FileText, File } from 'lucide-react'
import { getFileObjectUrl, type LibraryFile } from '../../../services/LibraryFileService'
import { useLibraryStore, triggerColorExtract } from '../../../store/libraryStore'

interface Props {
  file: LibraryFile
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onDoubleClick: () => void
}

export default function GridCard({ file, isSelected, onClick, onContextMenu, onDoubleClick }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(file.type === 'image')
  const [hovered, setHovered] = useState(false)
  const urlRef = useRef<string | null>(null)
  const store = useLibraryStore.getState

  // 加载缩略图
  useEffect(() => {
    if (file.type !== 'image') return
    let active = true
    setImgLoading(true)
    getFileObjectUrl(file.handle)
      .then((url) => {
        if (!active) { URL.revokeObjectURL(url); return }
        urlRef.current = url
        setThumbUrl(url)
        setImgLoading(false)
      })
      .catch(() => { if (active) setImgLoading(false) })
    return () => {
      active = false
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    }
  }, [file.name, file.folderPath.join('/')])

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const dims: [number, number] = [img.naturalWidth, img.naturalHeight]
    if (!file.dimensions) {
      useLibraryStore.getState().updateDimensions(file, dims)
    }
    if (file.colors.length === 0) {
      triggerColorExtract(file, store())
    }
  }

  const nonImgCfg: Record<string, { bg: string; color: string; label: string }> = {
    pdf:   { bg: 'rgba(249,115,22,0.12)', color: '#f97316', label: 'PDF'  },
    md:    { bg: 'rgba(163,230,53,0.08)', color: '#a3e635', label: 'MD'   },
    other: { bg: 'rgba(255,255,255,0.04)', color: '#555',   label: 'FILE' },
  }

  // 多选时显示蓝色勾选圆
  const showCheckmark = isSelected

  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        height: '100%',
        flex: '1 1 auto',
        overflow: 'hidden',
        borderRadius: 2,
        cursor: 'pointer',
        outline: isSelected
          ? '2px solid #3b82f6'
          : hovered ? '1px solid rgba(255,255,255,0.18)' : 'none',
        outlineOffset: isSelected ? -2 : 0,
        background: '#141414',
        transition: 'outline 0.1s',
        userSelect: 'none',
      }}
    >
      {/* 图片 */}
      {file.type === 'image' && (
        <>
          {imgLoading && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={14} style={{ color: '#333', animation: 'lspin 0.8s linear infinite' }} />
            </div>
          )}
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt={file.name}
              onLoad={handleImgLoad}
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </>
      )}

      {/* 非图片 */}
      {file.type !== 'image' && (() => {
        const cfg = nonImgCfg[file.type] ?? nonImgCfg.other
        const Icon = file.type === 'pdf' || file.type === 'md' ? FileText : File
        return (
          <div style={{
            height: '100%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: cfg.bg,
          }}>
            <Icon size={22} style={{ color: cfg.color }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: '0.1em' }}>
              {cfg.label}
            </span>
          </div>
        )
      })()}

      {/* Hover 遮罩 + 文件名 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '18px 7px 6px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
        opacity: hovered || isSelected ? 1 : 0,
        transition: 'opacity 0.15s',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 10, color: '#d0d0d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
        {file.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
            {file.tags.slice(0, 3).map((t) => (
              <span key={t} style={{
                fontSize: 9, padding: '1px 4px', borderRadius: 3,
                background: 'rgba(255,255,255,0.18)', color: '#ccc',
              }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 评分角标 */}
      {file.rating > 0 && (
        <div style={{
          position: 'absolute', top: 5, left: 5,
          fontSize: 8, color: '#D4AF37',
          textShadow: '0 0 4px rgba(0,0,0,0.8)',
        }}>
          {'★'.repeat(file.rating)}
        </div>
      )}

      {/* 选中勾（hover 时或已选中时显示圆形勾） */}
      {(showCheckmark || hovered) && (
        <div style={{
          position: 'absolute', top: 5, right: 5,
          width: 18, height: 18, borderRadius: '50%',
          background: showCheckmark ? '#3b82f6' : 'rgba(0,0,0,0.5)',
          border: showCheckmark ? 'none' : '1.5px solid rgba(255,255,255,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.1s, border 0.1s',
        }}>
          {showCheckmark && (
            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}

      <style>{`@keyframes lspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
