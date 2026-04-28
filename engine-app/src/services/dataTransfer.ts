/**
 * dataTransfer.ts — 全量数据导出 / 导入
 *
 * 导出 ZIP 结构：
 *   meta.json              ← 版本号、日期、统计
 *   config.json            ← localStorage（API Key、设置）
 *   idb-data.json          ← IndexedDB：workflows / folders / canvasProjects / tasks / chat_messages
 *   tldraw-canvases.json   ← 每个画布项目的 tldraw IDB records
 *   canvas-images/         ← OPFS 中所有图片文件
 */

import JSZip from 'jszip'

// ── 常量 ─────────────────────────────────────────────────────────────────

const DB_NAME = 'utoo-engine'
const DB_VERSION = 6
const OPFS_DIR = 'canvas-images'
const LS_KEYS = ['utoo_gemini_api_key', 'utoo_settings', 'utoo_chat_token_usages'] as const

// ── 内部工具：utoo-engine IDB ─────────────────────────────────────────────

function openEngineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('handles'))
        db.createObjectStore('handles')
      if (!db.objectStoreNames.contains('workflows'))
        db.createObjectStore('workflows', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('canvasProjects'))
        db.createObjectStore('canvasProjects', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('tasks')) {
        const s = db.createObjectStore('tasks', { keyPath: 'id' })
        s.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains('chat_messages')) {
        const s = db.createObjectStore('chat_messages', { keyPath: 'id' })
        s.createIndex('projectId', 'projectId')
        s.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains('workflow_folders'))
        db.createObjectStore('workflow_folders', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) { resolve([]); return }
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

function clearAndInsert(db: IDBDatabase, storeName: string, records: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) { resolve(); return }
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    for (const r of records) store.put(r)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── 内部工具：tldraw IDB ──────────────────────────────────────────────────

/**
 * 净化 tldraw record，修补历史数据中 image asset props.w/h 缺失的问题。
 * tldraw 新版 schema 校验要求 w/h 必须是 number，旧数据可能为 undefined。
 */
function sanitizeTldrawRecord(record: unknown): unknown {
  if (typeof record !== 'object' || record === null) return record
  const r = record as Record<string, unknown>
  if (r.typeName === 'asset' && r.type === 'image') {
    const props = (r.props as Record<string, unknown>) ?? {}
    if (typeof props.w !== 'number' || typeof props.h !== 'number') {
      return {
        ...r,
        props: {
          ...props,
          w: typeof props.w === 'number' ? props.w : 1,
          h: typeof props.h === 'number' ? props.h : 1,
        },
      }
    }
  }
  return record
}

async function exportTldrawDB(projectId: string): Promise<unknown[]> {
  const dbName = `TLDRAW_DOCUMENT_v2utoo-canvas-${projectId}`
  return new Promise((resolve) => {
    const req = indexedDB.open(dbName)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('records'))
        req.result.createObjectStore('records', { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('records')) { db.close(); resolve([]); return }
      const tx = db.transaction(['records'], 'readonly')
      const r = tx.objectStore('records').getAll()
      r.onsuccess = () => { db.close(); resolve(r.result ?? []) }
      r.onerror = () => { db.close(); resolve([]) }
    }
    req.onerror = () => resolve([])
  })
}

async function importTldrawDB(projectId: string, records: unknown[]): Promise<void> {
  const dbName = `TLDRAW_DOCUMENT_v2utoo-canvas-${projectId}`
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('records'))
        req.result.createObjectStore('records', { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('records')) { db.close(); resolve(); return }
      const tx = db.transaction(['records'], 'readwrite')
      const store = tx.objectStore('records')
      store.clear()
      for (const r of records) store.put(sanitizeTldrawRecord(r))
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
    req.onerror = () => reject(req.error)
  })
}

// ── 内部工具：OPFS ────────────────────────────────────────────────────────

async function collectOPFSImages(): Promise<{ name: string; blob: Blob }[]> {
  const results: { name: string; blob: Blob }[] = []
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(OPFS_DIR, { create: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, handle] of dir as any) {
      if (handle.kind === 'file') {
        try {
          const file = await (handle as FileSystemFileHandle).getFile()
          results.push({ name, blob: file })
        } catch { /* skip unreadable */ }
      }
    }
  } catch { /* dir does not exist yet */ }
  return results
}

async function restoreOPFSImages(images: { name: string; data: ArrayBuffer }[]): Promise<void> {
  if (images.length === 0) return
  const root = await navigator.storage.getDirectory()
  const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true })
  for (const { name, data } of images) {
    try {
      const fh = await dir.getFileHandle(name, { create: true })
      const writable = await fh.createWritable()
      await writable.write(data)
      await writable.close()
    } catch { /* skip */ }
  }
}

