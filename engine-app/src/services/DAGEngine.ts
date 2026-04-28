/**
 * DAG 执行引擎（新节点系统）
 * - Kahn 算法拓扑排序，确定执行层级
 * - 同层节点并发执行，层间串行
 */

import type { Node, Edge } from '@xyflow/react'
import type { Part } from '@google/genai'
import type { ImageInputNodeData } from '../views/WorkflowView/nodes/ImageInputNode'
import type { ImageSaveNodeData } from '../views/WorkflowView/nodes/ImageSaveNode'
import type { TextInputNodeData } from '../views/WorkflowView/nodes/TextInputNode'
import type { LLMNodeData } from '../views/WorkflowView/nodes/LLMNode'
import type { ImageGenNodeData } from '../views/WorkflowView/nodes/ImageGenNode'
import type { CodeNodeData } from '../views/WorkflowView/nodes/CodeNode'
import type { SendToCanvasNodeData } from '../views/WorkflowView/nodes/SendToCanvasNode'
import { writeImageToDir } from './FileService'
import { getGeminiService } from './GeminiService'
import { saveBase64Image } from './imageStore'
import { useAppStore } from '../store/appStore'

// ── 节点间传递的数据 ─────────────────────────────────────────────

interface NodeOutput {
  images?: string[]   // base64 字符串数组
  text?: string       // 文本字符串
}

// ── 图解析 ───────────────────────────────────────────────────────

interface DAGGraph {
  adj: Map<string, string[]>
  indegree: Map<string, number>
  nodeMap: Map<string, Node>
}

function parseGraph(nodes: Node[], edges: Edge[]): DAGGraph {
  const adj = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  const nodeMap = new Map<string, Node>()

  nodes.forEach((n) => {
    adj.set(n.id, [])
    indegree.set(n.id, 0)
    nodeMap.set(n.id, n)
  })

  edges.forEach((e) => {
    adj.get(e.source)?.push(e.target)
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  })

  return { adj, indegree, nodeMap }
}

// Kahn 拓扑排序，返回按层分组的 nodeId
function topoSort(graph: DAGGraph): string[][] {
  const indegree = new Map(graph.indegree)
  const layers: string[][] = []
  let frontier = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)

  while (frontier.length > 0) {
    layers.push(frontier)
    const next: string[] = []
    for (const id of frontier) {
      for (const child of graph.adj.get(id) ?? []) {
        const d = (indegree.get(child) ?? 1) - 1
        indegree.set(child, d)
        if (d === 0) next.push(child)
      }
    }
    frontier = next
  }

  return layers
}

// 合并所有上游输出
function collectUpstream(nodeId: string, edges: Edge[], outputs: Map<string, NodeOutput>): NodeOutput {
  const images: string[] = []
  let text: string | undefined
  edges.filter((e) => e.target === nodeId).forEach((e) => {
    const up = outputs.get(e.source)
    if (up?.images) images.push(...up.images)
    if (up?.text !== undefined) text = up.text
  })
  return { images, text }
}

// ── 节点执行器 ───────────────────────────────────────────────────

async function execTextInput(node: Node): Promise<NodeOutput> {
  const d = node.data as unknown as TextInputNodeData
  return { text: d.text ?? '' }
}

async function execTextDisplay(
  node: Node,
  upstream: NodeOutput,
  patchNodeData: (id: string, patch: object) => void
): Promise<NodeOutput> {
  const text = upstream.text ?? ''
  patchNodeData(node.id, { receivedText: text })
  return { text }
}

async function execLLM(
  node: Node,
  edges: Edge[],
  outputs: Map<string, NodeOutput>,
  patchNodeData: (id: string, patch: object) => void,
  apiKey: string
): Promise<NodeOutput> {
  const d = node.data as unknown as LLMNodeData
  const slots = d.inputSlots ?? []
  const parts: Part[] = []

  for (const slot of slots) {
    // 找连接到这个槽的边（targetHandle === slot.id）
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === slot.id)
    if (!edge) continue
    const up = outputs.get(edge.source)
    if (!up) continue

    if (slot.type === 'image' && up.images?.[0]) {
      parts.push({ inlineData: { mimeType: 'image/png', data: up.images[0] } })
    } else if (slot.type === 'text' && up.text !== undefined) {
      parts.push({ text: up.text })
    }
  }

  if (parts.length === 0) throw new Error(`LLM 节点 "${d.label}"：无有效输入，请检查连线`)

  const gemini = getGeminiService(apiKey)
  const text = await gemini.complete(
    d.model ?? 'gemini-3-flash-preview',
    d.systemPrompt ?? '',
    parts
  )

  patchNodeData(node.id, { outputText: text })
  return { text }
}

