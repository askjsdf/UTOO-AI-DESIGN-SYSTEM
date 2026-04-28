/**
 * LibraryFileService — 视觉资产库文件系统层
 *
 * 存储结构：
 *   OPFS/library/
 *     subfolder/
 *       _meta.json        ← 文件夹元数据（标签/颜色/评分/备注/时间/尺寸）
 *       image.png
 *       brief.md
 */

const META_FILE = '_meta.json'
const OPFS_LIBRARY_DIR = 'library'

// ── OPFS 根目录（单例缓存） ────────────────────────────────────────

let _libraryRoot: FileSystemDirectoryHandle | null = null

export async function getLibraryRoot(): Promise<FileSystemDirectoryHandle> {
  if (_libraryRoot) return _libraryRoot
  if (!navigator.storage?.getDirectory) {
    throw new Error('navigator.storage.getDirectory 不可用（浏览器不支持 OPFS）')
  }
  navigator.storage.persist().catch(() => {})
  const opfsRoot = await navigator.storage.getDirectory()
  _libraryRoot = await opfsRoot.getDirectoryHandle(OPFS_LIBRARY_DIR, { create: true })
  console.log('[Library] OPFS 初始化成功:', _libraryRoot.name)
  return _libraryRoot
}

// ── 类型定义 ──────────────────────────────────────────────────────

/**
 * _meta.json 的完整结构。
 * 所有 Record 字段以文件名为 key，允许缺失（读取时用 ?? {} 补全）。
 */
export interface FolderMeta {
  description?: string
  fileTags:       Record<string, string[]>
  fileColors:     Record<string, string[]>        // 5 个主色 HEX
  fileAddedAt:    Record<string, number>          // 导入时间戳 ms
  fileDimensions: Record<string, [number, number]> // [宽px, 高px]
  fileRatings:    Record<string, number>          // 1-5, 0=未评
  fileNotes:      Record<string, string>          // 备注文本
}

export interface LibraryFile {
  name:       string
  type:       'image' | 'pdf' | 'md' | 'other'
  handle:     FileSystemFileHandle
  folderPath: string[]          // 从根到此文件夹的路径段
  folderHandle: FileSystemDirectoryHandle
  tags:       string[]
  colors:     string[]          // 主色 HEX，可能为空（尚未提取）
  addedAt:    number            // 0 表示未记录
  dimensions: [number, number] | null
  rating:     number            // 0-5
  note:       string
}

export interface LibraryFolder {
  name:        string
  handle:      FileSystemDirectoryHandle
  path:        string[]
  hasChildren: boolean
}

// ── 工具 ──────────────────────────────────────────────────────────

export function getFileType(name: string): LibraryFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'tiff', 'heic'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'md' || ext === 'txt') return 'md'
  return 'other'
}

// ── _meta.json 读写 ───────────────────────────────────────────────

export async function readFolderMeta(dir: FileSystemDirectoryHandle): Promise<FolderMeta> {
  try {
    const fh = await dir.getFileHandle(META_FILE)
    const file = await fh.getFile()
    const parsed = JSON.parse(await file.text())
    // 补全缺失字段（向后兼容旧 meta 格式）
    return {
      fileTags:       {},
      fileColors:     {},
      fileAddedAt:    {},
      fileDimensions: {},
      fileRatings:    {},
      fileNotes:      {},
      ...parsed,
    }
  } catch {
    return {
      fileTags: {}, fileColors: {}, fileAddedAt: {},
      fileDimensions: {}, fileRatings: {}, fileNotes: {},
    }
  }
}

export async function writeFolderMeta(dir: FileSystemDirectoryHandle, meta: FolderMeta): Promise<void> {
  const fh = await dir.getFileHandle(META_FILE, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(meta, null, 2))
  await writable.close()
}

// ── 单字段 patch（减少读写开销） ─────────────────────────────────

