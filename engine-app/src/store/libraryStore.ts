/**
 * libraryStore — 视觉资产库专用 Zustand store
 */

import { create } from 'zustand'
import {
  listFiles, scanAllFiles, getAllTags,
  writeFile, deleteFile as deleteFileFS, renameFile as renameFileFS,
  moveFile as moveFileFS,
  setFileTags, setFileColors, setFileRating, setFileNote, setFileDimensions,
  getFileType,
  type LibraryFile,
} from '../services/LibraryFileService'
import { extractDominantColors, isColorSimilar } from '../utils/colorExtract'

// ── 类型定义 ──────────────────────────────────────────────────────

export type NavTarget =
  | { type: 'folder'; handle: FileSystemDirectoryHandle; path: string[] }
  | { type: 'all' }
  | { type: 'recent' }
  | { type: 'untagged' }
  | { type: 'starred' }
  | { type: 'color'; hex: string }
  | { type: 'tag'; tag: string }

export interface SortConfig {
  field: 'name' | 'addedAt' | 'size' | 'rating'
  dir:   'asc' | 'desc'
}

export interface FilterConfig {
  formats:   string[]
  minRating: number
  tags:      string[]
}

export interface ViewConfig {
  mode:      'grid' | 'tagGroup'
  thumbSize: number
}

// ── 文件 key（唯一标识） ─────────────────────────────────────────

export function getFileKey(f: LibraryFile): string {
  return `${f.name}::${f.folderPath.join('/')}`
}

// ── Store 接口 ────────────────────────────────────────────────────

interface LibraryStore {
  // ── 全局根目录 ────────────────────────────────────────────────
  libraryRoot: FileSystemDirectoryHandle | null
  setLibraryRoot: (root: FileSystemDirectoryHandle | null) => void

  // ── 导航 ──────────────────────────────────────────────────────
  navTarget: NavTarget | null
  setNavTarget: (t: NavTarget | null) => void

  // ── 文件列表 ──────────────────────────────────────────────────
  rawFiles: LibraryFile[]
  isLoading: boolean
  loadFiles: () => Promise<void>

  getDisplayFiles: () => LibraryFile[]

  // ── 单选（Inspector 用） ───────────────────────────────────────
  selectedFile: LibraryFile | null
  setSelectedFile: (f: LibraryFile | null) => void

  // ── 多选 ──────────────────────────────────────────────────────
  selectedIds: Set<string>
  anchorId: string | null
  toggleSelection: (f: LibraryFile, additive: boolean) => void
  selectRange: (target: LibraryFile, displayFiles: LibraryFile[]) => void
  clearSelection: () => void
  getSelectedFiles: () => LibraryFile[]

  // ── 排序/过滤/视图 ─────────────────────────────────────────────
  sort: SortConfig
  setSort: (s: SortConfig) => void
  filter: FilterConfig
  setFilter: (f: Partial<FilterConfig>) => void
  view: ViewConfig
  setView: (v: Partial<ViewConfig>) => void

  // ── 标签聚合 ───────────────────────────────────────────────────
  allTags: Map<string, number>
  refreshAllTags: () => Promise<void>

  // ── 文件操作 ──────────────────────────────────────────────────
  uploadFiles: (
    folder: { handle: FileSystemDirectoryHandle; path: string[] },
    files: File[],
  ) => Promise<void>
  deleteSelectedFile: () => Promise<void>
  deleteFiles: (files: LibraryFile[]) => Promise<void>
  moveFiles: (
    files: LibraryFile[],
    targetFolder: { handle: FileSystemDirectoryHandle; path: string[] },
  ) => Promise<void>
  renameFile: (file: LibraryFile, newName: string) => Promise<void>
  updateTags: (file: LibraryFile, tags: string[]) => Promise<void>
  updateRating: (file: LibraryFile, rating: number) => Promise<void>
  updateNote: (file: LibraryFile, note: string) => Promise<void>
  updateDimensions: (file: LibraryFile, dims: [number, number]) => Promise<void>
  updateColors: (file: LibraryFile, colors: string[]) => Promise<void>

  _patchFile: (fileName: string, folderPath: string[], patch: Partial<LibraryFile>) => void
}

// ── 排序 ──────────────────────────────────────────────────────────

