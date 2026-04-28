import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Node, Edge } from '@xyflow/react'
import type { WorkflowDefinition, WorkflowFolder, GeneratedImage, JobProgress, AppSettings, CanvasProject, TaskRecord, TaskNodeLog, SavedNode, SavedEdge, ChatMessage, TokenUsage } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import {
  loadApiKey, loadSettings, loadOutputDirHandle,
  saveWorkflow, loadAllWorkflows, deleteWorkflowFromDB,
  saveFolder, loadAllFolders, deleteFolderFromDB,
  saveWorkflowDirHandle, loadWorkflowDirHandle,
  queryDirHandlePermission, requestDirHandlePermission,
  saveCanvasProject, loadAllCanvasProjects, deleteCanvasProjectFromDB,
  saveTask, loadAllTasks, deleteTaskFromDB,
  saveChatMessage, loadChatMessages, deleteChatMessagesByProject,
} from '../services/SettingsService'
import { getLibraryRoot } from '../services/LibraryFileService'
import {
  saveWorkflowToFile, loadAllWorkflowFiles, deleteWorkflowFile,
  saveFoldersFile, loadFoldersFile, migrateWorkflowsToDir,
} from '../services/WorkflowFileService'
import { DAGEngine } from '../services/DAGEngine'
import { collectProjectAssetIds, deleteImageIfOrphaned } from '../services/imageStore'

// 模块级变量：避免引擎实例进入可序列化的 store 状态
let _queueEngine: DAGEngine | null = null

interface AppStore {
  // ── 工作流画布状态 ────────────────────────────────────────────
  rfNodes: Node[]
  rfEdges: Edge[]
  setRfNodes: (nodes: Node[]) => void
  setRfEdges: (edges: Edge[]) => void

  // ── 未保存状态 ────────────────────────────────────────────────
  isDirty: boolean
  markDirty: () => void
  markClean: () => void

  // ── 当前激活工作流 ────────────────────────────────────────────
  currentWorkflowId: string | null
  currentWorkflowName: string | null
  setCurrentWorkflow: (id: string | null, name: string | null) => void

  // ── 已保存工作流列表 ──────────────────────────────────────────
  workflows: WorkflowDefinition[]
  setWorkflows: (workflows: WorkflowDefinition[]) => void

  // 工作流 CRUD
  initWorkflows: () => Promise<void>
  createWorkflow: () => Promise<void>
  saveAsWorkflow: (name: string) => Promise<void>
  saveCurrentWorkflow: () => Promise<void>
  openWorkflow: (id: string) => void
  duplicateWorkflow: (id: string) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  renameWorkflow: (id: string, name: string) => Promise<void>
  reorderWorkflow: (draggedId: string, dropBeforeId: string | null, targetFolderId: string | undefined) => Promise<void>

  // ── 工作流文件夹 ──────────────────────────────────────────────
  folders: WorkflowFolder[]
  initFolders: () => Promise<void>
  createFolder: (name: string) => Promise<void>
  renameFolder: (id: string, name: string) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  toggleFolderCollapsed: (id: string) => void
  moveWorkflowToFolder: (workflowId: string, folderId?: string) => Promise<void>

  // ── 工作流文件存储 ────────────────────────────────────────────
  workflowDirHandle: FileSystemDirectoryHandle | null
  workflowDirName: string
  workflowDirConnected: boolean
  connectWorkflowDir: () => Promise<void>
  reconnectWorkflowDir: () => Promise<void>
  disconnectWorkflowDir: () => void

  // ── 当前运行状态 ──────────────────────────────────────────────
  isRunning: boolean
  activeJobId: string | null
  jobProgress: JobProgress | null
  setIsRunning: (v: boolean) => void
  setActiveJobId: (id: string | null) => void
  setJobProgress: (p: JobProgress | null) => void

  // ── 生成结果 ──────────────────────────────────────────────────
  generatedImages: GeneratedImage[]
  addGeneratedImages: (images: GeneratedImage[]) => void
  clearGeneratedImages: () => void

  // ── 设置 ──────────────────────────────────────────────────────
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void

  // ── UI 状态 ───────────────────────────────────────────────────
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  isProgressDrawerOpen: boolean
  setProgressDrawerOpen: (v: boolean) => void

  // ── 方案画布项目 ──────────────────────────────────────────────
  canvasProjects: CanvasProject[]
  currentCanvasProjectId: string | null
  initCanvasProjects: () => Promise<void>
  createCanvasProject: (name: string) => Promise<void>
  deleteCanvasProject: (id: string) => Promise<void>
  renameCanvasProject: (id: string, name: string) => Promise<void>
  setCurrentCanvasProject: (projectId: string) => void

  // ── 发送到画布队列 ────────────────────────────────────────────
  pendingCanvasImages: { projectId: string; dataUrls: string[] }[]
  addPendingCanvasImages: (projectId: string, dataUrls: string[]) => void
  consumePendingCanvasImages: (projectId: string) => string[]

