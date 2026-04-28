import { useState } from 'react'
import { ImageIcon, FileText, File } from 'lucide-react'
import { type LibraryFile } from '../../../services/LibraryFileService'

interface Props {
  file: LibraryFile
  isSelected: boolean
  onClick: () => void
}

export default function ListRow({ file, isSelected, onClick }: Props) {
  const [hovered, setHovered] = useState(false)
  const iconColor = { image: '#38bdf8', pdf: '#f97316', md: '#a3e635', other: '#555' }[file.type]
  const IconComp = file.type === 'image' ? ImageIcon : file.type === 'pdf' || file.type === 'md' ? FileText : File

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer',
        background: isSelected ? 'rgba(59,130,246,0.1)' : hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderLeft: `2px solid ${isSelected ? '#3b82f6' : 'transparent'}`,
        userSelect: 'none',
      }}
    >
      <IconComp size={14} style={{ color: iconColor, flexShrink: 0 }} />

      <span style={{
        flex: 1, fontSize: 12,
        color: isSelected ? '#e0e0e0' : '#888',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {file.name}
      </span>

      {/* 评分 */}
      {file.rating > 0 && (
        <span style={{ fontSize: 10, color: '#D4AF37', flexShrink: 0 }}>
          {'★'.repeat(file.rating)}
        </span>
      )}

      {/* 标签 */}
      {file.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {file.tags.slice(0, 2).map((t) => (
            <span key={t} style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 3,
              background: 'rgba(255,255,255,0.07)', color: '#777',
            }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 尺寸 */}
      {file.dimensions && (
        <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>
          {file.dimensions[0]}×{file.dimensions[1]}
        </span>
      )}
    </div>
  )
}
