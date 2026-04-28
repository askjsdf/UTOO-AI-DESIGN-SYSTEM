import type { AppSettings, WorkflowDefinition, WorkflowFolder, CanvasProject, TaskRecord, ChatMessage } from '../types'

const KEYS = {
  API_KEY: 'utoo_gemini_api_key',
  SETTINGS: 'utoo_settings',
  DIR_HANDLE: 'utoo_output_dir_handle',
  WF_DIR_HANDLE: 'utoo_workflow_dir_handle',
} as const

// ── localStorage ────────────────────────────────────────────────

export function loadSettings(): Partial<AppSettings> {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = loadSettings()
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...current, ...settings }))
  } catch (e) {
    console.error('[SettingsService] save failed:', e)
  }
}

export function loadApiKey(): string {
  return localStorage.getItem(KEYS.API_KEY) ?? ''
}

export function saveApiKey(key: string): void {
  localStorage.setItem(KEYS.API_KEY, key)
}

// ── IndexedDB ────────────────────────────────────────────────────

const DB_NAME = 'utoo-engine'
const DB_VERSION = 6          // v6: 新增 workflow_folders store
const STORE_NAME = 'handles'
const WORKFLOWS_STORE = 'workflows'
const WORKFLOW_FOLDERS_STORE = 'workflow_folders'
const CANVAS_PROJECTS_STORE = 'canvasProjects'
const TASKS_STORE = 'tasks'
const CHAT_STORE = 'chat_messages'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (event) => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
        db.createObjectStore(WORKFLOWS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(CANVAS_PROJECTS_STORE)) {
        db.createObjectStore(CANVAS_PROJECTS_STORE, { keyPath: 'id' })
      }
      // v4: 任务记录
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const store = db.createObjectStore(TASKS_STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
      // v5: AI 对话记录
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        const store = db.createObjectStore(CHAT_STORE, { keyPath: 'id' })
        store.createIndex('projectId', 'projectId')
        store.createIndex('createdAt', 'createdAt')
      }
      // v6: 工作流文件夹
      if (!db.objectStoreNames.contains(WORKFLOW_FOLDERS_STORE)) {
        db.createObjectStore(WORKFLOW_FOLDERS_STORE, { keyPath: 'id' })
      }
      void event
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── IndexedDB — 输出文件夹句柄 ───────────────────────────────────

export async function saveOutputDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, KEYS.DIR_HANDLE)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadOutputDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEYS.DIR_HANDLE)
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// ── IndexedDB — 工作流文件夹句柄 ─────────────────────────────────

export async function saveWorkflowDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, KEYS.WF_DIR_HANDLE)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadWorkflowDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEYS.WF_DIR_HANDLE)
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// ── IndexedDB — 工作流持久化 ─────────────────────────────────────

export async function saveWorkflow(workflow: WorkflowDefinition): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKFLOWS_STORE, 'readwrite')
    tx.objectStore(WORKFLOWS_STORE).put(workflow)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadAllWorkflows(): Promise<WorkflowDefinition[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKFLOWS_STORE, 'readonly')
      const req = tx.objectStore(WORKFLOWS_STORE).getAll()
      req.onsuccess = () => resolve((req.result as WorkflowDefinition[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteWorkflowFromDB(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKFLOWS_STORE, 'readwrite')
    tx.objectStore(WORKFLOWS_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── IndexedDB — 工作流文件夹 CRUD ────────────────────────────────

export async function saveFolder(folder: WorkflowFolder): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKFLOW_FOLDERS_STORE, 'readwrite')
    tx.objectStore(WORKFLOW_FOLDERS_STORE).put(folder)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadAllFolders(): Promise<WorkflowFolder[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WORKFLOW_FOLDERS_STORE, 'readonly')
      const req = tx.objectStore(WORKFLOW_FOLDERS_STORE).getAll()
      req.onsuccess = () => resolve((req.result as WorkflowFolder[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteFolderFromDB(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WORKFLOW_FOLDERS_STORE, 'readwrite')
    tx.objectStore(WORKFLOW_FOLDERS_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── IndexedDB — 方案画布项目持久化 ──────────────────────────────

export async function saveCanvasProject(project: CanvasProject): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CANVAS_PROJECTS_STORE, 'readwrite')
    tx.objectStore(CANVAS_PROJECTS_STORE).put(project)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadAllCanvasProjects(): Promise<CanvasProject[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CANVAS_PROJECTS_STORE, 'readonly')
      const req = tx.objectStore(CANVAS_PROJECTS_STORE).getAll()
      req.onsuccess = () => resolve((req.result as CanvasProject[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteCanvasProjectFromDB(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CANVAS_PROJECTS_STORE, 'readwrite')
    tx.objectStore(CANVAS_PROJECTS_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── IndexedDB — 任务记录持久化 ───────────────────────────────────

export async function saveTask(task: TaskRecord): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASKS_STORE, 'readwrite')
    tx.objectStore(TASKS_STORE).put(task)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadAllTasks(): Promise<TaskRecord[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TASKS_STORE, 'readonly')
      const req = tx.objectStore(TASKS_STORE).getAll()
      req.onsuccess = () => resolve((req.result as TaskRecord[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteTaskFromDB(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TASKS_STORE, 'readwrite')
    tx.objectStore(TASKS_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── IndexedDB — 对话记录持久化 ───────────────────────────────────

const CHAT_MAX = 200

export async function saveChatMessage(msg: ChatMessage): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readwrite')
    tx.objectStore(CHAT_STORE).put(msg)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadChatMessages(projectId: string): Promise<ChatMessage[]> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHAT_STORE, 'readonly')
      const index = tx.objectStore(CHAT_STORE).index('projectId')
      const req = index.getAll(projectId)
      req.onsuccess = () => {
        const msgs = (req.result as ChatMessage[]) ?? []
        msgs.sort((a, b) => a.createdAt - b.createdAt)
        resolve(msgs.slice(-CHAT_MAX))
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteChatMessagesByProject(projectId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_STORE, 'readwrite')
    const index = tx.objectStore(CHAT_STORE).index('projectId')
    const req = index.openCursor(projectId)
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) { cursor.delete(); cursor.continue() }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}


// ── 权限验证 ─────────────────────────────────────────────────────

export async function verifyDirHandlePermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = handle as any
    const perm = await h.queryPermission({ mode: 'readwrite' })
    if (perm === 'granted') return true
    const req = await h.requestPermission({ mode: 'readwrite' })
    return req === 'granted'
  } catch {
    return false
  }
}

/** 查询权限（不弹出请求，仅用于启动时判断是否已授权） */
export async function queryDirHandlePermission(
  handle: FileSystemDirectoryHandle
): Promise<'granted' | 'prompt' | 'denied'> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (handle as any).queryPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

/** 主动申请权限（必须在用户手势回调中调用） */
export async function requestDirHandlePermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (handle as any).requestPermission({ mode: 'readwrite' })
    return result === 'granted'
  } catch {
    return false
  }
}
