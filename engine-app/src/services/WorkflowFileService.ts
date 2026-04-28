/**
 * WorkflowFileService — 工作流文件系统存储层
 *
 * 每个工作流以 {id}.json 存储在用户指定的文件夹中。
 * 文件夹定义存储在 _folders.json 中。
 * 数据直接写入用户硬盘，与浏览器缓存无关。
 */

import type { WorkflowDefinition, WorkflowFolder } from '../types'

const FOLDERS_FILE = '_folders.json'

// ── 工作流文件读写 ────────────────────────────────────────────────

export async function saveWorkflowToFile(
  dir: FileSystemDirectoryHandle,
  workflow: WorkflowDefinition
): Promise<void> {
  const fh = await dir.getFileHandle(`${workflow.id}.json`, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(workflow, null, 2))
  await writable.close()
}

export async function loadAllWorkflowFiles(
  dir: FileSystemDirectoryHandle
): Promise<WorkflowDefinition[]> {
  const results: WorkflowDefinition[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of dir as any) {
    if ((handle as FileSystemHandle).kind !== 'file') continue
    if (!name.endsWith('.json') || name.startsWith('_')) continue
    try {
      const file = await (handle as FileSystemFileHandle).getFile()
      const text = await file.text()
      const wf = JSON.parse(text) as WorkflowDefinition
      if (wf.id && wf.name) results.push(wf)
    } catch {
      // 跳过损坏的文件
    }
  }
  return results
}

export async function deleteWorkflowFile(
  dir: FileSystemDirectoryHandle,
  id: string
): Promise<void> {
  try {
    await dir.removeEntry(`${id}.json`)
  } catch {
    // 文件不存在则忽略
  }
}

// ── 文件夹元数据 ──────────────────────────────────────────────────

export async function saveFoldersFile(
  dir: FileSystemDirectoryHandle,
  folders: WorkflowFolder[]
): Promise<void> {
  const fh = await dir.getFileHandle(FOLDERS_FILE, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(folders, null, 2))
  await writable.close()
}

export async function loadFoldersFile(
  dir: FileSystemDirectoryHandle
): Promise<WorkflowFolder[]> {
  try {
    const fh = await dir.getFileHandle(FOLDERS_FILE)
    const file = await fh.getFile()
    const text = await file.text()
    return JSON.parse(text) as WorkflowFolder[]
  } catch {
    return []
  }
}

// ── 迁移：将现有工作流从 IDB 导出到新文件夹 ──────────────────────

export async function migrateWorkflowsToDir(
  dir: FileSystemDirectoryHandle,
  workflows: WorkflowDefinition[]
): Promise<number> {
  let count = 0
  for (const wf of workflows) {
    try {
      await saveWorkflowToFile(dir, wf)
      count++
    } catch {
      // 跳过无法写入的工作流
    }
  }
  return count
}
