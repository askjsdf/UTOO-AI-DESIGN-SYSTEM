/**
 * 选中画布图片后，在其右下角显示一个悬浮 AI 按钮
 * 点击后将图片附加到 AI 对话输入框
 */
import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Editor } from '@tldraw/tldraw'
import { useAppStore } from '../../store/appStore'
import { extractSelectedImages } from './workflowSend'

interface Props {
  editor: Editor
}

export default function CanvasAIButton({ editor }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [imgCount, setImgCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const setCanvasAttachRequest = useAppStore((s) => s.setCanvasAttachRequest)

  useEffect(() => {
    const update = () => {
      const selected = editor.getSelectedShapes()
      const images = selected.filter((s) => s.type === 'image')

      if (images.length === 0) {
        setPos(null)
        setImgCount(0)
        return
      }

      setImgCount(images.length)

      // 取选区在页面坐标系的边界
      const bounds = editor.getSelectionRotatedPageBounds()
      if (!bounds) { setPos(null); return }

      // 转换为视口（CSS 像素）坐标，相对于 tldraw 容器左上角
      const vp = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
      setPos({ x: vp.x, y: vp.y })
    }

    // 监听所有 store 变化（选择、相机移动、缩放都会触发）
    update()
    const unsub = editor.store.listen(update, { scope: 'all' })
    return unsub
  }, [editor])

  if (!pos) return null

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      const images = await extractSelectedImages(editor)
      if (images.length > 0) {
        setCanvasAttachRequest(images)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      title={`发送 ${imgCount} 张图片给 AI`}
      style={{
        position: 'absolute',
        left: pos.x + 6,
        top: pos.y + 6,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: imgCount > 1 ? '5px 9px' : '6px',
        background: 'rgba(14,14,14,0.92)',
        border: '1px solid rgba(212,175,55,0.35)',
        borderRadius: 20,
        cursor: loading ? 'default' : 'pointer',
        color: '#D4AF37',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        transition: 'all 0.15s',
        pointerEvents: 'auto',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(212,175,55,0.15)'
        e.currentTarget.style.borderColor = 'rgba(212,175,55,0.6)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(14,14,14,0.92)'
        e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)'
      }}
    >
      {loading ? (
        <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(212,175,55,0.3)', borderTopColor: '#D4AF37', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
      ) : (
        <Sparkles size={13} />
      )}
      {imgCount > 1 && (
        <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>{imgCount}</span>
      )}
    </button>
  )
}