// 比例 → 注入文字描述映射
const AR_PROMPT_MAP: Record<string, string> = {
  '1:1':  'square 1:1 composition',
  '3:4':  'portrait 3:4 vertical format',
  '4:3':  'landscape 4:3 horizontal format',
  '9:16': 'tall vertical 9:16 portrait format',
  '16:9': 'wide horizontal 16:9 widescreen format',
}

async function execImageGen(
  node: Node,
  edges: Edge[],
  outputs: Map<string, NodeOutput>,
  patchNodeData: (id: string, patch: object) => void,
  apiKey: string
): Promise<NodeOutput> {
  const d = node.data as unknown as ImageGenNodeData
  const slots = d.inputSlots ?? []

  // 按 slot 顺序构建 Part[]
  // - text slot → 收集文字，最终拼成一个文本 Part
  // - image slot → 注入 [slot名字] 标签 + inlineData
  const imageParts: Part[] = []
  const textChunks: string[] = []

  for (const slot of slots) {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === slot.id)
    if (!edge) continue
    const up = outputs.get(edge.source)
    if (!up) continue

    if (slot.type === 'text' && up.text !== undefined && up.text.trim() !== '') {
      textChunks.push(up.text.trim())
    } else if (slot.type === 'image' && up.images?.[0]) {
      imageParts.push({ text: `[${slot.name}]` })
      imageParts.push({ inlineData: { mimeType: 'image/png', data: up.images[0] } })
    }
  }

  // 拼接比例描述
  const arDesc = AR_PROMPT_MAP[d.aspectRatio ?? '']
  if (arDesc) textChunks.push(arDesc)

  // 拼接负面提示词
  const neg = d.negativePrompt?.trim()
  if (neg) textChunks.push(`avoid: ${neg}`)

  if (textChunks.length === 0 && imageParts.length === 0) {
    throw new Error(`图片生成节点 "${d.label}"：所有端口均未连线，请至少连接一个输入`)
  }

  // 最终 parts：图片在前，文字在后
  const finalText = textChunks.join(', ')
  const allParts: Part[] = [
    ...imageParts,
    ...(finalText ? [{ text: finalText }] : []),
  ]

  // 存储本次文本 prompt，供预览按钮展示
  patchNodeData(node.id, { _lastPrompt: finalText || undefined })

  const count = d.count ?? 1
  const gemini = getGeminiService(apiKey)

  const { images, usages } = await gemini.generateImagesWithUsage(allParts, count, {
    model: d.model,
  })

  // Phase 2.1：预览存 OPFS，patchNodeData 只写本地 URL（避免大 base64 进 TaskRecord/IDB）
  const previews = await Promise.all(
    images.map(async (b64) => {
      try {
        const assetId = `preview-${crypto.randomUUID()}`
        return await saveBase64Image(assetId, b64)
      } catch {
        return `data:image/png;base64,${b64}` // fallback
      }
    })
  )
  patchNodeData(node.id, { _outputPreviews: previews, _tokenUsages: usages })
  return { images }
}

async function execImageInput(node: Node): Promise<NodeOutput> {
  const d = node.data as unknown as ImageInputNodeData
  const images = d.images ?? []
  if (images.length === 0) throw new Error(`图片输入节点 "${d.label}"：未加载图片`)
  return { images }
}

async function execCode(
  node: Node,
  edges: Edge[],
  outputs: Map<string, NodeOutput>,
  patchNodeData: (id: string, patch: object) => void
): Promise<NodeOutput> {
  const d = node.data as unknown as CodeNodeData
  const slots = d.inputSlots ?? []

  // 按 slot 名字构建 inputs 对象，透传 text 和 images
  const inputs: Record<string, { text?: string; images?: string[] }> = {}
  for (const slot of slots) {
    const edge = edges.find((e) => e.target === node.id && e.targetHandle === slot.id)
    if (!edge) continue
    const up = outputs.get(edge.source)
    if (up) inputs[slot.name] = { text: up.text, images: up.images }
  }

  // 执行用户代码（new Function 在浏览器本地环境中运行，无网络/存储风险）
  // eslint-disable-next-line no-new-func
  const fn = new Function('inputs', d.code ?? 'return {}')
  const result = (await Promise.resolve(fn(inputs))) as NodeOutput ?? {}

  if (result.text !== undefined) {
    patchNodeData(node.id, { _outputText: result.text })
  }

  return { text: result.text, images: result.images }
}

