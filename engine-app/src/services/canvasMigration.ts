/**
 * canvasMigration — 将旧版 base64 图片数据从 tldraw IndexedDB 迁移到 OPFS
 *
 * 内存安全策略：
 *   Phase 1: openKeyCursor（只读键，不读值）→ 收集 {db, store, key} 三元组
 *            扫描期间零 base64 进内存
 *   Phase 2: 逐条独立事务 getRecord(key) → 写 OPFS → putRecord → db.close()
 *            每条处理后 setTimeout(50ms) 让 V8 执行 Major GC
 *            峰值内存 ≈ 单张图（~4MB），不累积
 *
 * 断点续跑：已迁移的记录 src 已更新为 /__local_asset__/...，
 *           Phase 1 扫描时 src 不再是 data:image 开头，自动跳过。
 */

import { saveImageDataUrl } from './imageStore'

const MIGRATION_FLAG_KEY  = 'utoo_canvas_opfs_migration_v1'
const MIGRATION_LOG_KEY   = 'utoo_migration_log'   // 崩溃后可在 localStorage 查看
const PROCESSING_KEY      = 'utoo_migration_processing'  // 当前正在处理的记录（crash checkpoint）
const BAD_KEYS_KEY        = 'utoo_migration_bad_keys'    // 已知会导致崩溃的记录，永久跳过

// 单条 data URL 最大允许长度（超过此大小的记录直接跳过以免 OOM）
// 30MB 字符串 ≈ 22MB 二进制图片，远超 AI 生成图的正常大小
const MAX_SRC_LENGTH = 30 * 1024 * 1024

// ── 公共接口 ──────────────────────────────────────────────────────────

export function isMigrationDone(): boolean {
  return localStorage.getItem(MIGRATION_FLAG_KEY) === 'done'
}

export function resetMigrationFlag(): void {
  localStorage.removeItem(MIGRATION_FLAG_KEY)
}

// ── Crash Checkpoint 系统 ─────────────────────────────────────────────
// 原理：处理每条记录前写入 checkpoint，成功后清除。
// 如果浏览器在处理时 crash（不会触发 catch），下次启动时发现 stale checkpoint，
// 将该记录加入永久黑名单，避免无限循环崩溃。

interface CheckpointRecord {
  dbName: string
  storeName: string
  key: string
}

function badKeyId(r: CheckpointRecord): string {
  return `${r.dbName}:${r.storeName}:${r.key}`
}

function loadBadKeys(): Set<string> {
  try {
    // 检测上次崩溃遗留的 checkpoint
    const stale = localStorage.getItem(PROCESSING_KEY)
    if (stale) {
      const record: CheckpointRecord = JSON.parse(stale)
      const existing: CheckpointRecord[] = JSON.parse(localStorage.getItem(BAD_KEYS_KEY) || '[]')
      if (!existing.some((r) => badKeyId(r) === badKeyId(record))) {
        existing.push(record)
        localStorage.setItem(BAD_KEYS_KEY, JSON.stringify(existing))
      }
      localStorage.removeItem(PROCESSING_KEY)
      log(`检测到上次崩溃，已将问题记录加入黑名单: ${badKeyId(record)}`)
    }
    const bad: CheckpointRecord[] = JSON.parse(localStorage.getItem(BAD_KEYS_KEY) || '[]')
    return new Set(bad.map(badKeyId))
  } catch {
    return new Set()
  }
}

function setCheckpoint(dbName: string, storeName: string, key: IDBValidKey) {
  localStorage.setItem(PROCESSING_KEY, JSON.stringify({ dbName, storeName, key: String(key) }))
}

function clearCheckpoint() {
  localStorage.removeItem(PROCESSING_KEY)
}

export interface MigrationResult {
  migrated: number
  skipped: number
  failed: number
}

export interface MigrationProgress {
  phase: 'scanning' | 'migrating'
  done: number
  total: number
  currentDb?: string
}

function log(msg: string) {
  // 写入 localStorage，崩溃后可查
  localStorage.setItem(MIGRATION_LOG_KEY, `[${new Date().toISOString()}] ${msg}`)
  console.log('[Migration]', msg)
}