  // ── 占位符替换队列 ────────────────────────────────────────────
  pendingCanvasReplacements: { placeholderShapeId: string; dataUrls: string[]; projectId: string }[]
  addPendingCanvasReplacement: (projectId: string, placeholderShapeId: string, dataUrls: string[]) => void
  consumePendingCanvasReplacements: (projectId: string) => { placeholderShapeId: string; dataUrls: string[] }[]

  // ── 孤立占位符 ────────────────────────────────────────────────
  orphanedPlaceholders: { projectId: string; shapeId: string }[]
  addOrphanedPlaceholder: (projectId: string, shapeId: string) => void
  consumeOrphanedPlaceholders: (projectId: string) => string[]

  // ── 任务队列 ──────────────────────────────────────────────────
  tasks: TaskRecord[]
  isTaskRunning: boolean
  currentTaskId: string | null

  initTasks: () => Promise<void>
  enqueueTask: (params: {
    workflowId: string
    workflowName: string
    source: 'canvas' | 'workflow'
    sourceCanvasProjectId?: string
    canvasPlaceholderId?: string
    snapshotNodes: SavedNode[]
    snapshotEdges: SavedEdge[]
    inputPreviews: string[]
  }) => Promise<void>
  cancelCurrentTask: () => void
  retryTask: (taskId: string) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  clearFinishedTasks: () => Promise<void>
  _runNextTask: () => Promise<void>
  _patchTask: (id: string, patch: Partial<TaskRecord>) => void
  _patchTaskNodeLog: (taskId: string, nodeId: string, patch: Partial<TaskNodeLog>) => void

  // ── AI 对话记录 ───────────────────────────────────────────────
  chatMessages: ChatMessage[]
  loadProjectChat: (projectId: string) => Promise<void>
  addChatMessage: (msg: ChatMessage) => Promise<void>
  clearProjectChat: (projectId: string) => Promise<void>

  // ── 对话生图 token 用量 ───────────────────────────────────────
  chatTokenUsages: TokenUsage[]
  addChatTokenUsage: (usage: TokenUsage) => void

  // ── 画布附件请求 ──────────────────────────────────────────────
  canvasAttachRequest: string[] | null
  setCanvasAttachRequest: (b64s: string[] | null) => void

  // ── 视觉资产库（OPFS，无需用户授权） ─────────────────────────
  libraryRoot: FileSystemDirectoryHandle | null
  libraryReady: boolean
  libraryPickerOpen: boolean
  setLibraryPickerOpen: (v: boolean) => void
  libraryPendingShapeIds: string[]
  setLibraryPendingShapeIds: (ids: string[]) => void
  initLibrary: () => Promise<void>

  // ── 初始化 ────────────────────────────────────────────────────
  initSettings: () => Promise<void>
}

// 保存工作流前清洗 imageInput 节点的图片数据
function stripNodeImageData(nodes: { id: string; type: string; position: { x: number; y: number }; width?: number; height?: number; data: Record<string, unknown> }[]) {
  return nodes.map((n) => {
    if (n.type !== 'imageInput') return n
    return { ...n, data: { ...n.data, images: [], previews: [], fileNames: [] } }
  })
}

// 从 localStorage 读取初始设置
const storedSettings = loadSettings()
const initialSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  geminiApiKey: loadApiKey(),
  outputDirName: (storedSettings.outputDirName as string) ?? '',
  workerConcurrency: (storedSettings.workerConcurrency as number) ?? DEFAULT_SETTINGS.workerConcurrency,
  apiCallIntervalMs: (storedSettings.apiCallIntervalMs as number) ?? DEFAULT_SETTINGS.apiCallIntervalMs,
  outputFormat: (storedSettings.outputFormat as 'png' | 'webp') ?? DEFAULT_SETTINGS.outputFormat,
}

// 工作流写入辅助（同时写文件系统 + IDB）
async function persistWorkflow(
  workflow: WorkflowDefinition,
  dirHandle: FileSystemDirectoryHandle | null,
  connected: boolean
) {
  if (connected && dirHandle) {
    try { await saveWorkflowToFile(dirHandle, workflow) } catch { /* fallback to IDB only */ }
  }
  await saveWorkflow(workflow)
}

