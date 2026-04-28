/**
 * FilterBar — 过滤条件栏
 * 格式 pill / 评分 pill / 标签 pill
 */

import { X } from 'lucide-react'
import { useLibraryStore, type FilterConfig } from '../../../store/libraryStore'

const FORMAT_OPTIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'md']
const RATING_OPTIONS = [1, 2, 3, 4, 5]

interface PillProps {
  label: string
  active: boolean
  onClick: () => void
  onRemove?: () => void
}

function Pill({ label, active, onClick, onRemove }: PillProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 99,
        fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${active ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
        background: active ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
        color: active ? '#93c5fd' : '#777',
        transition: 'all 0.1s',
      }}
    >
      {label}
      {active && onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{ display: 'flex', color: '#60a5fa', cursor: 'pointer' }}
        >
          <X size={9} />
        </span>
      )}
    </button>
  )
}

export default function FilterBar() {
  const { filter, setFilter, allTags } = useLibraryStore()

  const hasAnyFilter = filter.formats.length > 0 || filter.minRating > 0 || filter.tags.length > 0

  const toggleFormat = (fmt: string) => {
    setFilter({
      formats: filter.formats.includes(fmt)
        ? filter.formats.filter((f) => f !== fmt)
        : [...filter.formats, fmt],
    })
  }

  const clearAll = () => setFilter({ formats: [], minRating: 0, tags: [] })

  // 最常用的标签（前 10 个）
  const topTags = [...allTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)

  const toggleTag = (tag: string) => {
    setFilter({
      tags: filter.tags.includes(tag)
        ? filter.tags.filter((t) => t !== tag)
        : [...filter.tags, tag],
    })
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 5,
      padding: '6px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(0,0,0,0.2)',
    }}>
      {/* 清除所有 */}
      {hasAnyFilter && (
        <Pill label="清除筛选" active={false} onClick={clearAll} />
      )}

      {/* 格式过滤 */}
      {FORMAT_OPTIONS.map((fmt) => (
        <Pill
          key={fmt}
          label={fmt.toUpperCase()}
          active={filter.formats.includes(fmt)}
          onClick={() => toggleFormat(fmt)}
          onRemove={() => toggleFormat(fmt)}
        />
      ))}

      <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 2px', alignSelf: 'stretch' }} />

      {/* 评分过滤 */}
      {RATING_OPTIONS.map((r) => (
        <Pill
          key={r}
          label={`${'★'.repeat(r)} 以上`}
          active={filter.minRating === r}
          onClick={() => setFilter({ minRating: filter.minRating === r ? 0 : r })}
          onRemove={() => setFilter({ minRating: 0 })}
        />
      ))}

      {/* 标签过滤（仅显示出现过的标签） */}
      {topTags.length > 0 && (
        <>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 2px', alignSelf: 'stretch' }} />
          {topTags.map((tag) => (
            <Pill
              key={tag}
              label={`# ${tag}`}
              active={filter.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
              onRemove={() => toggleTag(tag)}
            />
          ))}
        </>
      )}
    </div>
  )
}
