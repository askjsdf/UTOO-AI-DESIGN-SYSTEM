/**
 * TagGroupView — 按标签分组展示（类 Finder 风格）
 * 文件按第一个标签分组，无标签的放入「无标签」分区
 * 每个分区默认折叠到一行，点击「查看全部」展开
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { LibraryFile } from '../../../services/LibraryFileService'
import { getFileKey } from '../../../store/libraryStore'
import GridCard from './GridCard'

// ── 标签颜色（按名称哈希到调色板） ──────────────────────────────────

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

// ── 文件分组逻辑 ──────────────────────────────────────────────────

function groupFilesByTag(files: LibraryFile[]): [string, LibraryFile[]][] {
  const groups = new Map<string, LibraryFile[]>()
  for (const file of files) {
    const key = file.tags[0] ?? '无标签'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(file)
  }
  // 按标签名排序，「无标签」始终在最后
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === '无标签') return 1
    if (b === '无标签') return -1
    return a.localeCompare(b, 'zh')
  })
}

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  files: LibraryFile[]
  rowHeight: number
  selectedIds: Set<string>
  onCardClick: (file: LibraryFile, e: React.MouseEvent) => void
  onCardContextMenu: (file: LibraryFile, e: React.MouseEvent) => void
  onCardDoubleClick: (file: LibraryFile) => void
}

// ── 分区组件 ──────────────────────────────────────────────────────

interface SectionProps {
  tag: string
  files: LibraryFile[]
  cardSize: number
  gap: number
  cardsPerRow: number
  selectedIds: Set<string>
  onCardClick: (file: LibraryFile, e: React.MouseEvent) => void
  onCardContextMenu: (file: LibraryFile, e: React.MouseEvent) => void
  onCardDoubleClick: (file: LibraryFile) => void
}

function TagSection({
  tag, files, cardSize, gap, cardsPerRow,
  selectedIds, onCardClick, onCardContextMenu, onCardDoubleClick,
}: SectionProps) {
  const [expanded, setExpanded] = useState(true)

  const showCount = expanded ? files.length : Math.min(files.length, cardsPerRow)
  const hasMore = files.length > cardsPerRow
  const hiddenCount = files.length - cardsPerRow

  const isUntagged = tag === '无标签'
  const dotColor = isUntagged ? '#3a3a3a' : tagColor(tag)

  return (
    <div style={{ marginBottom: 28 }}>
      {/* 分区标题 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: 10, cursor: 'pointer', userSelect: 'none',
      }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* 颜色圆点 */}
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />

        {/* 标签名 */}
        <span style={{ fontSize: 12, fontWeight: 600, color: '#c0c0c0', flex: 1 }}>
          {tag}
        </span>

        {/* 数量 */}
        <span style={{ fontSize: 11, color: '#555' }}>{files.length} 张</span>

        {/* 折叠图标 */}
        {expanded
          ? <ChevronDown size={13} style={{ color: '#555', flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: '#555', flexShrink: 0 }} />
        }
      </div>

      {/* 图片网格 */}
      {expanded && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
            {files.slice(0, showCount).map((file) => (
              <div key={getFileKey(file)} style={{ width: cardSize, height: cardSize, flexShrink: 0, transition: 'width 0.15s ease, height 0.15s ease' }}>
                <GridCard
                  file={file}
                  isSelected={selectedIds.has(getFileKey(file))}
                  onClick={(e) => onCardClick(file, e)}
                  onContextMenu={(e) => onCardContextMenu(file, e)}
                  onDoubleClick={() => onCardDoubleClick(file)}
                />
              </div>
            ))}
          </div>

          {/* 展开/收起按钮 */}
          {hasMore && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
              style={{
                marginTop: 8, fontSize: 11, color: '#555',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#aaa')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#555')}
            >
              {expanded && showCount === files.length
                ? `收起`
                : `查看全部 ${hiddenCount + cardsPerRow} 张`
              }
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────

export default function TagGroupView({
  files, rowHeight, selectedIds,
  onCardClick, onCardContextMenu, onCardDoubleClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(900)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const gap = 5
  const cardSize = rowHeight
  // 每行可放多少张（向下取整，至少1张）
  const cardsPerRow = Math.max(1, Math.floor((containerWidth - gap) / (cardSize + gap)))

  const groups = useMemo(() => groupFilesByTag(files), [files])

  if (groups.length === 0) return null

  return (
    <div ref={containerRef} style={{ padding: '12px 14px 24px' }}>
      {groups.map(([tag, groupFiles]) => (
        <TagSection
          key={tag}
          tag={tag}
          files={groupFiles}
          cardSize={cardSize}
          gap={gap}
          cardsPerRow={cardsPerRow}
          selectedIds={selectedIds}
          onCardClick={onCardClick}
          onCardContextMenu={onCardContextMenu}
          onCardDoubleClick={onCardDoubleClick}
        />
      ))}
    </div>
  )
}
