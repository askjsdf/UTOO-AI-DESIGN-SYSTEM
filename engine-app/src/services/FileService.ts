// File System Access API 封装
// 仅在 Chrome/Edge 86+ 中可用

export type DirHandle = FileSystemDirectoryHandle

// ── 选择图片文件 ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any

export async function pickImageFiles(): Promise<{ file: File; base64: string }[]> {
  const handles = await w.showOpenFilePicker({
    multiple: true,
    types: [
      {
        description: 'Images',
        accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
      },
    ],
  })
  return Promise.all(
    handles.map(async (h) => {
      const file = await h.getFile()
      const base64 = await fileToBase64(file)
      return { file, base64 }
    })
  )
}

// ── 选择输出文件夹 ───────────────────────────────────────────────

export async function pickOutputDirectory(): Promise<FileSystemDirectoryHandle> {
  return w.showDirectoryPicker({ mode: 'readwrite' })
}

// ── 在输出目录下创建项目子目录 ───────────────────────────────────

export async function createProjectDir(
  rootHandle: FileSystemDirectoryHandle,
  projectName: string
): Promise<FileSystemDirectoryHandle> {
  const projectHandle = await rootHandle.getDirectoryHandle(projectName, { create: true })
  await projectHandle.getDirectoryHandle('input', { create: true })
  await projectHandle.getDirectoryHandle('outputs', { create: true })
  return projectHandle
}

// ── 将 base64 图片写入目录 ───────────────────────────────────────

export async function writeImageToDir(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  base64: string
): Promise<void> {
  const blob = base64ToBlob(base64, 'image/png')
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

// ── 将 File 对象复制到目录 ───────────────────────────────────────

export async function copyFileToDir(
  dirHandle: FileSystemDirectoryHandle,
  file: File,
  fileName?: string
): Promise<void> {
  const name = fileName ?? file.name
  const fileHandle = await dirHandle.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(file)
  await writable.close()
}

// ── 工作流 JSON 保存/加载 ────────────────────────────────────────

export async function saveWorkflowJSON(data: unknown, suggestedName?: string): Promise<void> {
  const handle = await w.showSaveFilePicker({
    suggestedName: suggestedName ?? 'workflow.json',
    types: [{ description: 'Workflow JSON', accept: { 'application/json': ['.json'] } }],
  })
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

export async function loadWorkflowJSON(): Promise<unknown> {
  const [handle] = await w.showOpenFilePicker({
    types: [{ description: 'Workflow JSON', accept: { 'application/json': ['.json'] } }],
  })
  const file = await handle.getFile()
  const text = await file.text()
  return JSON.parse(text)
}

// ── 辅助函数 ─────────────────────────────────────────────────────

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // 去掉 data:image/xxx;base64, 前缀，只保留纯 base64
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function base64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const binary = atob(base64.replace(/^data:image\/\w+;base64,/, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export function base64ToDataUrl(base64: string, mimeType = 'image/png'): string {
  if (base64.startsWith('data:')) return base64
  return `data:${mimeType};base64,${base64}`
}

// 检查浏览器是否支持 File System Access API
export function isFileSystemAccessSupported(): boolean {
  return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window
}