async function execSendToCanvas(
  node: Node,
  upstream: NodeOutput,
  patchNodeData: (id: string, patch: object) => void,
  sourceCanvasProjectId?: string,
  canvasPlaceholderId?: string
): Promise<NodeOutput> {
  const d = node.data as unknown as SendToCanvasNodeData

  // 解析目标项目 ID
  let targetProjectId: string | null = null

  if (d.mode === 'manual') {
    // 手动模式：必须有指定项目
    if (!d.targetProjectId) throw new Error(`发送到画布节点 "${d.label}"：手动模式下未选择目标项目`)
    targetProjectId = d.targetProjectId
  } else {
    // 自动模式：优先用来源画布，fallback 到当前激活画布
    const store = useAppStore.getState()
    targetProjectId =
      sourceCanvasProjectId ??
      store.currentCanvasProjectId ??
      null
    if (!targetProjectId) throw new Error(`发送到画布节点 "${d.label}"：自动模式下找不到目标画布，请切换为手动模式并指定项目`)
  }

  const images = upstream.images ?? []
  if (images.length === 0) {
    patchNodeData(node.id, { _sentCount: 0 })
    return {}
  }

  const dataUrls = images.map((b64) => `data:image/png;base64,${b64}`)
  const store = useAppStore.getState()

  // 有占位符：全部图片一起走替换流程（首张替换占位符位置，其余横向紧跟）
  // 无占位符：正常插入
  if (canvasPlaceholderId && dataUrls.length > 0) {
    store.addPendingCanvasReplacement(targetProjectId, canvasPlaceholderId, dataUrls)
  } else {
    store.addPendingCanvasImages(targetProjectId, dataUrls)
  }

  patchNodeData(node.id, { _sentCount: images.length, _resolvedProjectId: targetProjectId })
  return {}
}

async function execImageSave(
  node: Node,
  upstream: NodeOutput,
  patchNodeData: (id: string, patch: object) => void
): Promise<NodeOutput> {
  const d = node.data as unknown as ImageSaveNodeData
  const images = upstream.images ?? []

  if (!d.dirHandle) throw new Error(`图片保存节点 "${d.label}"：未选择保存文件夹`)
  if (images.length === 0) {
    patchNodeData(node.id, { savedCount: 0, savedPreviews: [] })
    return {}
  }

  const prefix = d.prefix || 'output'
  const previews: string[] = []

  for (let i = 0; i < images.length; i++) {
    const fileName = `${prefix}_${String(i + 1).padStart(3, '0')}.png`
    await writeImageToDir(d.dirHandle, fileName, images[i])
    // Phase 2.1：预览存 OPFS，只保留本地 URL
    if (i < 4) {
      try {
        const assetId = `preview-${crypto.randomUUID()}`
        previews.push(await saveBase64Image(assetId, images[i]))
      } catch {
        previews.push(`data:image/png;base64,${images[i]}`) // fallback
      }
    }
  }

  patchNodeData(node.id, { savedCount: images.length, savedPreviews: previews })
  return {}
}

// ── 执行引擎 ─────────────────────────────────────────────────────

export class DAGEngine {
  private cancelled = false

  cancel(): void {
    this.cancelled = true
  }

  async run(
    nodes: Node[],
    edges: Edge[],
    apiKey: string,
    patchNodeData: (id: string, patch: object) => void,
    onNodeStatus: (nodeId: string, status: 'running' | 'completed' | 'error') => void,
    sourceCanvasProjectId?: string,
    canvasPlaceholderId?: string
  ): Promise<void> {
    this.cancelled = false

    const graph = parseGraph(nodes, edges)
    const layers = topoSort(graph)
    const outputs = new Map<string, NodeOutput>()

    for (const layer of layers) {
      if (this.cancelled) break

      await Promise.all(
        layer.map(async (nodeId) => {
          if (this.cancelled) return
          const node = graph.nodeMap.get(nodeId)!
          const upstream = collectUpstream(nodeId, edges, outputs)

          onNodeStatus(nodeId, 'running')
          try {
            let output: NodeOutput = {}
            switch (node.type) {
              case 'imageInput':
                output = await execImageInput(node)
                break
              case 'imageSave':
                output = await execImageSave(node, upstream, patchNodeData)
                break
              case 'textInput':
                output = await execTextInput(node)
                break
              case 'textDisplay':
                output = await execTextDisplay(node, upstream, patchNodeData)
                break
              case 'llm':
                output = await execLLM(node, edges, outputs, patchNodeData, apiKey)
                break
              case 'imageGen':
                output = await execImageGen(node, edges, outputs, patchNodeData, apiKey)
                break
              case 'code':
                output = await execCode(node, edges, outputs, patchNodeData)
                break
              case 'sendToCanvas':
                output = await execSendToCanvas(node, upstream, patchNodeData, sourceCanvasProjectId, canvasPlaceholderId)
                break
              default:
                output = upstream
            }
            outputs.set(nodeId, output)
            onNodeStatus(nodeId, 'completed')
          } catch (e) {
            console.error(`[DAGEngine] node ${nodeId} failed:`, e)
            onNodeStatus(nodeId, 'error')
            throw e
          }
        })
      )
    }
  }
}