/**
 * 每个 FileSystemDirectoryHandle 对应一个写入队列，防止并发写入 _meta.json 时相互覆盖。
 * （颜色提取、尺寸记录、标签操作都是异步的，若无串行化会产生"后写覆盖先写"的竞态）
 */
const _writeQueues = new WeakMap<FileSystemDirectoryHandle, Promise<void>>()

async function patchMeta<K extends keyof FolderMeta>(
  dir: FileSystemDirectoryHandle,
  field: K,
  fileName: string,
  value: FolderMeta[K] extends Record<string, infer V> ? V : never,
): Promise<void> {
  // 串行化同一目录的所有写入，防止并发读-改-写相互覆盖
  const prev = _writeQueues.get(dir) ?? Promise.resolve()
  const next = prev.then(async () => {
    const meta = await readFolderMeta(dir)
    ;(meta[field] as Record<string, unknown>)[fileName] = value
    await writeFolderMeta(dir, meta)
  })
  // 即使 next 失败，队列也能继续（不阻塞后续写入）
  _writeQueues.set(dir, next.then(() => {}, () => {}))
  return next
}

export async function setFileTags(dir: FileSystemDirectoryHandle, fileName: string, tags: string[]): Promise<void> {
  await patchMeta(dir, 'fileTags', fileName, tags)
}

export async function setFileColors(dir: FileSystemDirectoryHandle, fileName: string, colors: string[]): Promise<void> {
  await patchMeta(dir, 'fileColors', fileName, colors)
}

export async function setFileDimensions(dir: FileSystemDirectoryHandle, fileName: string, dims: [number, number]): Promise<void> {
  await patchMeta(dir, 'fileDimensions', fileName, dims)
}

export async function setFileRating(dir: FileSystemDirectoryHandle, fileName: string, rating: number): Promise<void> {
  await patchMeta(dir, 'fileRatings', fileName, rating)
}

export async function setFileNote(dir: FileSystemDirectoryHandle, fileName: string, note: string): Promise<void> {
  await patchMeta(dir, 'fileNotes', fileName, note)
}

// ── 子文件夹列表（一层，不递归） ─────────────────────────────────

export async function listSubFolders(
  dir: FileSystemDirectoryHandle,
  path: string[] = [],
): Promise<LibraryFolder[]> {
  const folders: LibraryFolder[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of dir as any) {
    if ((handle as FileSystemHandle).kind !== 'directory') continue
    if (name.startsWith('.')) continue
    const subDir = handle as FileSystemDirectoryHandle
    let hasChildren = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [, h] of subDir as any) {
      if ((h as FileSystemHandle).kind === 'directory' && !(h as FileSystemHandle).name.startsWith('.')) {
        hasChildren = true
        break
      }
    }
    folders.push({ name, handle: subDir, path: [...path, name], hasChildren })
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return folders
}

// ── 文件夹内文件列表 ──────────────────────────────────────────────

export async function listFiles(
  dir: FileSystemDirectoryHandle,
  folderPath: string[] = [],
): Promise<LibraryFile[]> {
  const meta = await readFolderMeta(dir)
  const files: LibraryFile[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of dir as any) {
    if ((handle as FileSystemHandle).kind !== 'file') continue
    if (name === META_FILE || name.startsWith('.')) continue
    files.push({
      name,
      type: getFileType(name),
      handle: handle as FileSystemFileHandle,
      folderPath,
      folderHandle: dir,
      tags:       meta.fileTags[name]       ?? [],
      colors:     meta.fileColors[name]     ?? [],
      addedAt:    meta.fileAddedAt[name]    ?? 0,
      dimensions: meta.fileDimensions[name] ?? null,
      rating:     meta.fileRatings[name]    ?? 0,
      note:       meta.fileNotes[name]      ?? '',
    })
  }
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return files
}

// ── 全库递归扫描 ──────────────────────────────────────────────────

