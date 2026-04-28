/**
 * dataTransfer.ts — 全量数据导出 / 导入
 *
 * 导出 ZIP 结构：
 *   meta.json              ← 版本号、日期、统计
 *   config.json            ← localStorage（API Key、设置）
 *   idb-data.json          ← IndexedDB：workflows / folders / canvasProjects / tasks / chat_messages
 *   tldraw-canvases.json   ← 每个画布项目的 tldraw IDB records
 *   canvas-images/         ← OPFS 中所有画布图片文件
 *   library/               ← OPFS/library 整个目录树（含 _meta.json 和子文件夹）
 */

import JSZip from 'jszip'
import {
  createTLSchemaFromUtils,
  defaultBindingUtils,
  defaultShapeUtils,
} from '@tldraw/tldraw'

// ── 常量 ─────────────────────────────────────────────────────────────────

const DB_NAME = 'utoo-engine'
const DB_VERSION = 6
const OPFS_DIR = 'canvas-images'
const LIBRARY_DIR = 'library'
const TLDRAW_DB_PREFIX = 'TLDRAW_DOCUMENT_v2utoo-canvas-'
const TLDRAW_DB_VERSION = 4 // 必须与 tldraw 内部一致（@tldraw/editor LocalIndexedDb）
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
 * 获取当前 tldraw schema 的序列化形态（含所有 sequence 的最新版本号）。
 * 用于写入 schema store —— 让 tldraw load 时认为 records 已是最新版本，跳过 UP 迁移。
 * （tldraw 的 RenameWidthHeight UP 迁移会用 props.width 覆盖 props.w，
 *   而我们的 records 没有 width/height，导致 w 被擦成 undefined。
 *   写入正确 schema 后，这条迁移不会触发。）
 */
let _cachedSchema: unknown | null = null
function getCurrentTldrawSchema(): unknown {
  if (_cachedSchema) return _cachedSchema
  const schema = createTLSchemaFromUtils({
    shapeUtils: defaultShapeUtils,
    bindingUtils: defaultBindingUtils,
  })
  _cachedSchema = schema.serialize()
  return _cachedSchema
}

/**
 * 净化 tldraw record，修补历史数据中 image asset props.w/h 缺失或非法的问题。
 * tldraw 新版 schema 校验要求 w/h 必须是有限正数，旧数据可能为 undefined / NaN / 0 / 负数。
 * 返回的对象：如果发生修复则是新对象；否则原样返回（用于差异检测）。
 */
function sanitizeTldrawRecord(record: unknown): unknown {
  if (typeof record !== 'object' || record === null) return record
  const r = record as Record<string, unknown>
  if (r.typeName === 'asset' && r.type === 'image') {
    const props = (r.props ?? {}) as Record<string, unknown>
    const w = props.w
    const h = props.h
    const wOk = typeof w === 'number' && Number.isFinite(w) && w > 0
    const hOk = typeof h === 'number' && Number.isFinite(h) && h > 0
    if (!wOk || !hOk) {
      return {
        ...r,
        props: {
          ...props,
          w: wOk ? w : 1,
          h: hOk ? h : 1,
        },
      }
    }
  }
  return record
}