export async function migrateCanvasImages(
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationResult> {
  if (isMigrationDone()) return { migrated: 0, skipped: 0, failed: 0 }

  let allDbs: IDBDatabaseInfo[]
  try {
    allDbs = await indexedDB.databases()
  } catch {
    markDone(); return { migrated: 0, skipped: 0, failed: 0 }
  }

  const canvasDbs = allDbs.filter((d) => d.name?.includes('utoo-canvas'))
  log(`找到 ${canvasDbs.length} 个画布数据库`)

  if (canvasDbs.length === 0) {
    markDone(); return { migrated: 0, skipped: 0, failed: 0 }
  }

  // ── Phase 1: 只用 openKeyCursor 收集 key —————————————————————————
  // openKeyCursor 只载入 key（~30B 字符串），完全不读 value（不载入 base64）
  interface MigrationTarget {
    dbName: string
    dbVersion: number
    storeName: string
    key: IDBValidKey
  }

  const targets: MigrationTarget[] = []

  onProgress?.({ phase: 'scanning', done: 0, total: canvasDbs.length })
  log('Phase 1: 扫描 key（不读值）…')

  for (let di = 0; di < canvasDbs.length; di++) {
    const dbInfo = canvasDbs[di]
    onProgress?.({ phase: 'scanning', done: di, total: canvasDbs.length, currentDb: dbInfo.name })
    log(`扫描 ${dbInfo.name}`)

    let db: IDBDatabase
    try {
      db = await openDb(dbInfo.name!, dbInfo.version!)
    } catch (e) {
      log(`打开 ${dbInfo.name} 失败: ${e}`)
      continue
    }

    for (const storeName of Array.from(db.objectStoreNames)) {
      try {
        const keys = await collectKeysOnly(db, storeName)
        log(`  store "${storeName}": ${keys.length} 条 key`)
        for (const key of keys) {
          targets.push({ dbName: dbInfo.name!, dbVersion: dbInfo.version!, storeName, key })
        }
      } catch (e) {
        log(`  store "${storeName}" 扫描失败: ${e}`)
      }
    }
    db.close()
  }

  log(`Phase 1 完成，共 ${targets.length} 条 key 待检查`)

  if (targets.length === 0) {
    markDone(); return { migrated: 0, skipped: 0, failed: 0 }
  }

  // ── Phase 2: 逐条独立事务处理，每条后 50ms 让 GC 跑 ────────────────
  let migrated = 0, skipped = 0, failed = 0

  log('Phase 2: 逐条读取并迁移…')
  onProgress?.({ phase: 'migrating', done: 0, total: targets.length })

  for (let i = 0; i < targets.length; i++) {
    const { dbName, dbVersion, storeName, key } = targets[i]

    if (i % 20 === 0) {
      log(`处理 ${i}/${targets.length}，已迁移 ${migrated}，已跳过 ${skipped}，失败 ${failed}`)
      onProgress?.({ phase: 'migrating', done: i, total: targets.length, currentDb: dbName })
    }

    let db: IDBDatabase
    try {
      db = await openDb(dbName, dbVersion)
    } catch {
      failed++; continue
    }

    try {
      // 单条读取 —— 只有这一条记录进内存
      const record = await getRecord(db, storeName, key)

      if (
        !record ||
        record.typeName !== 'asset' ||
        record.type !== 'image' ||
        typeof (record.props as any)?.src !== 'string' ||
        !(record.props as any).src.startsWith('data:image')
      ) {
        skipped++
        db.close()
        continue
      }

      const src = (record.props as any).src as string

      // 写 OPFS（base64 → blob → 磁盘）
      const localUrl = await saveImageDataUrl(record.id as string, src)

      // 更新 IndexedDB，src 替换为本地 URL（极小字符串）
      const updatedRecord = {
        ...record,
        props: { ...(record.props as object), src: localUrl },
      }
      await putRecord(db, storeName, updatedRecord)
      migrated++
    } catch (e) {
      log(`  第 ${i} 条处理失败: ${e}`)
      failed++
    } finally {
      db.close()
    }

    // 50ms 延迟：让 V8 有机会执行 Major GC，回收上一条 base64 的内存
    // IDB 事务已关闭，此处 await 不影响任何事务
    await new Promise((r) => setTimeout(r, 50))
  }

  markDone()
  log(`迁移完成：成功 ${migrated}，跳过 ${skipped}，失败 ${failed}`)
  onProgress?.({ phase: 'migrating', done: targets.length, total: targets.length })
  return { migrated, skipped, failed }
}

// ── 内部工具 ──────────────────────────────────────────────────────────

function markDone() {
  localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
}

/**
 * 用 openKeyCursor 只读 key，完全不读 value（不会把 base64 载入内存）
 */
function collectKeysOnly(db: IDBDatabase, storeName: string): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const keys: IDBValidKey[] = []

    // openKeyCursor vs openCursor:
    //   openCursor     → cursor.value = 完整记录（含 base64）
    //   openKeyCursor  → cursor.key   = 主键字符串，不载入 value
    const req = store.openKeyCursor()
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursor | null>).result
      if (!cursor) { resolve(keys); return }
      keys.push(cursor.key)
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
    tx.onerror = () => reject(tx.error)
  })
}

function openDb(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error(`DB blocked: ${name}`))
  })
}

function getRecord(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as Record<string, unknown> | undefined)
    req.onerror = () => reject(req.error)
  })
}

function putRecord(db: IDBDatabase, storeName: string, record: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    tx.onerror = () => reject(tx.error)
  })
}