/**
 * 递归扫描 OPFS 库根目录下所有文件。
 * 用于"全部"/"最近添加"/"未分类"/"颜色搜索"等跨文件夹视图。
 */
export async function scanAllFiles(
  root: FileSystemDirectoryHandle,
  maxDepth = 8,
): Promise<LibraryFile[]> {
  const result: LibraryFile[] = []

  async function scanDir(dir: FileSystemDirectoryHandle, path: string[], depth: number) {
    if (depth > maxDepth) return
    const meta = await readFolderMeta(dir)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, handle] of dir as any) {
      if (name.startsWith('.')) continue

      if ((handle as FileSystemHandle).kind === 'directory') {
        await scanDir(handle as FileSystemDirectoryHandle, [...path, name], depth + 1)
      } else {
        if (name === META_FILE) continue
        result.push({
          name,
          type: getFileType(name),
          handle: handle as FileSystemFileHandle,
          folderPath: path,
          folderHandle: dir,
          tags:       meta.fileTags[name]       ?? [],
          colors:     meta.fileColors[name]     ?? [],
          addedAt:    meta.fileAddedAt[name]    ?? 0,
          dimensions: meta.fileDimensions[name] ?? null,
          rating:     meta.fileRatings[name]    ?? 0,
          note:       meta.fileNotes[name]      ?? '',
        })
      }
    }
  }

  await scanDir(root, [], 0)
  return result
}

// ── 全库标签聚合 ──────────────────────────────────────────────────

/**
 * 扫描整个库，返回所有已使用的标签及其出现次数。
 * 用于标签自动补全。
 */
export async function getAllTags(root: FileSystemDirectoryHandle): Promise<Map<string, number>> {
  const tagCount = new Map<string, number>()
  const files = await scanAllFiles(root)
  for (const file of files) {
    for (const tag of file.tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
    }
  }
  return tagCount
}

// ── 文件写入 ──────────────────────────────────────────────────────

export async function writeFile(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  data: ArrayBuffer | Blob | string,
  options: { tags?: string[]; colors?: string[] } = {},
): Promise<void> {
  const fh = await dir.getFileHandle(fileName, { create: true })
  const writable = await fh.createWritable()
  await writable.write(data)
  await writable.close()

  // 更新 meta
  const meta = await readFolderMeta(dir)
  meta.fileAddedAt[fileName] = Date.now()
  if (options.tags?.length) meta.fileTags[fileName] = options.tags
  if (options.colors?.length) meta.fileColors[fileName] = options.colors
  await writeFolderMeta(dir, meta)
}

// ── 文件重命名 ────────────────────────────────────────────────────

