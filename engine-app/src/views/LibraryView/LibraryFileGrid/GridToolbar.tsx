/**
 * GridToolbar — 文件网格工具栏
 * 标题 / 文件统计 / 排序 / 过滤开关 / 大小滑条 / 视图切换 / 上传
 */

import { useState, useRef } from 'react'
import { Upload, LayoutGrid, Tag, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useLibraryStore, type SortConfig } from '../../../store/libraryStore'

const SORT_OPTIONS: { label: string; field: SortConfig['field']; dir: SortConfig['dir'] }[] = [
  { label: '最新导入',   field: 'addedAt', dir: 'desc' },
  { label: '最早导入',   field: 'addedAt', dir: 'asc'  },
  { label: '名称 A → Z', field: 'name',    dir: 'asc'  },
  { label: '名称 Z → A', field: 'name',    dir: 'desc' },
  { label: '评分 高 → 低', field: 'rating', dir: 'desc' },
  { label: '评分 低 → 高', field: 'rating', dir: 'asc'  },
]

interface Props {
  fileCount: number
  imageCount: number
  title: string
  showFilter: boolean
  onToggleFilter: () => void
  onUploadClick: () => void
}

export default function GridToolbar({
  fileCount, imageCount, title, showFilter, onToggleFilter, onUploadClick,
}: Props) {
  const { sort, setSort, view, setView } = useLibraryStore()
  const [sortOpen, setSortOpen] = useState(false)
  const sortBtnRef = useRef<HTMLButtonElement>(null)

  const currentSortLabel = SORT_OPTIONS.find(
    (o) => o.field === sort.field && o.dir === sort.dir
  )?.label ?? '排序'

  return (
    <div style={{
      padding: '0 14px', height: 46,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {/* 标题 + 统计 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#d0d0d0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>
          {fileCount} 个文件{imageCount > 0 ? `，${imageCount} 张图片` : ''}
        </div>
      </div>

      {/* 过滤开关 */}
      <button
        onClick={onToggleFilter}
        title="筛选"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 5, cursor: 'pointer',
          border: `1px solid ${showFilter ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
          background: showFilter ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
          color: showFilter ? '#93c5fd' : '#666', fontSize: 11,
        }}
      >
        <SlidersHorizontal size={11} />
        筛选
      </button>

      {/* 排序下拉 */}
      <div style={{ position: 'relative' }}>
        <button
          ref={sortBtnRef}
          onClick={() => setSortOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '4px 8px', borderRadius: 5, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#777', fontSize: 11,
          }}
        >
          {currentSortLabel}
          <ChevronDown size={10} />
        </button>

        {sortOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setSortOpen(false)} />
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '4px 0', zIndex: 100,
              minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              {SORT_OPTIONS.map((opt) => {
                const active = opt.field === sort.field && opt.dir === sort.dir
                return (
                  <button
                    key={opt.label}
                    onClick={() => { setSort({ field: opt.field, dir: opt.dir }); setSortOpen(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '6px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
                      background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                      color: active ? '#93c5fd' : '#888',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 缩略图大小滑条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 9, color: '#555' }}>小</span>
        <input
          type="range" min={80} max={400} step={20}
          value={view.thumbSize}
          onChange={(e) => setView({ thumbSize: Number(e.target.value) })}
          style={{ width: 72, cursor: 'pointer', accentColor: '#555' }}
        />
        <span style={{ fontSize: 9, color: '#555' }}>大</span>
      </div>

      {/* 视图切换：图墙 / 标签分组 */}
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          { mode: 'grid',     Icon: LayoutGrid, title: '图墙视图' },
          { mode: 'tagGroup', Icon: Tag,         title: '标签分组' },
        ] as const).map(({ mode, Icon, title: t }) => (
          <button
            key={mode}
            onClick={() => setView({ mode })}
            title={t}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 26, cursor: 'pointer', border: 'none',
              background: view.mode === mode ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: view.mode === mode ? '#bbb' : '#555',
            }}
          >
            <Icon size={12} />
          </button>
        ))}
      </div>

      {/* 上传 */}
      <button
        onClick={onUploadClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
          borderRadius: 6, cursor: 'pointer', fontSize: 11,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
          color: '#666',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#aaa' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#666' }}
      >
        <Upload size={11} />
        上传
      </button>
    </div>
  )
}