async function exportTldrawDB(projectId: string): Promise<unknown[]> {
  const dbName = `${TLDRAW_DB_PREFIX}${projectId}`
  return new Promise((resolve) => {
    const req = indexedDB.open(dbName)
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

/**
 * 写入 tldraw 画布 IDB。
 * 关键修复：tldraw 内部 records store 是无 keyPath 的，写入时用 put(record, id) 显式指定 key。
 * 旧版本本工具误用 keyPath:'id' 创建过 store —— 为避免 schema 不一致，导入前先删库重建。
 */
async function importTldrawDB(projectId: string, records: unknown[]): Promise<void> {
  const dbName = `${TLDRAW_DB_PREFIX}${projectId}`

  // 始终先删库，确保以 tldraw 期望的 schema 重建（无 keyPath）
  await new Promise<void>((res) => {
    const delReq = indexedDB.deleteDatabase(dbName)
    delReq.onsuccess = () => res()
    delReq.onerror = () => res()
    delReq.onblocked = () => res()
  })

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, TLDRAW_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // 与 @tldraw/editor LocalIndexedDb 保持一致：四个 store，全部无 keyPath
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records')
      if (!db.objectStoreNames.contains('schema')) db.createObjectStore('schema')
      if (!db.objectStoreNames.contains('session_state')) db.createObjectStore('session_state')
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(['records', 'schema'], 'readwrite')
      const store = tx.objectStore('records')
      const schemaStore = tx.objectStore('schema')
      for (const r of records) {
        const sanitized = sanitizeTldrawRecord(r) as { id?: string }
        if (sanitized && typeof sanitized.id === 'string') {
          store.put(sanitized, sanitized.id)
        }
      }
      // 写当前 schema 序列化，避免 tldraw load 时跑 UP 迁移擦掉 w/h
      schemaStore.put(getCurrentTldrawSchema(), 'schema')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * 启动期防御性清理：扫描所有 tldraw 画布 IDB。
 * - 读出所有 record，跑一遍 sanitize 修补非法 w/h
 * - 删库重建（确保 schema 与 tldraw 期望一致：4 store、无 keyPath）
 * - 把 sanitize 过的 record 写回新库
 * 不依赖现有 store 的 keyPath 状态，处理路径统一可观测。
 */
export async function sanitizeAllTldrawIDBs(): Promise<void> {
  // 1. 列出所有 IDB
  let dbs: IDBDatabaseInfo[] = []
  try {
    dbs = await indexedDB.databases?.() ?? []
  } catch (e) {
    console.warn('[sanitize] indexedDB.databases() 调用失败:', e)
    return
  }
  const allNames = dbs.map((d) => d.name).filter(Boolean) as string[]
  const tldrawNames = allNames.filter((n) => n.startsWith(TLDRAW_DB_PREFIX))
  console.info('[sanitize] IDB 列表：', allNames)
  console.info('[sanitize] 待处理 tldraw 画布 IDB:', tldrawNames.length, tldrawNames)

  for (const name of tldrawNames) {
    try {
      await sanitizeOneTldrawDB(name)
    } catch (e) {
      console.warn('[sanitize] 处理失败（跳过）:', name, e)
    }
  }
  console.info('[sanitize] 完成')
}

async function sanitizeOneTldrawDB(dbName: string): Promise<void> {
  // 1. 读出所有 records（同时检测 keyPath）
  const probe = await new Promise<{ records: unknown[]; hasKeyPath: boolean; ok: boolean }>(
    (res) => {
      const req = indexedDB.open(dbName)
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('records')) {
          db.close()
          res({ records: [], hasKeyPath: false, ok: false })
          return
        }
        const tx = db.transaction('records', 'readonly')
        const store = tx.objectStore('records')
        const hasKeyPath = !!store.keyPath
        const getAllReq = store.getAll()
        let records: unknown[] = []
        getAllReq.onsuccess = () => { records = getAllReq.result ?? [] }
        getAllReq.onerror = () => { records = [] }
        tx.oncomplete = () => { db.close(); res({ records, hasKeyPath, ok: true }) }
        tx.onerror = () => { db.close(); res({ records: [], hasKeyPath, ok: false }) }
        tx.onabort = () => { db.close(); res({ records: [], hasKeyPath, ok: false }) }
      }
      req.onerror = () => res({ records: [], hasKeyPath: false, ok: false })
      req.onblocked = () => res({ records: [], hasKeyPath: false, ok: false })
    }
  )

  if (!probe.ok || probe.records.length === 0) {
    console.info(`[sanitize] ${dbName}: 跳过（store 不存在或空）`)
    return
  }

  // 2. sanitize 所有 records（统计修复数量）
  let fixCount = 0
  let imageAssetCount = 0
  const sanitized = probe.records.map((r) => {
    const isImageAsset = (r as Record<string, unknown>)?.typeName === 'asset'
      && (r as Record<string, unknown>)?.type === 'image'
    if (isImageAsset) imageAssetCount++
    const s = sanitizeTldrawRecord(r)
    if (s !== r) fixCount++
    return s
  })
  console.info(
    `[sanitize] ${dbName}: 总 records=${probe.records.length}, image asset=${imageAssetCount}, 修复=${fixCount}, hasKeyPath=${probe.hasKeyPath}`
  )

  // 3. 始终删库重建（保证 schema 与 tldraw 期望一致）
  //    给上一次 db.close() 一点时间真正断开，避免 deleteDatabase 被 block
  await new Promise((r) => setTimeout(r, 50))

  await new Promise<void>((res) => {
    const delReq = indexedDB.deleteDatabase(dbName)
    delReq.onsuccess = () => res()
    delReq.onerror = (e) => { console.warn('[sanitize] deleteDatabase 失败:', dbName, e); res() }
    delReq.onblocked = () => {
      console.warn('[sanitize] deleteDatabase 被阻塞:', dbName, '— 等 200ms 后继续')
      setTimeout(() => res(), 200)
    }
  })

  // 4. 重建（schema 与 @tldraw/editor LocalIndexedDb 一致）
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(dbName, TLDRAW_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records')
      if (!db.objectStoreNames.contains('schema')) db.createObjectStore('schema')
      if (!db.objectStoreNames.contains('session_state')) db.createObjectStore('session_state')
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction(['records', 'schema'], 'readwrite')
      const store = tx.objectStore('records')
      const schemaStore = tx.objectStore('schema')
      let written = 0
      for (const r of sanitized) {
        const s = r as { id?: string }
        if (s && typeof s.id === 'string') {
          store.put(s, s.id)
          written++
        }
      }
      // 写当前 schema 序列化，避免 tldraw load 时跑 UP 迁移擦掉 w/h
      schemaStore.put(getCurrentTldrawSchema(), 'schema')
      tx.oncomplete = () => {
        console.info(`[sanitize] ${dbName}: 重建完成，写回 ${written} 条 + schema`)
        db.close()
        resolve()
      }
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

// ── 内部工具：OPFS Library（资产库整个目录树） ─────────────────────────

async function walkOPFSDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: { path: string; blob: Blob }[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of dir as any) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        out.push({ path, blob: file })
      } catch { /* skip unreadable */ }
    } else if (handle.kind === 'directory') {
      await walkOPFSDir(handle as FileSystemDirectoryHandle, path, out)
    }
  }
}