function sortFiles(files: LibraryFile[], sort: SortConfig): LibraryFile[] {
  const sorted = [...files]
  sorted.sort((a, b) => {
    let diff = 0
    switch (sort.field) {
      case 'name':    diff = a.name.localeCompare(b.name, 'zh'); break
      case 'addedAt': diff = (a.addedAt || 0) - (b.addedAt || 0); break
      case 'rating':  diff = (a.rating || 0) - (b.rating || 0); break
      case 'size':    diff = 0; break
    }
    return sort.dir === 'asc' ? diff : -diff
  })
  return sorted
}

// ── 标签计数增量更新 ───────────────────────────────────────────────

function patchTagCounts(
  allTags: Map<string, number>,
  removed: string[],
  added: string[],
): Map<string, number> {
  const next = new Map(allTags)
  for (const tag of removed) {
    const c = next.get(tag) ?? 0
    if (c <= 1) next.delete(tag)
    else next.set(tag, c - 1)
  }
  for (const tag of added) {
    next.set(tag, (next.get(tag) ?? 0) + 1)
  }
  return next
}

// ── 过滤 ──────────────────────────────────────────────────────────

function filterFiles(files: LibraryFile[], filter: FilterConfig): LibraryFile[] {
  return files.filter((f) => {
    if (filter.formats.length > 0) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!filter.formats.includes(ext)) return false
    }
    if (filter.minRating > 0 && (f.rating ?? 0) < filter.minRating) return false
    if (filter.tags.length > 0) {
      if (!filter.tags.every((t) => f.tags.includes(t))) return false
    }
    return true
  })
}

