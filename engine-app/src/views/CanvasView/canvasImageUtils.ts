/**
 * 画布图片工具函数
 *
 * 架构说明：
 * 所有 AI 生成图片先写入 OPFS（Origin Private File System），
 * tldraw asset 的 src 只存 /__local_asset__/{assetId} 这个轻量字符串，
 * Service Worker 拦截该 URL 并从 OPFS 流式返回文件，完全绕过 JS Heap。
 *
 * SVG 占位符因体积极小（< 5KB），仍使用 data:image/svg+xml URL，不走 OPFS。
 */

import { AssetRecordType, createShapeId, type Editor, type TLShapeId, type TLAssetId } from '@tldraw/tldraw'
import { saveImageDataUrl, saveBase64Image } from '../../services/imageStore'
import loadingSvgRaw from '../../assets/loading.svg?raw'

const GAP = 24
const MAX_W = 640

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

// ── base64 批量插入（从侧边栏 AI 对话或外部调用）──────────────────────

export async function insertBase64ImagesIntoCanvas(
  editor: Editor,
  base64Images: string[] // 纯 base64，不含 data:image/png;base64, 前缀
): Promise<void> {
  if (base64Images.length === 0) return

  // 先把所有图片保存到 OPFS，获取本地 URL 和尺寸
  const assets: Array<{ assetId: TLAssetId; localUrl: string; w: number; h: number }> = []

  for (const b64 of base64Images) {
    const assetId = AssetRecordType.createId()
    const localUrl = await saveBase64Image(assetId, b64)
    const dims = await getImageDimensions(localUrl)
    assets.push({ assetId, localUrl, w: dims.w, h: dims.h })
  }

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
      props: { name: 'ai-generated.png', src: localUrl, w, h, mimeType: 'image/png', isAnimated: false },
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

// ── 占位符 SVG 生成 ───────────────────────────────────────────────────

const LOADING_SVG_W = 316
const LOADING_SVG_H = 469

const LOADING_SVG_INNER = loadingSvgRaw
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')

function createPlaceholderSVGDataUrl(w: number, h: number): string {
  const pad = Math.round(Math.min(w, h) * 0.15)
  const innerW = w - pad * 2
  const innerH = h - pad * 2

  const scale = Math.min(innerW / LOADING_SVG_W, innerH / LOADING_SVG_H)
  const scaledW = LOADING_SVG_W * scale
  const scaledH = LOADING_SVG_H * scale
  const offsetX = pad + (innerW - scaledW) / 2
  const offsetY = pad + (innerH - scaledH) / 2

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" rx="14" ry="14" fill="#1c1c1c"/>
  <g transform="translate(${offsetX.toFixed(2)},${offsetY.toFixed(2)}) scale(${scale.toFixed(5)})">
    ${LOADING_SVG_INNER}
  </g>
</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ── 占位符工具函数 ────────────────────────────────────────────────────

/**
 * 在画布上创建 loading 占位符（SVG data URL，体积小，不走 OPFS）
 * 返回 shape id 供后续替换
 */
export function createPlaceholderShape(
  editor: Editor,
  x: number,
  y: number,
  w: number,
  h: number
): TLShapeId {
  const id = createShapeId()
  const src = createPlaceholderSVGDataUrl(w, h)

  const assetId = AssetRecordType.createId()
  editor.createAssets([{
    id: assetId,
    type: 'image',
    typeName: 'asset',
    props: { name: 'placeholder.svg', src, w, h, mimeType: 'image/svg+xml', isAnimated: false },
    meta: {},
  }])
  editor.createShape({
    id,
    type: 'image',
    x, y,
    props: { assetId, w, h },
  })
  return id
}

/**
 * 用一张或多张图片替换占位符 shape。
 * - 图片数据先全部存 OPFS（并发），tldraw asset src 存本地 URL。
 * - 首张图放在占位符位置，后续图横向紧跟（不换行）。
 * - 若占位符已被删除，从视口中心开始。
 */
export async function replacePlaceholderWithDataUrls(
  editor: Editor,
  placeholderShapeId: TLShapeId,
  dataUrls: string[]
): Promise<void> {
  if (dataUrls.length === 0) return

  // ① 先并发保存所有图片到 OPFS、获取尺寸 ── 此时占位符仍然存在
  const prepared = await Promise.all(
    dataUrls.map(async (dataUrl) => {
      const assetId = AssetRecordType.createId()
      const localUrl = await saveImageDataUrl(assetId, dataUrl)
      const { w, h } = await getImageDimensions(localUrl)
      return { assetId, localUrl, w, h }
    })
  )

  // ② 所有异步操作完成后，读取占位符位置并删除
  const shape = editor.getShape(placeholderShapeId)
  const bounds = shape ? editor.getShapePageBounds(shape) : null

  if (shape) {
    const placeholderAssetId = (shape.props as Record<string, unknown>).assetId as string | undefined
    editor.deleteShape(placeholderShapeId)
    if (placeholderAssetId) {
      try { editor.store.remove([placeholderAssetId as any]) } catch { /* 已清理则忽略 */ }
    }
  }

  // ③ 从占位符左上角开始，横向依次放置所有图片
  // 若占位符已被提前删除（异常情况），降级到现有内容右侧，而非视口中心
  let x: number
  let y: number
  if (bounds) {
    x = bounds.minX
    y = bounds.minY
  } else {
    const vp = editor.getViewportPageBounds()
    const existingShapes = editor.getCurrentPageShapes()
    if (existingShapes.length > 0) {
      let maxX = -Infinity, minY = Infinity
      for (const s of existingShapes) {
        const b = editor.getShapePageBounds(s)
        if (!b) continue
        if (b.maxX > maxX) { maxX = b.maxX; minY = b.minY }
      }
      x = maxX + GAP
      y = minY
    } else {
      x = vp.center.x
      y = vp.center.y
    }
  }

  for (const { assetId, localUrl, w, h } of prepared) {
    editor.createAssets([{
      id: assetId,
      type: 'image',
      typeName: 'asset',
      props: { name: 'ai-generated.png', src: localUrl, w, h, mimeType: 'image/png', isAnimated: false },
      meta: {},
    }])
    editor.createShape({
      id: createShapeId(),
      type: 'image',
      x, y,
      props: { assetId, w, h },
    })
    x += w + GAP  // 下一张图紧接在右侧
  }
}

/** 单张图片替换（向后兼容，供 CanvasSidebar 使用） */
export async function replacePlaceholderWithDataUrl(
  editor: Editor,
  placeholderShapeId: TLShapeId,
  dataUrl: string
): Promise<void> {
  return replacePlaceholderWithDataUrls(editor, placeholderShapeId, [dataUrl])
}

/**
 * 计算下一张图片的插入位置（现有内容最左下方）
 * 供侧边栏生图使用，w/h 为待插入占位符的尺寸
 */
export function calculateNextInsertPosition(
  editor: Editor,
  w: number,
  h: number
): { x: number; y: number } {
  const existingShapes = editor.getCurrentPageShapes()
  const viewportBounds = editor.getViewportPageBounds()

  if (existingShapes.length === 0) {
    return {
      x: viewportBounds.center.x - w / 2,
      y: viewportBounds.center.y - h / 2,
    }
  }

  let minX = Infinity, maxY = -Infinity
  for (const shape of existingShapes) {
    const b = editor.getShapePageBounds(shape)
    if (!b) continue
    if (b.minX < minX) minX = b.minX
    if (b.maxY > maxY) maxY = b.maxY
  }
  return { x: minX, y: maxY + GAP }
}
