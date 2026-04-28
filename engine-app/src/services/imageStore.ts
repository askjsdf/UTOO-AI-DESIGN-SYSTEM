/**
 * imageStore — OPFS 图片存储层
 *
 * 所有 AI 生成图片写入 OPFS（Origin Private File System），
 * tldraw 只存 /__local_asset__/{assetId} 这个轻量 URL 字符串，
 * Service Worker 拦截该 URL 并从 OPFS 流式返回文件。
 *
 * 这样图片数据完全脱离 JS Heap 和 tldraw 的 IndexedDB。
 */

const OPFS_DIR = 'canvas-images'
const LOCAL_ASSET_PREFIX = '/__local_asset__/'

// ── ID / 文件名工具 ───────────────────────────────────────────────────

/** 与 sw.js 保持一致 — 只允许文件系统安全字符 */
function sanitizeId(assetId: string): string {
  return assetId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** 从 data URL 推断扩展名 */
function extFromDataUrl(dataUrl: string): string {
  const mime = dataUrl.match(/data:([^;]+);/)?.[1] ?? 'image/png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'png'
}

// ── URL 工具 ──────────────────────────────────────────────────────────

/** 生成 tldraw asset src 字符串 */
export function assetIdToLocalUrl(assetId: string): string {
  return LOCAL_ASSET_PREFIX + encodeURIComponent(assetId)
}

/** 判断是否是我们的本地资产 URL */
export function isLocalAssetUrl(url: string): boolean {
  return url.startsWith(LOCAL_ASSET_PREFIX)
}

/** 从本地 URL 还原 assetId（找不到则返回 null） */
export function localUrlToAssetId(url: string): string | null {
  if (!url.startsWith(LOCAL_ASSET_PREFIX)) return null
  return decodeURIComponent(url.slice(LOCAL_ASSET_PREFIX.length))
}

// ── OPFS 目录句柄 ─────────────────────────────────────────────────────

async function getImagesDir(create = true): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(OPFS_DIR, { create })
}

// ── 写入 ──────────────────────────────────────────────────────────────

/**
 * 将 Blob 存入 OPFS，返回本地 URL。
 * 文件名：sanitize(assetId).{ext}
 */
export async function saveImageBlob(
  assetId: string,
  blob: Blob,
  ext = 'png'
): Promise<string> {
  const dir = await getImagesDir(true)
  const filename = sanitizeId(assetId) + '.' + ext
  const fh = await dir.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(blob)
  await writable.close()
  return assetIdToLocalUrl(assetId)
}

/**
 * 将 base64 data URL 存入 OPFS，返回本地 URL。
 * 这是主要入口，由 canvasImageUtils 和 DAGEngine 调用。
 */
export async function saveImageDataUrl(
  assetId: string,
  dataUrl: string
): Promise<string> {
  const ext = extFromDataUrl(dataUrl)
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return saveImageBlob(assetId, blob, ext)
}

/**
 * 将纯 base64 字符串（不含 data: 前缀）存入 OPFS。
 * 默认视为 image/png。
 */
export async function saveBase64Image(
  assetId: string,
  base64: string
): Promise<string> {
  return saveImageDataUrl(assetId, `data:image/png;base64,${base64}`)
}

// ── 删除 ──────────────────────────────────────────────────────────────

/** 从 OPFS 删除图片（忽略不存在的文件） */
export async function deleteImage(assetId: string): Promise<void> {
  try {
    const dir = await getImagesDir(false)
    const sanitized = sanitizeId(assetId)
    for (const ext of ['png', 'jpg', 'webp', 'gif']) {
      try { await dir.removeEntry(sanitized + '.' + ext) } catch { /* ok */ }
    }
  } catch { /* 目录不存在，忽略 */ }
}

// ── 导出 ──────────────────────────────────────────────────────────────

/**
 * 将 OPFS 中所有图片复制到用户指定目录（使用 File System Access API）。
 * 供 app 内"导出图片"功能调用。
 */
export async function exportImagesToFolder(
  destDirHandle: FileSystemDirectoryHandle,
  onProgress?: (done: number, total: number) => void
): Promise<{ saved: number; failed: number }> {
  let dir: FileSystemDirectoryHandle
  try {
    dir = await getImagesDir(false)
  } catch {
    return { saved: 0, failed: 0 }
  }

  // 收集所有文件
  const entries: FileSystemFileHandle[] = []
  for await (const [, handle] of (dir as any)) {
    if (handle.kind === 'file') entries.push(handle as FileSystemFileHandle)
  }

  let saved = 0, failed = 0
  for (let i = 0; i < entries.length; i++) {
    try {
      const file = await entries[i].getFile()
      const destFh = await destDirHandle.getFileHandle(file.name, { create: true })
      const writable = await destFh.createWritable()
      await writable.write(file)
      await writable.close()
      saved++
    } catch {
      failed++
    }
    onProgress?.(i + 1, entries.length)
    // 每 10 张让主线程喘口气
    if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0))
  }
  return { saved, failed }
}

// ── OPFS 垃圾回收 ─────────────────────────────────────────────────────

const GC_FLAG_KEY = 'utoo_opfs_gc_last_run'
const GC_INTERVAL_MS = 24 * 60 * 60 * 1000  // 每天最多运行一次
const GC_MIN_AGE_MS = 60 * 60 * 1000        // 只删除超过 1 小时的文件，保护刚写入的

/**
 * 从 tldraw IDB 收集某个项目所有被引用的 assetId
 */