async function collectLibraryTree(): Promise<{ path: string; blob: Blob }[]> {
  const out: { path: string; blob: Blob }[] = []
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle(LIBRARY_DIR, { create: false })
    await walkOPFSDir(dir, '', out)
  } catch { /* library 目录不存在 */ }
  return out
}

async function restoreLibraryTree(files: { path: string; data: ArrayBuffer }[]): Promise<void> {
  const root = await navigator.storage.getDirectory()
  // 整目录覆盖：先清空旧 library，再写入新数据（避免 _meta.json 与新文件错位）
  // 即使 files 为空也清空——zip 中存在空 library 即意味"用户的资产库是空的"
  try { await root.removeEntry(LIBRARY_DIR, { recursive: true }) } catch { /* 不存在则忽略 */ }
  if (files.length === 0) return
  const lib = await root.getDirectoryHandle(LIBRARY_DIR, { create: true })
  for (const { path, data } of files) {
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) continue
    const filename = segments.pop()!
    let dir = lib
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg, { create: true })
    }
    try {
      const fh = await dir.getFileHandle(filename, { create: true })
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

  // 4. OPFS 画布图片
  onProgress?.('正在打包画布图片…')
  const images = await collectOPFSImages()
  const imgFolder = zip.folder('canvas-images')!
  for (const { name, blob } of images) imgFolder.file(name, blob)

  // 5. OPFS 资产库（整个目录树，含 _meta.json 与子文件夹）
  onProgress?.('正在打包资产库…')
  const libraryFiles = await collectLibraryTree()
  const libFolder = zip.folder('library')!
  for (const { path, blob } of libraryFiles) libFolder.file(path, blob)

  // 6. meta
  zip.file('meta.json', JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    stats: {
      workflows: idbData.workflows.length,
      canvasProjects: idbData.canvasProjects.length,
      tasks: idbData.tasks.length,
      chatMessages: idbData.chat_messages.length,
      images: images.length,
      libraryFiles: libraryFiles.length,
    },
  }, null, 2))

  // 7. 生成并下载
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

  // 4. OPFS 画布图片
  onProgress?.('正在恢复画布图片…')
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

  // 5. OPFS 资产库（整个目录树）
  onProgress?.('正在恢复资产库…')
  const libFolder = zip.folder('library')
  if (libFolder) {
    const pending: Promise<{ path: string; data: ArrayBuffer }>[] = []
    libFolder.forEach((relPath, zf) => {
      if (!zf.dir) {
        pending.push(zf.async('arraybuffer').then((data) => ({ path: relPath, data })))
      }
    })
    const libFiles = await Promise.all(pending)
    await restoreLibraryTree(libFiles)
  }
}
