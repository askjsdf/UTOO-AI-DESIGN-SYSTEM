import { useEffect, useRef, useCallback, useState } from 'react'
import { Tldraw, type Editor, AssetRecordType, createShapeId, type TLShapeId } from '@tldraw/tldraw'
import { useAppStore } from '../../store/appStore'
import { replacePlaceholderWithDataUrls } from './canvasImageUtils'
import { saveImageDataUrl, getImageFile } from '../../services/imageStore'
import CanvasProjectPanel from './CanvasProjectPanel'
import CanvasSidebar from './CanvasSidebar'
import CanvasAIButton from './CanvasAIButton'
import { CanvasContextMenu } from './CanvasContextMenu'
import { writeFile } from '../../services/LibraryFileService'

const GAP = 24
const MAX_W = 640

// ── 工具函数 ──────────────────────────────────────────────────────────

function getImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_W / img.naturalWidth)
      resolve({
        w: Math.round(img.naturalWidth * scale),
        h: Math.round(img.naturalHeight * scale),
      })
    }
    img.onerror = () => resolve({ w: MAX_W, h: MAX_W })
    img.src = src
  })
}

/**
 * 将 data URL 转为图片资产（先存 OPFS，再用本地 URL）
 */
async function prepareImageAsset(
  dataUrl: string
): Promise<{ assetId: ReturnType<typeof AssetRecordType.createId>; localUrl: string; w: number; h: number }> {
  const assetId = AssetRecordType.createId()
  const localUrl = await saveImageDataUrl(assetId, dataUrl)

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_W / img.naturalWidth)
      resolve({
        assetId,
        localUrl,
        w: Math.round(img.naturalWidth * scale),
        h: Math.round(img.naturalHeight * scale),
      })
    }
    img.onerror = () => resolve({ assetId, localUrl, w: MAX_W, h: MAX_W })
    img.src = localUrl
  })
}

/**
 * 将一批 data URL 图片插入 tldraw 画布。
 * 图片先写入 OPFS，asset src 只存本地 URL 字符串，不含 base64。
 */
async function insertImagesIntoEditor(editor: Editor, dataUrls: string[]) {
  if (dataUrls.length === 0) return
  // 并发保存到 OPFS 并获取尺寸
  const assets = await Promise.all(dataUrls.map(prepareImageAsset))

  const existingShapes = editor.getCurrentPageShapes()
  const viewportBounds = editor.getViewportPageBounds()
  const totalW = assets.reduce((s, a) => s + a.w, 0) + GAP * (assets.length - 1)

  let startX = viewportBounds.center.x - totalW / 2
  let startY = viewportBounds.center.y - assets[0].h / 2

  if (existingShapes.length > 0) {
    let minX = Infinity, maxY = -Infinity
    for (const shape of existingShapes) {
      const b = editor.getShapePageBounds(shape)
      if (!b) continue
      if (b.minX < minX) minX = b.minX
      if (b.maxY > maxY) maxY = b.maxY
    }
    startX = minX
    startY = maxY + GAP
  }

  let x = startX
  for (const { assetId, localUrl, w, h } of assets) {
    editor.createAssets([{
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: { name: 'generated.png', src: localUrl, w, h, mimeType: 'image/png', isAnimated: false },
      meta: {},
    }])
    editor.createShape({
      id: createShapeId(),
      type: 'image',
      x,
      y: startY,
      props: { assetId, w, h },
    })
    x += w + GAP
  }
}

// ── 主视图 ────────────────────────────────────────────────────────────

