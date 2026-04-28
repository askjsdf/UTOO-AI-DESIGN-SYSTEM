/**
 * tldraw 自定义右键菜单
 *
 * 修复要点：
 * 1. 用 @radix-ui/react-context-menu 的 Item 替代普通 <button>
 *    → Item.onSelect 触发后菜单自动关闭（Radix 内部机制）
 * 2. 将保存逻辑移到此组件内（在 tldraw 组件树中），可直接使用 useToasts
 * 3. useValue 在菜单渲染时提前捕获 shape 列表，onSelect 里无需再查
 */
import { Item as ContextMenuItem } from '@radix-ui/react-context-menu'
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  useEditor,
  useValue,
  useToasts,
} from '@tldraw/tldraw'
import type { TLShapeId } from '@tldraw/tldraw'

import { Library } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useLibraryStore } from '../../store/libraryStore'
import { writeFile } from '../../services/LibraryFileService'
import { getImageFile } from '../../services/imageStore'

export function CanvasContextMenu() {
  const editor = useEditor()
  const { addToast } = useToasts()
  const { libraryRoot, libraryReady } = useAppStore()

  // 响应式：当菜单打开时已捕获选中的图片 shapes
  const selectedImageShapes = useValue(
    'selectedImageShapes',
    () => editor.getSelectedShapes().filter((s) => s.type === 'image'),
    [editor]
  )

  const handleSaveToLibrary = async () => {
    if (!libraryRoot || !libraryReady) return

    // 在 onSelect 同步阶段先快照 shapes（此时菜单还未关闭，shapes 仍选中）
    const shapes = selectedImageShapes

    // 目标文件夹：优先使用资产库当前选中的文件夹，否则存根目录
    const libStore = useLibraryStore.getState()
    const navTarget = libStore.navTarget
    const targetDir = navTarget?.type === 'folder' ? navTarget.handle : libraryRoot
    const folderLabel = navTarget?.type === 'folder'
      ? `「${navTarget.path[navTarget.path.length - 1]}」`
      : '根目录'

    let count = 0
    let failed = 0

    for (const shape of shapes) {
      try {
        // 优先从 OPFS 读取原始文件（无损、无黑边）
        const assetId = (shape as any).props?.assetId as string | undefined
        const originalFile = assetId ? await getImageFile(assetId) : null
        if (originalFile) {
          const ext = originalFile.name.split('.').pop() ?? 'png'
          const name = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
          await writeFile(targetDir, name, await originalFile.arrayBuffer())
        } else {
          // OPFS 找不到（旧格式图片）→ 用 tldraw 渲染，但不加画布背景
          const { blob } = await editor.toImage([shape.id as TLShapeId], {
            format: 'png',
            background: false,
          })
          if (blob.size === 0) { failed++; continue }
          const name = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`
          await writeFile(targetDir, name, await blob.arrayBuffer())
        }
        count++
      } catch (e) {
        failed++
        console.error('[Library] shape 导出失败:', e)
      }
    }

    // 刷新资产库列表
    if (libStore.navTarget) libStore.loadFiles()

    // 显示 Toast 反馈
    if (count > 0) {
      addToast({
        severity: 'success',
        title: `已存入资产库 ${count} 张`,
        description: `已保存到 ${folderLabel}`,
      })
    } else {
      addToast({
        severity: 'error',
        title: '存入失败',
        description: `${failed} 张图片无法导出，请重试`,
      })
    }
  }

  return (
    <DefaultContextMenu>
      <DefaultContextMenuContent />

      {selectedImageShapes.length > 0 && (
        <div style={{
          padding: '4px 4px 2px',
          borderTop: '1px solid rgba(144,144,144,0.2)',
          marginTop: 2,
        }}>
          <ContextMenuItem
            disabled={!libraryReady}
            onSelect={handleSaveToLibrary}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: 5,
              cursor: libraryReady ? 'pointer' : 'not-allowed',
              color: libraryReady ? 'var(--color-text)' : 'var(--color-text-3)',
              fontSize: 12,
              fontFamily: 'inherit',
              textAlign: 'left',
              opacity: libraryReady ? 1 : 0.5,
              outline: 'none',
              userSelect: 'none',
              listStyle: 'none',
            }}
            onMouseEnter={(e) => {
              if (libraryReady)
                (e.currentTarget as HTMLElement).style.background = 'var(--color-muted-1)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            <Library size={13} />
            存入资产库（{selectedImageShapes.length} 张）
          </ContextMenuItem>
        </div>
      )}
    </DefaultContextMenu>
  )
}
