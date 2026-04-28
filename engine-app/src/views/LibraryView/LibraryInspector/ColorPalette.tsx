/**
 * ColorPalette — 图片主色调展示与搜索
 * 点击色块 → 触发颜色导航（找相似颜色图片）
 */

import { useLibraryStore } from '../../../store/libraryStore'

interface Props {
  colors: string[]      // HEX 数组，0-5 个
  isExtracting: boolean // 正在后台提取
}

export default function ColorPalette({ colors, isExtracting }: Props) {
  const { setNavTarget, loadFiles } = useLibraryStore()

  const handleColorClick = (hex: string) => {
    setNavTarget({ type: 'color', hex })
    loadFiles()
  }

  // 提取中状态（骨架动画）
  if (isExtracting && colors.length === 0) {
    return (
      <div style={{ display: 'flex', gap: 5 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
              animation: `colorPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
        <style>{`
          @keyframes colorPulse {
            0%, 100% { opacity: 0.3 }
            50% { opacity: 0.7 }
          }
        `}</style>
      </div>
    )
  }

  // 无颜色数据
  if (colors.length === 0) {
    return (
      <span style={{ fontSize: 10, color: '#2a2a2a' }}>未提取</span>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {colors.map((hex, i) => (
        <div
          key={i}
          title={`${hex}\n点击搜索相似颜色`}
          onClick={() => handleColorClick(hex)}
          style={{
            width: 20, height: 20, borderRadius: 4,
            background: hex,
            cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.1)',
            transition: 'transform 0.1s, box-shadow 0.1s',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.transform = 'scale(1.2)'
            el.style.boxShadow = `0 0 0 2px rgba(255,255,255,0.2)`
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.transform = 'scale(1)'
            el.style.boxShadow = 'none'
          }}
        />
      ))}
    </div>
  )
}
