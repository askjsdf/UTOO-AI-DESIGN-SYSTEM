import { useEffect, useRef } from 'react'
import { ImageIcon, FolderDown, ImagePlay, Type, AlignLeft, Sparkles, Code2, LayoutPanelLeft } from 'lucide-react'

export interface MenuItem {
  type: string
  label: string
  icon: React.ReactNode
  description: string
}

// 已实现的节点列表——后续每做完一个节点就追加进来
export const NODE_MENU_ITEMS: MenuItem[] = [
  {
    type: 'imageInput',
    label: '图片输入',
    icon: <ImageIcon size={13} />,
    description: '从文件或画布加载图片，支持多张批量',
  },
  {
    type: 'imageSave',
    label: '图片保存',
    icon: <FolderDown size={13} />,
    description: '将图片数组保存到本地文件夹',
  },
  {
    type: 'textInput',
    label: '文本输入',
    icon: <Type size={13} />,
    description: '静态提示词文本，输出到下游节点',
  },
  {
    type: 'textDisplay',
    label: '文本展示',
    icon: <AlignLeft size={13} />,
    description: '展示上游文本，并透传给下游',
  },
  {
    type: 'imageGen',
    label: '图片生成',
    icon: <ImagePlay size={13} />,
    description: 'Nano Banana 生图，支持文生图/图生图',
  },
  {
    type: 'llm',
    label: 'LLM',
    icon: <Sparkles size={13} />,
    description: '调用 Gemini，支持自定义输入端口',
  },
  {
    type: 'code',
    label: 'Code',
    icon: <Code2 size={13} />,
    description: '执行 JavaScript，自由处理上游数据',
  },
  {
    type: 'sendToCanvas',
    label: '发送到画布',
    icon: <LayoutPanelLeft size={13} />,
    description: '将图片发送到指定方案画布项目',
  },
]

interface CanvasContextMenuProps {
  x: number
  y: number
  onSelect: (type: string) => void
  onClose: () => void
}

export default function CanvasContextMenu({ x, y, onSelect, onClose }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击菜单外关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 延迟一帧，避免触发菜单的右键事件立刻关闭
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000,
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: '4px',
        minWidth: 200,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ fontSize: 10, color: '#555', padding: '4px 8px 6px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        添加节点
      </div>

      {NODE_MENU_ITEMS.map((item) => (
        <button
          key={item.type}
          onClick={() => { onSelect(item.type); onClose() }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 8px',
            background: 'transparent',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer',
            textAlign: 'left',
            color: '#e0e0e0',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ color: '#888', display: 'flex' }}>{item.icon}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{item.label}</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  )
}
