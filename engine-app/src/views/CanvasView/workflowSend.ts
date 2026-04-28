/**
 * 画布 → 工作流：图片提取与任务入队共享逻辑
 * 同时被 CustomImageToolbar（单选）和 CanvasSelectionToolbar（多选）使用
 */

import type { Editor } from '@tldraw/tldraw'
import { exportToBlob } from '@tldraw/tldraw'
import { useAppStore } from '../../store/appStore'
import { createPlaceholderShape } from './canvasImageUtils'

const PLACEHOLDER_GAP = 24

// Phase 3.4：检查 Service Worker 是否已激活并控制当前页面
function isSwReady(): boolean {
  return !!(navigator.serviceWorker?.controller)
}

// Phase 2.2：从 Blob 生成小缩略图（最大 256px，JPEG q=0.7，用于任务列表预览）
async function createThumbnailDataUrl(blob: Blob, maxSize = 256, quality = 0.7): Promise<string> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = url
    })
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || maxSize, img.naturalHeight || maxSize))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// 用 tldraw 自身的渲染管线把选中 image shapes 导出为 base64 数组
export async function extractSelectedImages(editor: Editor): Promise<string[]> {
  const shapes = editor.getSelectedShapes().filter((s) => s.type === 'image')
  const result: string[] = []

  for (const shape of shapes) {
    try {
      const blob = await exportToBlob({
        editor,
        ids: [shape.id],
        format: 'png',
        opts: { background: true },
      })
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      result.push(b64)
    } catch (e) {
      console.warn('[workflowSend] exportToBlob failed for shape', shape.id, e)
    }
  }
  return result
}

/**
 * 新版：从当前选中图片入队工作流，同时在每张图下方创建占位符
 * 替代 extractSelectedImages + enqueueImagesIntoWorkflow 的两步调用
 */
export async function enqueueSelectedImages(
  workflowId: string,
  editor: Editor
): Promise<{ ok: boolean; error?: string }> {
  const shapes = editor.getSelectedShapes().filter((s) => s.type === 'image')
  if (shapes.length === 0) return { ok: false, error: '未选择图片' }

  const { workflows } = useAppStore.getState()
  const wf = workflows.find((w) => w.id === workflowId)
  if (!wf) return { ok: false, error: '找不到工作流' }

  const canvasInputNodeIds = new Set(
    wf.nodes
      .filter((n) => n.type === 'imageInput' && (n.data as any).sourceMode === 'canvas')
      .map((n) => n.id)
  )
  if (canvasInputNodeIds.size === 0) {
    return { ok: false, error: `工作流「${wf.name}」没有"🎨画布"模式的图片输入节点` }
  }

  const snapshotEdges = wf.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }))

  const { enqueueTask } = useAppStore.getState()
  const total = shapes.length

  for (let i = 0; i < total; i++) {
    const shape = shapes[i]
    const bounds = editor.getShapePageBounds(shape)

    // Phase 3.4：SW 未就绪时，OPFS 图片无法被 tldraw 渲染，导出会产生空白图
    if (!isSwReady()) {
      console.warn('[workflowSend] Service Worker 未就绪，跳过 shape', shape.id)
      continue
    }

    // 提取图片数据
    let blob: Blob
    let b64: string
    try {
      blob = await exportToBlob({
        editor,
        ids: [shape.id],
        format: 'png',
        opts: { background: true },
      })
      // Phase 3.4：空 blob 检测（SW 未拦截到 OPFS 资源时 tldraw 会导出空白）
      if (blob.size === 0) {
        console.warn('[workflowSend] exportToBlob 返回空 blob，跳过 shape', shape.id)
        continue
      }
      b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      console.warn('[workflowSend] exportToBlob failed for shape', shape.id, e)
      continue
    }

    // 在源图下方创建占位符（与源图等尺寸）
    let canvasPlaceholderId: string | undefined
    if (bounds) {
      const ph = createPlaceholderShape(
        editor,
        bounds.minX,
        bounds.maxY + PLACEHOLDER_GAP,
        bounds.w,
        bounds.h
      )
      canvasPlaceholderId = ph
    }

    // Phase 2.2：inputPreviews 只存小缩略图（< 50KB），不存全尺寸 base64
    const preview = `data:image/png;base64,${b64}`
    let thumbnail: string
    try {
      thumbnail = await createThumbnailDataUrl(blob)
    } catch {
      thumbnail = preview // fallback：极端情况下用全尺寸
    }

    const snapshotNodes = wf.nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position, width: n.width, height: n.height,
      data: canvasInputNodeIds.has(n.id)
        ? { ...n.data, images: [b64], previews: [preview], fileNames: [`canvas_${i + 1}.png`] }
        : n.data,
    }))

    await enqueueTask({
      workflowId: wf.id,
      workflowName: total > 1 ? `${wf.name} (${i + 1}/${total})` : wf.name,
      source: 'canvas',
      sourceCanvasProjectId: useAppStore.getState().currentCanvasProjectId ?? undefined,
      canvasPlaceholderId,
      snapshotNodes,
      snapshotEdges,
      inputPreviews: [thumbnail],
    })
  }

  return { ok: true }
}

// 把 base64 图片数组注入目标工作流的画布模式 imageInput 节点，每张图单独入队
export async function enqueueImagesIntoWorkflow(
  workflowId: string,
  base64Images: string[]
): Promise<{ ok: boolean; error?: string }> {
  const { workflows } = useAppStore.getState()
  const wf = workflows.find((w) => w.id === workflowId)
  if (!wf) return { ok: false, error: '找不到工作流' }

  const canvasInputNodeIds = new Set(
    wf.nodes
      .filter((n) => n.type === 'imageInput' && (n.data as any).sourceMode === 'canvas')
      .map((n) => n.id)
  )
  if (canvasInputNodeIds.size === 0) {
    return { ok: false, error: `工作流「${wf.name}」没有"🎨画布"模式的图片输入节点` }
  }

  const snapshotEdges = wf.edges.map((e) => ({
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }))

  const { enqueueTask } = useAppStore.getState()
  const total = base64Images.length

  for (let i = 0; i < total; i++) {
    const b64 = base64Images[i]
    const preview = `data:image/png;base64,${b64}`

    // Phase 2.2：inputPreviews 只存小缩略图
    let thumbnail: string
    try {
      const blob = await fetch(preview).then((r) => r.blob())
      thumbnail = await createThumbnailDataUrl(blob)
    } catch {
      thumbnail = preview
    }

    const snapshotNodes = wf.nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position, width: n.width, height: n.height,
      data: canvasInputNodeIds.has(n.id)
        ? { ...n.data, images: [b64], previews: [preview], fileNames: [`canvas_${i + 1}.png`] }
        : n.data,
    }))

    await enqueueTask({
      workflowId: wf.id,
      workflowName: total > 1 ? `${wf.name} (${i + 1}/${total})` : wf.name,
      source: 'canvas',
      sourceCanvasProjectId: useAppStore.getState().currentCanvasProjectId ?? undefined,
      snapshotNodes,
      snapshotEdges,
      inputPreviews: [thumbnail],
    })
  }

  return { ok: true }
}
