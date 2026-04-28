// ── 节点类型 ────────────────────────────────────────────────────
export type NodeType = 'imageInput' | 'analyze' | 'prompt' | 'render' | 'output'
export type NodeStatus = 'idle' | 'running' | 'completed' | 'error'
export type OutputType = 'kv' | 'matrix' | 'moodboard' | 'cmf' | 'custom'

export interface BaseNodeData {
  label: string
  status: NodeStatus
  errorMessage?: string
  [key: string]: unknown
}

export interface ImageInputNodeData extends BaseNodeData {
  nodeType: 'imageInput'
  imagePaths: string[]
  imagePreviews: string[]  // data URLs for display
}

export interface AnalyzeNodeData extends BaseNodeData {
  nodeType: 'analyze'
  systemPrompt: string
  model: string
  outputSchema: string   // JSON string
  cachedResult?: string  // JSON string of analysis result
}

export interface PromptNodeData extends BaseNodeData {
  nodeType: 'prompt'
  promptTemplate: string
  outputCount: number
}

export interface RenderNodeData extends BaseNodeData {
  nodeType: 'render'
  model: string
  fallbackModel: string
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3'
  imageSize: '1K' | '4K'
  concurrency: number
  renderedImagePaths?: string[]
}

export interface OutputNodeData extends BaseNodeData {
  nodeType: 'output'
  outputType: OutputType
}

// ── 工作流文件夹 ────────────────────────────────────────────────

export interface WorkflowFolder {
  id: string
  name: string
  createdAt: number
  collapsed?: boolean
}

// ── 工作流定义 ──────────────────────────────────────────────────

export interface SavedNode {
  id: string
  type: string                       // 不限制枚举，兼容所有节点类型
  position: { x: number; y: number }
  width?: number                     // NodeResizer 保存的尺寸
  height?: number
  data: Record<string, unknown>
}

export interface SavedEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  folderId?: string              // undefined = 未分组
  order?: number                 // 拖拽排序序号，未定义时按 updatedAt 降序排在有序项后面
  status?: 'draft' | 'published'
  description?: string
  version?: string
  meta?: Record<string, unknown>
  createdAt: number
  updatedAt: number
  nodes: SavedNode[]
  edges: SavedEdge[]
  // 阶段二：发布为节点时的端口定义
  ports?: {
    inputs: Array<{ id: string; type: 'image' | 'text'; name: string }>
    outputs: Array<{ id: string; type: 'image' | 'text'; name: string }>
  }
}

// ── 任务 ────────────────────────────────────────────────────────
export interface JobProgress {
  jobId: string
  nodeId: string
  nodeLabel: string
  step: string
  totalImages: number
  completedImages: number
  overallPercent: number
}

export interface JobResult {
  jobId: string
  outputImagePaths: string[]
  projectPath: string
}

export interface JobError {
  jobId: string
  nodeId: string
  message: string
}

// ── 生成图片记录 ────────────────────────────────────────────────
export interface GeneratedImage {
  id: string
  jobId: string
  outputType: OutputType
  filePath: string
  workflowId: string
  createdAt: number
}

// ── 任务队列 ────────────────────────────────────────────────────

export interface TaskNodeLog {
  label: string
  status: 'pending' | 'running' | 'completed' | 'error'
  startedAt?: number
  duration?: number
}

// ── Token 用量 ──────────────────────────────────────────────────

export interface TokenUsage {
  model: string           // 模型 ID
  promptTokens: number    // 输入 token 数
  outputTokens: number    // 输出 token 数（图片或文字）
  imageCount?: number     // 本次生成的图片张数（仅图片生成节点）
  timestamp?: number      // Unix ms，对话生图调用时记录
}

export interface TaskRecord {
  id: string
  workflowId: string
  workflowName: string
  status: 'queued' | 'running' | 'completed' | 'error' | 'interrupted'
  source: 'canvas' | 'workflow'
  sourceCanvasProjectId?: string   // 画布触发时，来源画布项目 ID
  canvasPlaceholderId?: string     // 画布占位符 shape ID，结果返回后替换
  createdAt: number
  startedAt?: number
  completedAt?: number
  inputPreviews: string[]    // data URL 缩略图，用于展示
  outputPreviews: string[]   // data URL 缩略图，运行完成后填入
  nodeLog: Record<string, TaskNodeLog>
  errorMessage?: string
  snapshotNodes: SavedNode[]   // 用于重新运行
  snapshotEdges: SavedEdge[]
  tokenUsages?: TokenUsage[]      // 该任务所有 API 调用的 token 用量
  estimatedCostUsd?: number       // 预估费用（美元）
}

// ── 方案画布项目 ────────────────────────────────────────────────

export interface CanvasProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

// ── 应用设置 ────────────────────────────────────────────────────
export interface AppSettings {
  geminiApiKey: string
  outputDirHandle: FileSystemDirectoryHandle | null  // File System Access API 句柄
  outputDirName: string                               // 显示用路径名
  workerConcurrency: number
  apiCallIntervalMs: number
  outputFormat: 'png' | 'webp'
}

// ── AI 对话消息 ──────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  projectId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  outputDirHandle: null,
  outputDirName: '',
  workerConcurrency: 2,
  apiCallIntervalMs: 500,
  outputFormat: 'png',
}