export async function collectProjectAssetIds(projectId: string): Promise<string[]> {
  const dbName = `TLDRAW_DOCUMENT_v2utoo-canvas-${projectId}`
  const assetIds: string[] = []
  try {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(dbName)
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
      req.onblocked = () => rej(new Error(`DB blocked: ${dbName}`))
    })
    await new Promise<void>((res, rej) => {
      if (!Array.from(db.objectStoreNames).includes('records')) { res(); return }
      const tx = db.transaction(['records'], 'readonly')
      const store = tx.objectStore('records')
      const req = store.openCursor()
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result
        if (!cursor) { res(); return }
        const record = cursor.value
        if (
          record?.typeName === 'asset' &&
          record?.type === 'image' &&
          typeof record?.props?.src === 'string' &&
          record.props.src.startsWith(LOCAL_ASSET_PREFIX)
        ) {
          assetIds.push(decodeURIComponent(record.props.src.slice(LOCAL_ASSET_PREFIX.length)))
        }
        cursor.continue()
      }
      req.onerror = () => rej(req.error)
    })
    db.close()
  } catch { /* DB 不存在则忽略 */ }
  return assetIds
}

/**
 * 扫描所有 utoo-canvas-* IDB，收集被引用的 assetId，
 * 与 OPFS 文件对比后删除孤立文件（> 1 小时的才删，保护刚写入的）。
 * 每 24 小时最多运行一次。
 */
export async function runOPFSGarbageCollection(force = false): Promise<{
  scanned: number; deleted: number; freed: number
}> {
  if (!force) {
    const last = parseInt(localStorage.getItem(GC_FLAG_KEY) ?? '0', 10)
    if (Date.now() - last < GC_INTERVAL_MS) return { scanned: 0, deleted: 0, freed: 0 }
  }

  // 1. 收集所有 IDB 中引用的 assetId（不区分项目）
  const referencedIds = new Set<string>()
  try {
    const allDbs = await indexedDB.databases()
    for (const dbInfo of allDbs.filter((d) => d.name?.includes('utoo-canvas'))) {
      const projectId = dbInfo.name!.replace(/.*utoo-canvas-/, '')
      const ids = await collectProjectAssetIds(projectId)
      ids.forEach((id) => referencedIds.add(id))
    }
  } catch { /* indexedDB.databases() 在某些浏览器不支持，忽略 */ }

  // 2. 列出 OPFS 所有文件，找出孤立文件并删除
  let dir: FileSystemDirectoryHandle
  try {
    dir = await getImagesDir(false)
  } catch {
    localStorage.setItem(GC_FLAG_KEY, String(Date.now()))
    return { scanned: 0, deleted: 0, freed: 0 }
  }

  const now = Date.now()
  let scanned = 0, deleted = 0, freed = 0

  const entries: [string, FileSystemFileHandle][] = []
  for await (const [name, handle] of (dir as any)) {
    if (handle.kind === 'file') entries.push([name as string, handle as FileSystemFileHandle])
  }
  scanned = entries.length

  for (const [filename, fileHandle] of entries) {
    try {
      const file = await fileHandle.getFile()
      // 安全边界：只删除超过 1 小时的文件
      if (now - file.lastModified < GC_MIN_AGE_MS) continue

      // 从文件名推断 assetId（去掉扩展名后反查）
      // 文件名格式：sanitizeId(assetId).ext
      // 由于 sanitize 是单向的，我们直接对比 sanitized 形式
      const baseName = filename.replace(/\.[^.]+$/, '') // 去掉扩展名
      const isReferenced = [...referencedIds].some(
        (id) => sanitizeId(id) === baseName
      )
      if (!isReferenced) {
        freed += file.size
        await dir.removeEntry(filename)
        deleted++
      }
    } catch { /* 文件已被删除或无法访问，忽略 */ }
  }

  localStorage.setItem(GC_FLAG_KEY, String(Date.now()))
  return { scanned, deleted, freed }
}

/**
 * 删除某个 assetId 对应的 OPFS 文件，前提是除 excludeProjectId 外
 * 没有其他项目引用它（用于删除项目时清理独属文件）。
 */
export async function deleteImageIfOrphaned(
  assetId: string,
  excludeProjectId?: string
): Promise<boolean> {
  try {
    const allDbs = await indexedDB.databases()
    const otherDbs = allDbs.filter(
      (d) => d.name?.includes('utoo-canvas') && !d.name?.includes(excludeProjectId ?? '__none__')
    )
    for (const dbInfo of otherDbs) {
      const projectId = dbInfo.name!.replace(/.*utoo-canvas-/, '')
      const ids = await collectProjectAssetIds(projectId)
      if (ids.includes(assetId)) return false
    }
  } catch { return false }
  await deleteImage(assetId)
  return true
}

// ── 按 assetId 读取原始文件 ───────────────────────────────────────────

/**
 * 从 OPFS 中读取原始图片文件（File 对象）。
 * 按常见扩展名逐一尝试，找到即返回；找不到返回 null。
 */
export async function getImageFile(assetId: string): Promise<File | null> {
  try {
    const dir = await getImagesDir(false)
    const sanitized = sanitizeId(assetId)
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
      try {
        const fh = await dir.getFileHandle(`${sanitized}.${ext}`)
        return await fh.getFile()
      } catch { /* 该扩展名不存在，继续尝试 */ }
    }
    return null
  } catch {
    return null
  }
}

// ── 统计 ──────────────────────────────────────────────────────────────

/** 返回 OPFS 中存储的图片数量和总字节数 */
export async function getStorageStats(): Promise<{ count: number; bytes: number }> {
  try {
    const dir = await getImagesDir(false)
    let count = 0, bytes = 0
    for await (const [, handle] of (dir as any)) {
      if (handle.kind === 'file') {
        count++
        try {
          const file = await (handle as FileSystemFileHandle).getFile()
          bytes += file.size
        } catch { /* ok */ }
      }
    }
    return { count, bytes }
  } catch {
    return { count: 0, bytes: 0 }
  }
}