// ── 公开 API ──────────────────────────────────────────────────────────────

/** 导出所有数据为 ZIP，并触发浏览器下载 */
export async function exportAllData(onProgress?: (msg: string) => void): Promise<void> {
  const zip = new JSZip()

  // 1. localStorage
  onProgress?.('正在收集配置…')
  const config: Record<string, string | null> = {}
  for (const k of LS_KEYS) config[k] = localStorage.getItem(k)
  zip.file('config.json', JSON.stringify(config, null, 2))

  // 2. utoo-engine IDB（排除不可序列化的 handles store）
  onProgress?.('正在导出数据库…')
  const db = await openEngineDB()
  const idbData = {
    workflows:        await getAllFromStore(db, 'workflows'),
    workflow_folders: await getAllFromStore(db, 'workflow_folders'),
    canvasProjects:   await getAllFromStore(db, 'canvasProjects'),
    tasks:            await getAllFromStore(db, 'tasks'),
    chat_messages:    await getAllFromStore(db, 'chat_messages'),
  }
  db.close()
  zip.file('idb-data.json', JSON.stringify(idbData, null, 2))

  // 3. tldraw 画布数据（每个项目一份）
  onProgress?.('正在导出画布…')
  const projectIds = (idbData.canvasProjects as { id: string }[]).map((p) => p.id)
  const tldrawData: Record<string, unknown[]> = {}
  for (const pid of projectIds) {
    const records = await exportTldrawDB(pid)
    if (records.length > 0) tldrawData[pid] = records
  }
  if (Object.keys(tldrawData).length > 0)
    zip.file('tldraw-canvases.json', JSON.stringify(tldrawData, null, 2))

  // 4. OPFS 图片
  onProgress?.('正在打包图片…')
  const images = await collectOPFSImages()
  const imgFolder = zip.folder('canvas-images')!
  for (const { name, blob } of images) imgFolder.file(name, blob)

  // 5. meta
  zip.file('meta.json', JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    stats: {
      workflows: idbData.workflows.length,
      canvasProjects: idbData.canvasProjects.length,
      tasks: idbData.tasks.length,
      chatMessages: idbData.chat_messages.length,
      images: images.length,
    },
  }, null, 2))

  // 6. 生成并下载
  onProgress?.('正在压缩…')
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `utoo-backup-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** 从 ZIP 文件导入所有数据（会覆盖本地现有数据） */
export async function importAllData(file: File, onProgress?: (msg: string) => void): Promise<void> {
  const zip = await JSZip.loadAsync(file)

  // 1. 配置
  onProgress?.('正在恢复配置…')
  const configFile = zip.file('config.json')
  if (configFile) {
    const config = JSON.parse(await configFile.async('text')) as Record<string, string | null>
    for (const [k, v] of Object.entries(config)) {
      if (v !== null && v !== undefined) localStorage.setItem(k, v)
      else localStorage.removeItem(k)
    }
  }

  // 2. utoo-engine IDB
  onProgress?.('正在恢复数据库…')
  const idbFile = zip.file('idb-data.json')
  if (idbFile) {
    const idbData = JSON.parse(await idbFile.async('text'))
    const db = await openEngineDB()
    const stores = ['workflows', 'workflow_folders', 'canvasProjects', 'tasks', 'chat_messages']
    for (const s of stores) {
      if (Array.isArray(idbData[s])) await clearAndInsert(db, s, idbData[s])
    }
    db.close()
  }

  // 3. tldraw 画布
  onProgress?.('正在恢复画布…')
  const tldrawFile = zip.file('tldraw-canvases.json')
  if (tldrawFile) {
    const tldrawData = JSON.parse(await tldrawFile.async('text')) as Record<string, unknown[]>
    for (const [pid, records] of Object.entries(tldrawData)) {
      await importTldrawDB(pid, records)
    }
  }

  // 4. OPFS 图片
  onProgress?.('正在恢复图片…')
  const imgFolder = zip.folder('canvas-images')
  if (imgFolder) {
    const pending: Promise<{ name: string; data: ArrayBuffer }>[] = []
    imgFolder.forEach((relPath, zf) => {
      if (!zf.dir) {
        pending.push(zf.async('arraybuffer').then((data) => ({ name: relPath, data })))
      }
    })
    const imageFiles = await Promise.all(pending)
    await restoreOPFSImages(imageFiles)
  }
}