// 文件夹写入辅助
async function persistFolders(
  folders: WorkflowFolder[],
  dirHandle: FileSystemDirectoryHandle | null,
  connected: boolean
) {
  if (connected && dirHandle) {
    try { await saveFoldersFile(dirHandle, folders) } catch { /* fallback to IDB only */ }
  }
  for (const f of folders) {
    await saveFolder(f)
  }
}

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    // ── 工作流画布 ────────────────────────────────────────────────
    rfNodes: [],
    rfEdges: [],
    setRfNodes: (nodes) => set({ rfNodes: nodes }),
    setRfEdges: (edges) => set({ rfEdges: edges }),

    // ── 未保存状态 ────────────────────────────────────────────────
    isDirty: false,
    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),

    // ── 当前激活工作流 ────────────────────────────────────────────
    currentWorkflowId: null,
    currentWorkflowName: null,
    setCurrentWorkflow: (id, name) => set({ currentWorkflowId: id, currentWorkflowName: name }),

    // ── 工作流列表 ────────────────────────────────────────────────
    workflows: [],
    setWorkflows: (workflows) => set({ workflows }),

    initWorkflows: async () => {
      const all = await loadAllWorkflows()
      all.sort((a, b) => b.updatedAt - a.updatedAt)
      set({ workflows: all })
    },

    // 新建：直接在库里创建并打开，不清空画布（切换工作流）
    createWorkflow: async () => {
      const { workflows, workflowDirHandle, workflowDirConnected } = get()
      const names = new Set(workflows.map((w) => w.name))
      let n = 1
      while (names.has(`新工作流 ${n}`)) n++
      const name = `新工作流 ${n}`
      const now = Date.now()
      const wf: WorkflowDefinition = {
        id: crypto.randomUUID(),
        name,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        nodes: [],
        edges: [],
      }
      await persistWorkflow(wf, workflowDirHandle, workflowDirConnected)
      set((s) => ({
        workflows: [wf, ...s.workflows],
        rfNodes: [],
        rfEdges: [],
        currentWorkflowId: wf.id,
        currentWorkflowName: wf.name,
        isDirty: false,
      }))
    },

    saveAsWorkflow: async (name: string) => {
      const { rfNodes, rfEdges, workflowDirHandle, workflowDirConnected } = get()
      const now = Date.now()
      const workflow: WorkflowDefinition = {
        id: crypto.randomUUID(),
        name,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        nodes: stripNodeImageData(rfNodes.map((n) => ({
          id: n.id, type: n.type ?? '', position: n.position,
          width: n.width, height: n.height,
          data: n.data as Record<string, unknown>,
        }))),
        edges: rfEdges.map((e) => ({
          id: e.id, source: e.source, target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
        })),
      }
      await persistWorkflow(workflow, workflowDirHandle, workflowDirConnected)
      set((s) => ({
        workflows: [workflow, ...s.workflows.filter((w) => w.id !== workflow.id)],
        currentWorkflowId: workflow.id,
        currentWorkflowName: workflow.name,
        isDirty: false,
      }))
    },

    saveCurrentWorkflow: async () => {
      const { rfNodes, rfEdges, currentWorkflowId, currentWorkflowName, workflows, workflowDirHandle, workflowDirConnected } = get()
      if (!currentWorkflowId || !currentWorkflowName) return
      const existing = workflows.find((w) => w.id === currentWorkflowId)
      const now = Date.now()
      const workflow: WorkflowDefinition = {
        id: currentWorkflowId,
        name: currentWorkflowName,
        folderId: existing?.folderId,
        order: existing?.order,          // 保留拖拽排序位置
        status: existing?.status ?? 'draft',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        nodes: stripNodeImageData(rfNodes.map((n) => ({
          id: n.id, type: n.type ?? '', position: n.position,
          width: n.width, height: n.height,
          data: n.data as Record<string, unknown>,
        }))),
        edges: rfEdges.map((e) => ({
          id: e.id, source: e.source, target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
        })),
      }
      await persistWorkflow(workflow, workflowDirHandle, workflowDirConnected)
      // 原地更新，保留拖拽排序位置
      set((s) => ({
        workflows: s.workflows.map((w) => w.id === workflow.id ? workflow : w),
        isDirty: false,
      }))
    },

    openWorkflow: (id: string) => {
      const { workflows } = get()
      const wf = workflows.find((w) => w.id === id)
      if (!wf) return
      set({
        rfNodes: wf.nodes.map((n) => ({
          id: n.id, type: n.type, position: n.position,
          width: n.width, height: n.height, data: n.data,
        })),
        rfEdges: wf.edges.map((e) => ({
          id: e.id, source: e.source, target: e.target,
          sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
        })),
        currentWorkflowId: wf.id,
        currentWorkflowName: wf.name,
        isDirty: false,
      })
    },

    duplicateWorkflow: async (id: string) => {
      const { workflows, workflowDirHandle, workflowDirConnected } = get()
      const original = workflows.find((w) => w.id === id)
      if (!original) return
      const now = Date.now()
      const copy: WorkflowDefinition = {
        ...original,
        id: crypto.randomUUID(),
        name: `${original.name} 副本`,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      }
      await persistWorkflow(copy, workflowDirHandle, workflowDirConnected)
      set((s) => ({ workflows: [copy, ...s.workflows] }))
    },

    deleteWorkflow: async (id: string) => {
      const { workflowDirHandle, workflowDirConnected } = get()
      if (workflowDirConnected && workflowDirHandle) {
        try { await deleteWorkflowFile(workflowDirHandle, id) } catch { /* ok */ }
      }
      await deleteWorkflowFromDB(id)
      set((s) => {
        const next = s.workflows.filter((w) => w.id !== id)
        const wasActive = s.currentWorkflowId === id
        // 删除激活工作流时，切换到列表中第一个（如有）
        const nextActive = wasActive ? (next[0] ?? null) : null
        if (wasActive && nextActive) {
          return {
            workflows: next,
            currentWorkflowId: nextActive.id,
            currentWorkflowName: nextActive.name,
            rfNodes: nextActive.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, width: n.width, height: n.height, data: n.data })),
            rfEdges: nextActive.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
            isDirty: false,
          }
        }
        return {
          workflows: next,
          ...(wasActive ? { currentWorkflowId: null, currentWorkflowName: null, rfNodes: [], rfEdges: [], isDirty: false } : {}),
        }
      })
    },

    renameWorkflow: async (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const { workflows, workflowDirHandle, workflowDirConnected } = get()
      const wf = workflows.find((w) => w.id === id)
      if (!wf) return
      const updated: WorkflowDefinition = { ...wf, name: trimmed, updatedAt: Date.now() }
      await persistWorkflow(updated, workflowDirHandle, workflowDirConnected)
      set((s) => ({
        workflows: s.workflows.map((w) => w.id === id ? updated : w),
        ...(s.currentWorkflowId === id ? { currentWorkflowName: trimmed } : {}),
      }))
    },

    reorderWorkflow: async (draggedId: string, dropBeforeId: string | null, targetFolderId: string | undefined) => {
      const { workflows, workflowDirHandle, workflowDirConnected } = get()
      const dragged = workflows.find((w) => w.id === draggedId)
      if (!dragged) return

      // 按 order 排列目标分组（剔除拖拽项）
      const sortGroup = (folderId: string | undefined) =>
        workflows
          .filter((w) => w.id !== draggedId && w.folderId === folderId)
          .sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order
            if (a.order !== undefined) return -1
            if (b.order !== undefined) return 1
            return b.updatedAt - a.updatedAt
          })

      const targetList = sortGroup(targetFolderId)

      // 找插入位置
      const insertIdx = dropBeforeId
        ? Math.max(0, targetList.findIndex((w) => w.id === dropBeforeId))
        : targetList.length
      targetList.splice(insertIdx, 0, dragged)

      // 为目标分组重新分配 order（步长 1000，方便后续插入）
      const updatesMap = new Map<string, Partial<WorkflowDefinition>>()
      targetList.forEach((wf, i) => {
        const newOrder = i * 1000
        const newFolderId = targetFolderId
        if (wf.order !== newOrder || wf.folderId !== newFolderId) {
          updatesMap.set(wf.id, { order: newOrder, folderId: newFolderId })
        }
      })

      // 如果跨分组移动，源分组也重新分配 order
      if (dragged.folderId !== targetFolderId) {
        const sourceList = sortGroup(dragged.folderId)
        sourceList.forEach((wf, i) => {
          const newOrder = i * 1000
          if (wf.order !== newOrder) updatesMap.set(wf.id, { ...updatesMap.get(wf.id), order: newOrder })
        })
      }

      if (updatesMap.size === 0) return

      const updatedWorkflows = workflows.map((w) => {
        const patch = updatesMap.get(w.id)
        return patch ? { ...w, ...patch, updatedAt: Date.now() } : w
      })

      // 只写发生变化的工作流
      for (const id of updatesMap.keys()) {
        const wf = updatedWorkflows.find((w) => w.id === id)!
        await persistWorkflow(wf, workflowDirHandle, workflowDirConnected)
      }

      set({ workflows: updatedWorkflows })
    },

    // ── 工作流文件夹 ──────────────────────────────────────────────
    folders: [],

    initFolders: async () => {
      const all = await loadAllFolders()
      all.sort((a, b) => a.createdAt - b.createdAt)
      set({ folders: all })
    },

    createFolder: async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const { workflowDirHandle, workflowDirConnected } = get()
      const folder: WorkflowFolder = {
        id: crypto.randomUUID(),
        name: trimmed,
        createdAt: Date.now(),
        collapsed: false,
      }
      await saveFolder(folder)
      const nextFolders = [...get().folders, folder]
      if (workflowDirConnected && workflowDirHandle) {
        try { await saveFoldersFile(workflowDirHandle, nextFolders) } catch { /* ok */ }
      }
      set({ folders: nextFolders })
    },

    renameFolder: async (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const { folders, workflowDirHandle, workflowDirConnected } = get()
      const folder = folders.find((f) => f.id === id)
      if (!folder) return
      const updated: WorkflowFolder = { ...folder, name: trimmed }
      await saveFolder(updated)
      const nextFolders = folders.map((f) => f.id === id ? updated : f)
      if (workflowDirConnected && workflowDirHandle) {
        try { await saveFoldersFile(workflowDirHandle, nextFolders) } catch { /* ok */ }
      }
      set({ folders: nextFolders })
    },

    deleteFolder: async (id: string) => {
      const { folders, workflows, workflowDirHandle, workflowDirConnected } = get()
      // 将该文件夹下的工作流全部移出（置为未分组）
      const affected = workflows.filter((w) => w.folderId === id)
      for (const wf of affected) {
        const updated: WorkflowDefinition = { ...wf, folderId: undefined, updatedAt: Date.now() }
        await persistWorkflow(updated, workflowDirHandle, workflowDirConnected)
      }
      await deleteFolderFromDB(id)
      const nextFolders = folders.filter((f) => f.id !== id)
      if (workflowDirConnected && workflowDirHandle) {
        try { await saveFoldersFile(workflowDirHandle, nextFolders) } catch { /* ok */ }
      }
      set((s) => ({
        folders: nextFolders,
        workflows: s.workflows.map((w) => w.folderId === id ? { ...w, folderId: undefined } : w),
      }))
    },

    toggleFolderCollapsed: (id: string) => {
      set((s) => ({
        folders: s.folders.map((f) => f.id === id ? { ...f, collapsed: !f.collapsed } : f),
      }))
      // 折叠状态只存内存，不写文件（非关键数据）
    },

    moveWorkflowToFolder: async (workflowId: string, folderId?: string) => {
      const { workflows, workflowDirHandle, workflowDirConnected } = get()
      const wf = workflows.find((w) => w.id === workflowId)
      if (!wf) return
      const updated: WorkflowDefinition = { ...wf, folderId, updatedAt: Date.now() }
      await persistWorkflow(updated, workflowDirHandle, workflowDirConnected)
      set((s) => ({
        workflows: s.workflows.map((w) => w.id === workflowId ? updated : w),
      }))
    },

    // ── 工作流文件存储 ────────────────────────────────────────────
    workflowDirHandle: null,
    workflowDirName: '',
    workflowDirConnected: false,

    connectWorkflowDir: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dir: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      await saveWorkflowDirHandle(dir)

      // 迁移现有工作流到新文件夹
      const { workflows, folders } = get()
      await migrateWorkflowsToDir(dir, workflows)
      await saveFoldersFile(dir, folders)

      // 从文件夹重新加载（可能文件夹里已有其他工作流）
      const fileWorkflows = await loadAllWorkflowFiles(dir)
      const fileFolders = await loadFoldersFile(dir)

      // 合并：以文件夹为准，IDB 里有但文件夹没有的补充
      const fileIds = new Set(fileWorkflows.map((w) => w.id))
      const merged = [
        ...fileWorkflows,
        ...workflows.filter((w) => !fileIds.has(w.id)),
      ].sort((a, b) => b.updatedAt - a.updatedAt)

      // 同步回 IDB
      for (const wf of merged) await saveWorkflow(wf)
      for (const f of fileFolders) await saveFolder(f)

      set({
        workflowDirHandle: dir,
        workflowDirName: dir.name,
        workflowDirConnected: true,
        workflows: merged,
        folders: fileFolders.length > 0 ? fileFolders : get().folders,
      })
    },

    reconnectWorkflowDir: async () => {
      const { workflowDirHandle } = get()
      if (!workflowDirHandle) return
      const granted = await requestDirHandlePermission(workflowDirHandle)
      if (!granted) return
      // 从文件夹重新加载
      const fileWorkflows = await loadAllWorkflowFiles(workflowDirHandle)
      const fileFolders = await loadFoldersFile(workflowDirHandle)
      fileWorkflows.sort((a, b) => b.updatedAt - a.updatedAt)
      // 同步回 IDB
      for (const wf of fileWorkflows) await saveWorkflow(wf)
      for (const f of fileFolders) await saveFolder(f)
      set({
        workflowDirConnected: true,
        workflows: fileWorkflows.length > 0 ? fileWorkflows : get().workflows,
        folders: fileFolders.length > 0 ? fileFolders : get().folders,
      })
    },

    disconnectWorkflowDir: () => {
      set({ workflowDirHandle: null, workflowDirName: '', workflowDirConnected: false })
    },

    // ── 视觉资产库（OPFS） ────────────────────────────────────────
    libraryRoot: null,
    libraryReady: false,
    libraryPickerOpen: false,
    setLibraryPickerOpen: (v) => set({ libraryPickerOpen: v }),
    libraryPendingShapeIds: [],
    setLibraryPendingShapeIds: (ids) => set({ libraryPendingShapeIds: ids }),

    initLibrary: async () => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OPFS 初始化超时')), 5000)
      )
      try {
        const root = await Promise.race([getLibraryRoot(), timeout])
        set({ libraryRoot: root, libraryReady: true })
      } catch (e) {
        console.error('[Library] OPFS 初始化失败:', e)
        set({ libraryReady: true })
      }
    },

    // 运行状态
    isRunning: false,
    activeJobId: null,
    jobProgress: null,
    setIsRunning: (v) => set({ isRunning: v }),
    setActiveJobId: (id) => set({ activeJobId: id }),
    setJobProgress: (p) => set({ jobProgress: p }),

    // 生成结果
    generatedImages: [],
    addGeneratedImages: (images) =>
      set((s) => ({ generatedImages: [...s.generatedImages, ...images] })),
    clearGeneratedImages: () => set({ generatedImages: [] }),

    // 设置
    settings: initialSettings,
    setSettings: (s) => set((prev) => ({ settings: { ...prev.settings, ...s } })),

    // UI 状态
    selectedNodeId: null,
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),
    isProgressDrawerOpen: false,
    setProgressDrawerOpen: (v) => set({ isProgressDrawerOpen: v }),

    // ── 初始化 ────────────────────────────────────────────────────
    initSettings: async () => {
      // 1. 输出文件夹句柄
      const handle = await loadOutputDirHandle()
      if (handle) {
        set((prev) => ({ settings: { ...prev.settings, outputDirHandle: handle } }))
      }

      // 2. 工作流文件夹句柄
      const wfHandle = await loadWorkflowDirHandle()
      if (wfHandle) {
        set({ workflowDirHandle: wfHandle, workflowDirName: wfHandle.name })
        const perm = await queryDirHandlePermission(wfHandle)
        if (perm === 'granted') {
          // 从文件夹加载（文件系统为准）
          const fileWorkflows = await loadAllWorkflowFiles(wfHandle)
          const fileFolders = await loadFoldersFile(wfHandle)
          if (fileWorkflows.length > 0) {
            fileWorkflows.sort((a, b) => b.updatedAt - a.updatedAt)
            for (const wf of fileWorkflows) await saveWorkflow(wf)
            for (const f of fileFolders) await saveFolder(f)
            set({
              workflowDirConnected: true,
              workflows: fileWorkflows,
              folders: fileFolders,
            })
            return
          }
          // 文件夹是空的，从 IDB 加载并迁移
          set({ workflowDirConnected: true })
        }
        // perm === 'prompt'/'denied'：文件系统不可用，从 IDB fallback
        // workflowDirConnected 保持 false，UI 显示"需要重新授权"
      }

      // 3. Fallback：从 IDB 加载
      await get().initWorkflows()
      await get().initFolders()

    },

    // ── 方案画布项目 ──────────────────────────────────────────────
    canvasProjects: [],
    currentCanvasProjectId: null,

    initCanvasProjects: async () => {
      const all = await loadAllCanvasProjects()
      all.sort((a, b) => b.updatedAt - a.updatedAt)
      if (all.length === 0) {
        await get().createCanvasProject('默认项目')
        return
      }
      set({ canvasProjects: all, currentCanvasProjectId: all[0].id })
      await get().loadProjectChat(all[0].id)
    },

    createCanvasProject: async (name: string) => {
      const now = Date.now()
      const project: CanvasProject = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now }
      await saveCanvasProject(project)
      set((s) => ({
        canvasProjects: [project, ...s.canvasProjects],
        currentCanvasProjectId: project.id,
      }))
    },

    deleteCanvasProject: async (id: string) => {
      const assetIds = await collectProjectAssetIds(id).catch(() => [] as string[])
      try {
        await new Promise<void>((res, rej) => {
          const req = indexedDB.deleteDatabase(`TLDRAW_DOCUMENT_v2utoo-canvas-${id}`)
          req.onsuccess = () => res()
          req.onerror = () => rej(req.error)
        })
      } catch { /* ok */ }
      await deleteCanvasProjectFromDB(id)
      await deleteChatMessagesByProject(id)
      ;(async () => {
        for (const assetId of assetIds) {
          await deleteImageIfOrphaned(assetId, id).catch(() => {})
        }
      })()
      set((s) => {
        const next = s.canvasProjects.filter((p) => p.id !== id)
        const wasActive = s.currentCanvasProjectId === id
        return {
          canvasProjects: next,
          ...(wasActive ? { currentCanvasProjectId: next[0]?.id ?? null, chatMessages: [] } : {}),
        }
      })
      const nextProjectId = get().currentCanvasProjectId
      if (nextProjectId) get().loadProjectChat(nextProjectId)
    },

    renameCanvasProject: async (id: string, name: string) => {
      const { canvasProjects } = get()
      const project = canvasProjects.find((p) => p.id === id)
      if (!project) return
      const updated = { ...project, name, updatedAt: Date.now() }
      await saveCanvasProject(updated)
      set((s) => ({ canvasProjects: s.canvasProjects.map((p) => p.id === id ? updated : p) }))
    },

    setCurrentCanvasProject: (projectId: string) => {
      set({ currentCanvasProjectId: projectId })
      get().loadProjectChat(projectId)
    },

    // ── 发送到画布队列 ────────────────────────────────────────────
    pendingCanvasImages: [],
    addPendingCanvasImages: (projectId, dataUrls) =>
      set((s) => ({ pendingCanvasImages: [...s.pendingCanvasImages, { projectId, dataUrls }] })),
    consumePendingCanvasImages: (projectId) => {
      const { pendingCanvasImages } = get()
      const matching = pendingCanvasImages.filter((p) => p.projectId === projectId)
      if (matching.length === 0) return []
      const allUrls = matching.flatMap((p) => p.dataUrls)
      set({ pendingCanvasImages: pendingCanvasImages.filter((p) => p.projectId !== projectId) })
      return allUrls
    },

    // ── 占位符替换队列 ────────────────────────────────────────────
    pendingCanvasReplacements: [],
    addPendingCanvasReplacement: (projectId, placeholderShapeId, dataUrls) =>
      set((s) => {
        const existingIdx = s.pendingCanvasReplacements.findIndex(
          (p) => p.projectId === projectId && p.placeholderShapeId === placeholderShapeId
        )
        if (existingIdx >= 0) {
          const updated = [...s.pendingCanvasReplacements]
          updated[existingIdx] = { ...updated[existingIdx], dataUrls: [...updated[existingIdx].dataUrls, ...dataUrls] }
          return { pendingCanvasReplacements: updated }
        }
        return { pendingCanvasReplacements: [...s.pendingCanvasReplacements, { projectId, placeholderShapeId, dataUrls }] }
      }),
    consumePendingCanvasReplacements: (projectId) => {
      const { pendingCanvasReplacements } = get()
      const matching = pendingCanvasReplacements.filter((p) => p.projectId === projectId)
      if (matching.length === 0) return []
      set({ pendingCanvasReplacements: pendingCanvasReplacements.filter((p) => p.projectId !== projectId) })
      return matching.map(({ placeholderShapeId, dataUrls }) => ({ placeholderShapeId, dataUrls }))
    },

    // ── 孤立占位符 ────────────────────────────────────────────────
    orphanedPlaceholders: [],
    addOrphanedPlaceholder: (projectId, shapeId) =>
      set((s) => ({ orphanedPlaceholders: [...s.orphanedPlaceholders, { projectId, shapeId }] })),
    consumeOrphanedPlaceholders: (projectId) => {
      const { orphanedPlaceholders } = get()
      const matching = orphanedPlaceholders.filter((p) => p.projectId === projectId)
      if (matching.length === 0) return []
      set({ orphanedPlaceholders: orphanedPlaceholders.filter((p) => p.projectId !== projectId) })
      return matching.map((p) => p.shapeId)
    },

    // ── 任务队列 ──────────────────────────────────────────────────
    tasks: [],
    isTaskRunning: false,
    currentTaskId: null,

    initTasks: async () => {
      const all = await loadAllTasks()
      all.sort((a, b) => b.createdAt - a.createdAt)
      const fixed = await Promise.all(
        all.map(async (t) => {
          if (t.status === 'running') {
            const updated = { ...t, status: 'interrupted' as const }
            await saveTask(updated)
            return updated
          }
          return t
        })
      )
      set({ tasks: fixed })
    },

    enqueueTask: async (params) => {
      const { workflowId, workflowName, source, sourceCanvasProjectId, canvasPlaceholderId, snapshotNodes, snapshotEdges, inputPreviews } = params
      const nodeLog: Record<string, TaskNodeLog> = {}
      for (const n of snapshotNodes) {
        nodeLog[n.id] = { label: (n.data as Record<string, unknown>).label as string ?? n.type, status: 'pending' }
      }
      const task: TaskRecord = {
        id: crypto.randomUUID(),
        workflowId, workflowName, source,
        ...(sourceCanvasProjectId ? { sourceCanvasProjectId } : {}),
        ...(canvasPlaceholderId ? { canvasPlaceholderId } : {}),
        status: 'queued',
        createdAt: Date.now(),
        inputPreviews: inputPreviews.slice(0, 4),
        outputPreviews: [],
        nodeLog,
        snapshotNodes,
        snapshotEdges,
      }
      await saveTask(task)
      set((s) => {
        const all = [task, ...s.tasks]
        const MAX = 30
        if (all.length > MAX) {
          const removable = all
            .filter((t) => ['completed', 'error', 'interrupted'].includes(t.status))
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(0, all.length - MAX)
          removable.forEach((t) => deleteTaskFromDB(t.id))
          return { tasks: all.filter((t) => !removable.find((r) => r.id === t.id)) }
        }
        return { tasks: all }
      })
      get()._runNextTask()
    },

    cancelCurrentTask: () => { _queueEngine?.cancel() },

    retryTask: async (taskId) => {
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task) return
      await get().enqueueTask({
        workflowId: task.workflowId,
        workflowName: task.workflowName,
        source: task.source,
        sourceCanvasProjectId: task.sourceCanvasProjectId,
        snapshotNodes: task.snapshotNodes,
        snapshotEdges: task.snapshotEdges,
        inputPreviews: task.inputPreviews,
      })
    },

    deleteTask: async (taskId) => {
      await deleteTaskFromDB(taskId)
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
    },

    clearFinishedTasks: async () => {
      const { tasks } = get()
      const toRemove = tasks.filter((t) => ['completed', 'error', 'interrupted'].includes(t.status))
      await Promise.all(toRemove.map((t) => deleteTaskFromDB(t.id)))
      set((s) => ({ tasks: s.tasks.filter((t) => !toRemove.find((r) => r.id === t.id)) }))
    },

    _patchTask: (id, patch) => {
      set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patch } : t) }))
    },

    _patchTaskNodeLog: (taskId, nodeId, patch) => {
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? { ...t, nodeLog: { ...t.nodeLog, [nodeId]: { ...t.nodeLog[nodeId], ...patch } } }
            : t
        ),
      }))
    },

    // ── AI 对话记录 ───────────────────────────────────────────────
    chatMessages: [],

    loadProjectChat: async (projectId: string) => {
      const msgs = await loadChatMessages(projectId)
      set({ chatMessages: msgs })
    },

    addChatMessage: async (msg: ChatMessage) => {
      set((s) => ({ chatMessages: [...s.chatMessages, msg] }))
      await saveChatMessage(msg)
    },

    clearProjectChat: async (projectId: string) => {
      await deleteChatMessagesByProject(projectId)
      set({ chatMessages: [] })
    },

    chatTokenUsages: (() => {
      try {
        const all = JSON.parse(localStorage.getItem('utoo_chat_token_usages') || '[]') as TokenUsage[]
        const filtered = all.filter((u) => !!u.timestamp)
        if (filtered.length !== all.length) {
          localStorage.setItem('utoo_chat_token_usages', JSON.stringify(filtered))
        }
        return filtered
      } catch { return [] }
    })(),

    addChatTokenUsage: (usage) => {
      set((s) => {
        const next = [...s.chatTokenUsages, { ...usage, timestamp: Date.now() }]
        try { localStorage.setItem('utoo_chat_token_usages', JSON.stringify(next)) } catch { /* ok */ }
        return { chatTokenUsages: next }
      })
    },

    canvasAttachRequest: null,
    setCanvasAttachRequest: (b64s) => set({ canvasAttachRequest: b64s }),

    _runNextTask: async () => {
      if (get().isTaskRunning) return
      const task = get().tasks.find((t) => t.status === 'queued')
      if (!task) return

      const startedAt = Date.now()
      const updatedTask: TaskRecord = { ...task, status: 'running', startedAt }
      set({ isTaskRunning: true, isRunning: true, currentTaskId: task.id })
      get()._patchTask(task.id, { status: 'running', startedAt })
      saveTask(updatedTask)

      const startTimes = new Map<string, number>()
      const outputPreviews: string[] = []
      const allTokenUsages: TokenUsage[] = []

      const patchNodeData = (nodeId: string, patch: object) => {
        const p = patch as Record<string, unknown>
        if (get().currentWorkflowId === task.workflowId) {
          set((s) => ({
            rfNodes: s.rfNodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
            ),
          }))
        }
        const previews = (p._outputPreviews ?? p.savedPreviews) as string[] | undefined
        if (previews?.length) {
          outputPreviews.push(...previews)
          get()._patchTask(task.id, { outputPreviews: [...outputPreviews] })
        }
        const tokenUsages = p._tokenUsages as TokenUsage[] | undefined
        if (tokenUsages?.length) allTokenUsages.push(...tokenUsages)
      }

      const onNodeStatus = (nodeId: string, status: 'running' | 'completed' | 'error') => {
        const now = Date.now()
        if (status === 'running') {
          startTimes.set(nodeId, now)
          get()._patchTaskNodeLog(task.id, nodeId, { status: 'running', startedAt: now })
        } else {
          const dur = now - (startTimes.get(nodeId) ?? now)
          get()._patchTaskNodeLog(task.id, nodeId, { status, duration: dur })
        }
      }

      const engine = new DAGEngine()
      _queueEngine = engine

      try {
        await engine.run(
          task.snapshotNodes as any,
          task.snapshotEdges as any,
          get().settings.geminiApiKey,
          patchNodeData,
          onNodeStatus,
          task.sourceCanvasProjectId,
          task.canvasPlaceholderId,
        )
        const completedAt = Date.now()
        const strippedNodes = task.snapshotNodes.map((n) => ({
          ...n, data: { ...n.data, images: undefined, previews: undefined, fileNames: undefined },
        }))
        const estimatedCostUsd = allTokenUsages.reduce((sum, u) => (
          sum + u.promptTokens * 0.50 / 1_000_000 + u.outputTokens * 60.00 / 1_000_000
        ), 0)
        const final = {
          ...get().tasks.find((t) => t.id === task.id)!,
          status: 'completed' as const, completedAt,
          snapshotNodes: strippedNodes,
          outputPreviews: outputPreviews.slice(0, 4),
          tokenUsages: allTokenUsages,
          estimatedCostUsd,
        }
        get()._patchTask(task.id, { status: 'completed', completedAt, snapshotNodes: strippedNodes, tokenUsages: allTokenUsages, estimatedCostUsd })
        saveTask(final)
      } catch (e) {
        const completedAt = Date.now()
        const errorMessage = (e as Error).message
        const strippedNodes = task.snapshotNodes.map((n) => ({
          ...n, data: { ...n.data, images: undefined, previews: undefined, fileNames: undefined },
        }))
        const final = {
          ...get().tasks.find((t) => t.id === task.id)!,
          status: 'error' as const, completedAt, errorMessage, snapshotNodes: strippedNodes,
        }
        get()._patchTask(task.id, { status: 'error', completedAt, errorMessage, snapshotNodes: strippedNodes })
        saveTask(final)
        if (task.sourceCanvasProjectId && task.canvasPlaceholderId) {
          get().addOrphanedPlaceholder(task.sourceCanvasProjectId, task.canvasPlaceholderId)
        }
      } finally {
        _queueEngine = null
        set({ isTaskRunning: false, isRunning: false, currentTaskId: null })
        get()._runNextTask()
      }
    },
  }))
)
