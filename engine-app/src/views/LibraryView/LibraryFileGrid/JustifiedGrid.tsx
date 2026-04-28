/**
 * JustifiedGrid — Eagle 风格等高行图墙布局
 *
 * 布局规则：
 * - 每行图片等高（= rowHeight）
 * - 图片宽度按原始宽高比自适应，填满整行宽度
 * - 缩放时每行图片数量动态调整：TARGET_ROW_RATIO = containerWidth / rowHeight
 *   → 缩小时更多图片/行，放大时更少图片/行（与 Eagle 完全一致）
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import { motion, LayoutGroup } from 'motion/react'
import GridCard from './GridCard'
import type { LibraryFile } from '../../../services/LibraryFileService'

interface Props {
  files: LibraryFile[]
  rowHeight: number
  gap: number
  selectedIds: Set<string>
  onCardClick: (file: LibraryFile, e: React.MouseEvent) => void
  onCardContextMenu: (file: LibraryFile, e: React.MouseEvent) => void
  onCardDoubleClick: (file: LibraryFile) => void
}

const DEFAULT_RATIO = 1.5  // 宽高比默认值（dimensions 尚未加载时）

export default function JustifiedGrid({
  files, rowHeight, gap, selectedIds,
  onCardClick, onCardContextMenu, onCardDoubleClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(900)

  // 实时追踪容器宽度
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // 动态目标行比例 = 容器有效宽度 / 行高
  // 等价于：一行放的图片总像素宽约等于 containerWidth
  const rows = useMemo(() => {
    if (files.length === 0) return []

    const effectiveWidth = Math.max(containerWidth - gap * 2, 400)
    const TARGET = effectiveWidth / rowHeight  // 动态：行高越大 → 每行越少图

    const ratios = files.map((f) => {
      if (!f.dimensions) return DEFAULT_RATIO
      const [w, h] = f.dimensions
      return h === 0 ? DEFAULT_RATIO : w / h
    })

    const rows: LibraryFile[][] = []
    let currentRow: LibraryFile[] = []
    let rowRatioSum = 0

    for (let i = 0; i < files.length; i++) {
      const ratio = ratios[i]
      currentRow.push(files[i])
      rowRatioSum += ratio

      const isLastFile = i === files.length - 1
      if (rowRatioSum >= TARGET || isLastFile) {
        rows.push(currentRow)
        currentRow = []
        rowRatioSum = 0
      }
    }

    return rows
  }, [files, rowHeight, containerWidth, gap])

  if (files.length === 0) return null

  return (
    <div ref={containerRef} style={{ padding: gap }}>
      <LayoutGroup>
        {rows.map((row, rowIdx) => {
          const isLastRow = rowIdx === rows.length - 1
          return (
            <div
              key={rowIdx}
              style={{
                display: 'flex',
                gap,
                marginBottom: rowIdx < rows.length - 1 ? gap : 0,
                height: rowHeight,
                transition: 'height 0.45s cubic-bezier(0.25, 0.1, 0.25, 1)',
              }}
            >
              {row.map((file) => {
                const ratio = file.dimensions
                  ? file.dimensions[0] / Math.max(file.dimensions[1], 1)
                  : DEFAULT_RATIO
                const clampedRatio = Math.max(0.3, Math.min(ratio, 5))
                const fileKey = `${file.name}::${file.folderPath.join('/')}`

                return (
                  <motion.div
                    key={fileKey}
                    layoutId={fileKey}
                    layout="position"
                    transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
                    style={{
                      // 最后一行不拉伸：保持自然宽高比，不填满整行
                      flexGrow: isLastRow ? 0 : clampedRatio,
                      flexShrink: 1,
                      flexBasis: `${clampedRatio * rowHeight}px`,
                      minWidth: 40,
                      // 最后一行限制最大宽度，防止单张图片撑满全行
                      maxWidth: isLastRow ? `${clampedRatio * rowHeight * 2}px` : undefined,
                      overflow: 'hidden',
                      transition: 'flex-basis 0.45s cubic-bezier(0.25, 0.1, 0.25, 1)',
                    }}
                  >
                    <GridCard
                      file={file}
                      isSelected={selectedIds.has(fileKey)}
                      onClick={(e) => onCardClick(file, e)}
                      onContextMenu={(e) => onCardContextMenu(file, e)}
                      onDoubleClick={() => onCardDoubleClick(file)}
                    />
                  </motion.div>
                )
              })}
            </div>
          )
        })}
      </LayoutGroup>
    </div>
  )
}