// ── Store 创建 ────────────────────────────────────────────────────

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  libraryRoot: null,
  setLibraryRoot: (root) => set({ libraryRoot: root }),

  navTarget: null,
  setNavTarget: (t) => set({ navTarget: t }),

  rawFiles: [],
  isLoading: false,

  loadFiles: async () => {
    const { navTarget, libraryRoot, sort } = get()
    if (!libraryRoot) return

    set({ isLoading: true })
    try {
      let files: LibraryFile[] = []

      if (!navTarget || navTarget.type === 'all') {
        files = await scanAllFiles(libraryRoot)
      } else if (navTarget.type === 'folder') {
        files = await listFiles(navTarget.handle, navTarget.path)
      } else if (navTarget.type === 'recent') {
        const all = await scanAllFiles(libraryRoot)
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
        files = all
          .filter((f) => f.addedAt > 0 && f.addedAt >= cutoff)
          .sort((a, b) => b.addedAt - a.addedAt)
          .slice(0, 300)
      } else if (navTarget.type === 'untagged') {
        const all = await scanAllFiles(libraryRoot)
        files = all.filter((f) => f.tags.length === 0)
      } else if (navTarget.type === 'starred') {
        const all = await scanAllFiles(libraryRoot)
        files = all.filter((f) => f.rating > 0).sort((a, b) => b.rating - a.rating)
      } else if (navTarget.type === 'color') {
        const all = await scanAllFiles(libraryRoot)
        files = all.filter((f) =>
          f.colors.some((c) => isColorSimilar(c, navTarget.hex))
        )
      } else if (navTarget.type === 'tag') {
        const all = await scanAllFiles(libraryRoot)
        files = all.filter((f) => f.tags.includes(navTarget.tag))
      }

      files = sortFiles(files, sort)
      set({ rawFiles: files, isLoading: false })
    } catch (e) {
      console.error('[libraryStore] loadFiles error:', e)
      set({ isLoading: false })
    }
  },

  getDisplayFiles: () => {
    const { rawFiles, sort, filter } = get()
    return filterFiles(sortFiles(rawFiles, sort), filter)
  },

  selectedFile: null,
  setSelectedFile: (f) => {
    if (f) {
      set({ selectedFile: f, selectedIds: new Set([getFileKey(f)]), anchorId: getFileKey(f) })
    } else {
      set({ selectedFile: null, selectedIds: new Set(), anchorId: null })
    }
  },

  // ── 多选 ────────────────────────────────────────────────────────

  selectedIds: new Set<string>(),
  anchorId: null,

  toggleSelection: (f, additive) => {
    const key = getFileKey(f)
    if (!additive) {
      // 单选：清除其他，选中此项
      set({ selectedFile: f, selectedIds: new Set([key]), anchorId: key })
      return
    }
    // Cmd/Ctrl+Click：toggle
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(key)) {
        next.delete(key)
        const newSelected = state.selectedFile && getFileKey(state.selectedFile) === key
          ? null : state.selectedFile
        return { selectedIds: next, selectedFile: newSelected }
      } else {
        next.add(key)
        return { selectedIds: next, selectedFile: f, anchorId: key }
      }
    })
  },

  selectRange: (target, displayFiles) => {
    const { anchorId } = get()
    const targetKey = getFileKey(target)
    if (!anchorId) {
      set({ selectedIds: new Set([targetKey]), selectedFile: target, anchorId: targetKey })
      return
    }
    const anchorIdx = displayFiles.findIndex((f) => getFileKey(f) === anchorId)
    const targetIdx = displayFiles.findIndex((f) => getFileKey(f) === targetKey)
    if (anchorIdx === -1 || targetIdx === -1) return
    const [lo, hi] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx]
    const rangeKeys = displayFiles.slice(lo, hi + 1).map(getFileKey)
    set((state) => ({
      selectedIds: new Set([...state.selectedIds, ...rangeKeys]),
      selectedFile: target,
    }))
  },

  clearSelection: () => set({ selectedIds: new Set(), selectedFile: null, anchorId: null }),

  getSelectedFiles: () => {
    const { selectedIds, rawFiles } = get()
    if (selectedIds.size === 0) return []
    return rawFiles.filter((f) => selectedIds.has(getFileKey(f)))
  },

  sort: { field: 'addedAt', dir: 'desc' },
  setSort: (s) => set({ sort: s }),

  filter: { formats: [], minRating: 0, tags: [] },
  setFilter: (partial) => set((state) => ({ filter: { ...state.filter, ...partial } })),

  view: { mode: 'grid', thumbSize: 200 },
  setView: (partial) => set((state) => ({ view: { ...state.view, ...partial } })),

  allTags: new Map(),
  refreshAllTags: async () => {
    const { libraryRoot } = get()
    if (!libraryRoot) return
    try {
      const tags = await getAllTags(libraryRoot)
      set({ allTags: tags })
    } catch (e) {
      console.warn('[libraryStore] refreshAllTags error:', e)
    }
  },

  // ── 文件操作 ────────────────────────────────────────────────────

  uploadFiles: async (folder, files) => {
    const { libraryRoot } = get()

    for (const file of files) {
      const existing = new Set(get().rawFiles.map((f) => f.name))
      let name = file.name
      if (existing.has(name)) {
        const dot = name.lastIndexOf('.')
        const base = dot >= 0 ? name.slice(0, dot) : name
        const ext  = dot >= 0 ? name.slice(dot)    : ''
        let i = 1
        while (existing.has(`${base}_${i}${ext}`)) i++
        name = `${base}_${i}${ext}`
      }

      const buffer = await file.arrayBuffer()
      // 用扩展名（而非 MIME 类型）推断类型，与 OPFS 加载时的 getFileType 保持一致
      const fileType = getFileType(name)
      const isImg = fileType === 'image'

      await writeFile(folder.handle, name, buffer)

      const newFile: LibraryFile = {
        name,
        type: fileType,
        handle: await folder.handle.getFileHandle(name),
        folderPath: folder.path,
        folderHandle: folder.handle,
        tags: [], colors: [], addedAt: Date.now(), dimensions: null, rating: 0, note: '',
      }
      set((state) => ({ rawFiles: [newFile, ...state.rawFiles] }))

      if (isImg) {
        extractDominantColors(file).then(async (colors) => {
          if (colors.length > 0) {
            await setFileColors(folder.handle, name, colors)
            get()._patchFile(name, folder.path, { colors })
          }
        }).catch(() => {})
      }
    }

    if (libraryRoot) get().refreshAllTags()
  },

  deleteSelectedFile: async () => {
    const { selectedFile } = get()
    if (!selectedFile) return
    await get().deleteFiles([selectedFile])
  },

  deleteFiles: async (files) => {
    for (const file of files) {
      await deleteFileFS(file.folderHandle, file.name)
    }
    const deletedKeys = new Set(files.map(getFileKey))
    const removedTags = files.flatMap((f) => f.tags)
    set((state) => {
      const newSelected = state.selectedFile && deletedKeys.has(getFileKey(state.selectedFile))
        ? null : state.selectedFile
      return {
        rawFiles: state.rawFiles.filter((f) => !deletedKeys.has(getFileKey(f))),
        selectedFile: newSelected,
        selectedIds: new Set([...state.selectedIds].filter((k) => !deletedKeys.has(k))),
        allTags: patchTagCounts(state.allTags, removedTags, []),
      }
    })
  },

  moveFiles: async (files, targetFolder) => {
    for (const file of files) {
      await moveFileFS(file.folderHandle, file.name, targetFolder.handle)
    }
    const movedKeys = new Set(files.map(getFileKey))
    set((state) => {
      const newSelected = state.selectedFile && movedKeys.has(getFileKey(state.selectedFile))
        ? null : state.selectedFile
      return {
        rawFiles: state.rawFiles.filter((f) => !movedKeys.has(getFileKey(f))),
        selectedFile: newSelected,
        selectedIds: new Set([...state.selectedIds].filter((k) => !movedKeys.has(k))),
      }
    })
    // 刷新以便在目标文件夹视图下可见
    get().loadFiles()
  },

  renameFile: async (file, newName) => {
    await renameFileFS(file.folderHandle, file.name, newName)
    get()._patchFile(file.name, file.folderPath, { name: newName })
    const { selectedFile } = get()
    if (selectedFile?.name === file.name && selectedFile.folderPath.join('/') === file.folderPath.join('/')) {
      set({ selectedFile: { ...selectedFile, name: newName } })
    }
  },

  updateTags: async (file, newTags) => {
    const oldTags = file.tags
    await setFileTags(file.folderHandle, file.name, newTags)
    get()._patchFile(file.name, file.folderPath, { tags: newTags })
    const { selectedFile, navTarget } = get()
    if (selectedFile?.name === file.name && selectedFile.folderPath.join('/') === file.folderPath.join('/')) {
      set({ selectedFile: { ...selectedFile, tags: newTags } })
    }
    // 增量更新 allTags（无需全库重扫）
    const added = newTags.filter((t) => !oldTags.includes(t))
    const removed = oldTags.filter((t) => !newTags.includes(t))
    set((state) => ({ allTags: patchTagCounts(state.allTags, removed, added) }))
    // 修复导航视图陈旧问题
    if (navTarget?.type === 'untagged' && newTags.length > 0) {
      const key = getFileKey(file)
      set((state) => ({ rawFiles: state.rawFiles.filter((f) => getFileKey(f) !== key) }))
    } else if (navTarget?.type === 'tag') {
      const hadTag = oldTags.includes(navTarget.tag)
      const hasTag = newTags.includes(navTarget.tag)
      if (hadTag && !hasTag) {
        const key = getFileKey(file)
        set((state) => ({ rawFiles: state.rawFiles.filter((f) => getFileKey(f) !== key) }))
      } else if (!hadTag && hasTag) {
        get().loadFiles()
      }
    }
  },

  updateRating: async (file, rating) => {
    await setFileRating(file.folderHandle, file.name, rating)
    get()._patchFile(file.name, file.folderPath, { rating })
    const { selectedFile } = get()
    if (selectedFile?.name === file.name) set({ selectedFile: { ...selectedFile, rating } })
  },

  updateNote: async (file, note) => {
    await setFileNote(file.folderHandle, file.name, note)
    get()._patchFile(file.name, file.folderPath, { note })
    const { selectedFile } = get()
    if (selectedFile?.name === file.name) set({ selectedFile: { ...selectedFile, note } })
  },

  updateDimensions: async (file, dims) => {
    if (file.dimensions) return
    await setFileDimensions(file.folderHandle, file.name, dims)
    get()._patchFile(file.name, file.folderPath, { dimensions: dims })
    const { selectedFile } = get()
    if (selectedFile?.name === file.name) set({ selectedFile: { ...selectedFile, dimensions: dims } })
  },

  updateColors: async (file, colors) => {
    await setFileColors(file.folderHandle, file.name, colors)
    get()._patchFile(file.name, file.folderPath, { colors })
    const { selectedFile } = get()
    if (selectedFile?.name === file.name) set({ selectedFile: { ...selectedFile, colors } })
  },

  _patchFile: (fileName, folderPath, patch) => {
    const key = folderPath.join('/')
    set((state) => ({
      rawFiles: state.rawFiles.map((f) =>
        f.name === fileName && f.folderPath.join('/') === key
          ? { ...f, ...patch }
          : f
      ),
    }))
  },
}))

// ── 颜色提取辅助 ──────────────────────────────────────────────────

export async function triggerColorExtract(
  file: LibraryFile,
  store: ReturnType<typeof useLibraryStore.getState>,
): Promise<void> {
  if (file.colors.length > 0 || file.type !== 'image') return
  try {
    const f = await file.handle.getFile()
    const colors = await extractDominantColors(f)
    if (colors.length > 0) {
      await store.updateColors(file, colors)
    }
  } catch (e) {
    console.warn('[colorExtract] failed for', file.name, e)
  }
}