export default function CanvasView() {
  const {
    currentCanvasProjectId,
    pendingCanvasImages, consumePendingCanvasImages,
    pendingCanvasReplacements, consumePendingCanvasReplacements,
    orphanedPlaceholders, consumeOrphanedPlaceholders,
    libraryRoot, libraryReady, libraryPickerOpen, setLibraryPickerOpen, libraryPendingShapeIds,
  } = useAppStore()
  const editorRef = useRef<Editor | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  // 将右键时捕获的图片 shapes 通过 exportToBlob 写入 OPFS 资产库
  const handleSaveToLibrary = async () => {
    setLibraryPickerOpen(false)
    const ed = editorRef.current
    if (!ed || !libraryRoot || libraryPendingShapeIds.length === 0) return
    for (const id of libraryPendingShapeIds) {
      try {
        const { blob } = await ed.toImage([id as TLShapeId], {
          format: 'png',
          background: true,
        })
        if (blob.size === 0) { console.warn('[Library] exportToBlob 返回空 blob，跳过', id); continue }
        const name = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`
        await writeFile(libraryRoot, name, await blob.arrayBuffer())
      } catch (e) {
        console.error('[Library] 图片写入失败:', e)
      }
    }
  }

  // 右键菜单触发存入资产库（OPFS 直接写，无需弹窗）
  useEffect(() => {
    if (libraryPickerOpen) handleSaveToLibrary()
  }, [libraryPickerOpen])

  // ── Phase 1.1：pendingCanvasImages - 加 await + 错误处理 ──────────
  useEffect(() => {
    if (!editorRef.current || !currentCanvasProjectId) return
    const pending = pendingCanvasImages.filter((p) => p.projectId === currentCanvasProjectId)
    if (pending.length === 0) return
    const urls = consumePendingCanvasImages(currentCanvasProjectId)
    const ed = editorRef.current
    ;(async () => {
      try {
        await insertImagesIntoEditor(ed, urls)
      } catch (e) {
        console.error('[CanvasView] 图片插入失败:', e)
      }
    })()
  }, [pendingCanvasImages, currentCanvasProjectId])

  // ── Phase 1.1：pendingCanvasReplacements - 加 await + 错误处理 ───
  useEffect(() => {
    if (!editorRef.current || !currentCanvasProjectId) return
    const pending = pendingCanvasReplacements.filter((p) => p.projectId === currentCanvasProjectId)
    if (pending.length === 0) return
    const items = consumePendingCanvasReplacements(currentCanvasProjectId)
    const ed = editorRef.current
    ;(async () => {
      for (const { placeholderShapeId, dataUrls } of items) {
        try {
          await replacePlaceholderWithDataUrls(ed, placeholderShapeId as TLShapeId, dataUrls)
        } catch (e) {
          console.error('[CanvasView] 占位符替换失败:', e)
          // Phase 1.4：替换失败时删除孤立占位符，避免残留
          try { ed.deleteShape(placeholderShapeId as TLShapeId) } catch { /* 已删除，忽略 */ }
        }
      }
    })()
  }, [pendingCanvasReplacements, currentCanvasProjectId])

  // ── Phase 3.3：清理任务失败后的孤立占位符 ────────────────────────
  useEffect(() => {
    if (!editorRef.current || !currentCanvasProjectId) return
    const shapeIds = consumeOrphanedPlaceholders(currentCanvasProjectId)
    if (shapeIds.length === 0) return
    const ed = editorRef.current
    for (const id of shapeIds) {
      try { ed.deleteShape(id as TLShapeId) } catch { /* 已删除，忽略 */ }
    }
  }, [orphanedPlaceholders, currentCanvasProjectId])

  // ── Phase 1.2 + 1.3：handleMount ─────────────────────────────────
  const handleMount = useCallback((ed: Editor) => {
    editorRef.current = ed
    setEditor(ed)
    ed.user.updateUserPreferences({ colorScheme: 'dark' })

    // Phase 1.3：拦截所有外部图片（拖拽、粘贴、tldraw上传按钮）→ 存 OPFS
    ed.registerExternalAssetHandler('file', async ({ file }) => {
      const assetId = AssetRecordType.createId()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const localUrl = await saveImageDataUrl(assetId, dataUrl)
      const { w, h } = await getImageDimensions(localUrl)
      return {
        id: assetId,
        type: 'image' as const,
        typeName: 'asset' as const,
        props: {
          name: file.name,
          src: localUrl,   // ← /__local_asset__/... 不存 base64
          w, h,
          mimeType: file.type || 'image/png',
          isAnimated: false,
        },
        meta: {},
      }
    })

    const state = useAppStore.getState()
    const projectId = state.currentCanvasProjectId
    if (!projectId) return

    // Phase 1.2：handleMount 同时处理 pendingCanvasImages 和 pendingCanvasReplacements
    const urls = state.consumePendingCanvasImages(projectId)
    if (urls.length > 0) {
      insertImagesIntoEditor(ed, urls).catch((e) =>
        console.error('[handleMount] 图片插入失败:', e)
      )
    }

    const replacements = state.consumePendingCanvasReplacements(projectId)
    for (const { placeholderShapeId, dataUrls } of replacements) {
      replacePlaceholderWithDataUrls(ed, placeholderShapeId as TLShapeId, dataUrls).catch((e) => {
        console.error('[handleMount] 占位符替换失败:', e)
        try { ed.deleteShape(placeholderShapeId as TLShapeId) } catch { /* 忽略 */ }
      })
    }

    // 清理孤立占位符
    const orphanedIds = state.consumeOrphanedPlaceholders(projectId)
    for (const id of orphanedIds) {
      try { ed.deleteShape(id as TLShapeId) } catch { /* 忽略 */ }
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
      <CanvasProjectPanel />
      <div className="canvas-tldraw-wrapper" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {currentCanvasProjectId ? (
          <Tldraw
            key={currentCanvasProjectId}
            persistenceKey={`utoo-canvas-${currentCanvasProjectId}`}
            onMount={handleMount}
            components={{ PageMenu: null, ContextMenu: CanvasContextMenu }}
            overrides={{
              actions(_editor, actions) {
                actions['download-original'] = {
                  ...actions['download-original'],
                  onSelect: async () => {
                    const shapes = _editor.getSelectedShapes().filter((s) => s.type === 'image')
                    for (const shape of shapes) {
                      const assetId = (shape as any).props?.assetId as string | undefined
                      const file = assetId ? await getImageFile(assetId) : null
                      if (file) {
                        // 直接从 OPFS 读取原始文件，不经任何重渲染
                        const url = URL.createObjectURL(file)
                        const a = document.createElement('a')
                        a.href = url; a.download = file.name; a.click()
                        setTimeout(() => URL.revokeObjectURL(url), 1000)
                      } else {
                        // 旧格式图片不在 OPFS，用 tldraw 渲染但不加背景
                        const { blob } = await _editor.toImage([shape.id as TLShapeId], {
                          format: 'png', background: false,
                        })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url; a.download = 'image.png'; a.click()
                        setTimeout(() => URL.revokeObjectURL(url), 1000)
                      }
                    }
                  },
                }
                return actions
              },
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', fontSize: 13 }}>
            正在加载…
          </div>
        )}
        {editor && <CanvasAIButton editor={editor} />}
      </div>
      <CanvasSidebar editor={editor} />

      {/* 存入资产库：OPFS 模式下无需弹窗，libraryPickerOpen 触发后直接保存 */}
    </div>
  )
}