export async function renameFile(
  dir: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<void> {
  const oldFh = await dir.getFileHandle(oldName)
  const oldFile = await oldFh.getFile()
  const buffer = await oldFile.arrayBuffer()
  const newFh = await dir.getFileHandle(newName, { create: true })
  const writable = await newFh.createWritable()
  await writable.write(buffer)
  await writable.close()
  await dir.removeEntry(oldName)

  // 迁移所有 meta 字段
  const meta = await readFolderMeta(dir)
  const fields: (keyof FolderMeta)[] = ['fileTags', 'fileColors', 'fileAddedAt', 'fileDimensions', 'fileRatings', 'fileNotes']
  for (const field of fields) {
    const rec = meta[field] as Record<string, unknown>
    if (rec[oldName] !== undefined) {
      rec[newName] = rec[oldName]
      delete rec[oldName]
    }
  }
  await writeFolderMeta(dir, meta)
}

// ── 文件删除 ──────────────────────────────────────────────────────

export async function deleteFile(
  dir: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  await dir.removeEntry(fileName)
  const meta = await readFolderMeta(dir)
  const fields: (keyof FolderMeta)[] = ['fileTags', 'fileColors', 'fileAddedAt', 'fileDimensions', 'fileRatings', 'fileNotes']
  for (const field of fields) {
    delete (meta[field] as Record<string, unknown>)[fileName]
  }
  await writeFolderMeta(dir, meta)
}

// ── 文件移动（跨文件夹，携带 meta） ───────────────────────────────

export async function moveFile(
  sourceDir: FileSystemDirectoryHandle,
  fileName: string,
  targetDir: FileSystemDirectoryHandle,
): Promise<string> {
  // 1. 读取原始二进制
  const srcFh = await sourceDir.getFileHandle(fileName)
  const buffer = await (await srcFh.getFile()).arrayBuffer()

  // 2. 确保目标文件名唯一
  let targetName = fileName
  try {
    await targetDir.getFileHandle(targetName)
    // 同名文件已存在，自动加后缀
    const dot = targetName.lastIndexOf('.')
    const base = dot >= 0 ? targetName.slice(0, dot) : targetName
    const ext  = dot >= 0 ? targetName.slice(dot)    : ''
    let i = 1
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = `${base}_${i}${ext}`
      try { await targetDir.getFileHandle(candidate); i++ } catch { targetName = candidate; break }
    }
  } catch {
    // 目标中无同名文件，直接使用原名
  }

  // 3. 写入目标
  const dstFh = await targetDir.getFileHandle(targetName, { create: true })
  const writable = await dstFh.createWritable()
  await writable.write(buffer)
  await writable.close()

  // 4. 迁移 meta（源文件名 → 目标文件名）
  const srcMeta = await readFolderMeta(sourceDir)
  const dstMeta = await readFolderMeta(targetDir)
  const fields: (keyof FolderMeta)[] = ['fileTags', 'fileColors', 'fileAddedAt', 'fileDimensions', 'fileRatings', 'fileNotes']
  for (const field of fields) {
    const srcRec = srcMeta[field] as Record<string, unknown>
    if (srcRec[fileName] !== undefined) {
      ;(dstMeta[field] as Record<string, unknown>)[targetName] = srcRec[fileName]
    }
  }
  await writeFolderMeta(targetDir, dstMeta)

  // 5. 删除源文件 + 清理源 meta
  await deleteFile(sourceDir, fileName)

  return targetName
}

// ── Object URL / 文本读取 ─────────────────────────────────────────

export async function getFileObjectUrl(fh: FileSystemFileHandle): Promise<string> {
  return URL.createObjectURL(await fh.getFile())
}

export async function getFileText(fh: FileSystemFileHandle): Promise<string> {
  return (await fh.getFile()).text()
}

// ── 文件夹 CRUD ───────────────────────────────────────────────────

export async function createSubFolder(
  parentDir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return parentDir.getDirectoryHandle(name, { create: true })
}

export async function deleteFolderRecursive(
  parentDir: FileSystemDirectoryHandle,
  folderName: string,
): Promise<void> {
  await parentDir.removeEntry(folderName, { recursive: true })
}

export async function renameFolderEntry(
  parentDir: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<FileSystemDirectoryHandle> {
  const oldDir = await parentDir.getDirectoryHandle(oldName)
  const newDir = await parentDir.getDirectoryHandle(newName, { create: true })
  await copyDirContents(oldDir, newDir)
  await parentDir.removeEntry(oldName, { recursive: true })
  return newDir
}

async function copyDirContents(src: FileSystemDirectoryHandle, dst: FileSystemDirectoryHandle): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of src as any) {
    if ((handle as FileSystemHandle).kind === 'file') {
      const fh = handle as FileSystemFileHandle
      const file = await fh.getFile()
      const buf = await file.arrayBuffer()
      const newFh = await dst.getFileHandle(name, { create: true })
      const w = await newFh.createWritable()
      await w.write(buf)
      await w.close()
    } else {
      const subDst = await dst.getDirectoryHandle(name, { create: true })
      await copyDirContents(handle as FileSystemDirectoryHandle, subDst)
    }
  }
}
