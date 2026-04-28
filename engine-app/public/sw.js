/**
 * Service Worker — 拦截 /__local_asset__/* 请求，从 OPFS 读取图片文件
 * 支持 PNG / JPG / WebP / GIF 四种格式后缀探测
 */

const ASSET_PREFIX = '/__local_asset__/'
const OPFS_DIR = 'canvas-images'

// 与 imageStore.ts 保持一致
function sanitizeId(assetId) {
  return assetId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

// ── 生命周期 ──────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  // 跳过等待，立即激活（防止首次加载时 SW 未就绪）
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // 接管所有已打开的页面
  event.waitUntil(self.clients.claim())
})

// ── 请求拦截 ──────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!url.pathname.startsWith(ASSET_PREFIX)) return

  const encodedId = url.pathname.slice(ASSET_PREFIX.length)
  const assetId = decodeURIComponent(encodedId)

  event.respondWith(serveFromOpfs(assetId))
})

async function serveFromOpfs(assetId) {
  const sanitized = sanitizeId(assetId)

  let root
  try {
    root = await navigator.storage.getDirectory()
  } catch {
    return new Response('OPFS not available', { status: 503 })
  }

  let dir
  try {
    dir = await root.getDirectoryHandle(OPFS_DIR, { create: false })
  } catch {
    return new Response('Image directory not found', { status: 404 })
  }

  // 按扩展名优先级尝试读取
  const candidates = [
    { name: sanitized + '.png', type: 'image/png' },
    { name: sanitized + '.jpg', type: 'image/jpeg' },
    { name: sanitized + '.webp', type: 'image/webp' },
    { name: sanitized + '.gif', type: 'image/gif' },
  ]

  for (const { name, type } of candidates) {
    try {
      const fh = await dir.getFileHandle(name)
      const file = await fh.getFile()
      return new Response(file, {
        status: 200,
        headers: {
          'Content-Type': file.type || type,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      // 该格式不存在，继续尝试下一个
    }
  }

  return new Response(`Asset not found: ${assetId}`, { status: 404 })
}
