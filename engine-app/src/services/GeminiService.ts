import { GoogleGenAI, type Part } from '@google/genai'
import PQueue from 'p-queue'
import { MODELS } from '../config/models'
import type { TokenUsage } from '../types'

// ── 类型定义 ─────────────────────────────────────────────────────

export interface AnalysisResult {
  raw: string        // 原始 JSON 字符串
  parsed: unknown    // 解析后的对象
}

export type ProgressCallback = (step: string) => void

// ── 错误分类 ─────────────────────────────────────────────────────

export class GeminiError extends Error {
  constructor(
    public code: 'rate_limit' | 'invalid_key' | 'bad_request' | 'server_error' | 'timeout' | 'unknown',
    message: string,
    public retryable: boolean = false
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

function classifyError(e: unknown): GeminiError {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) {
    return new GeminiError('rate_limit', `API 调用频率超限: ${msg}`, true)
  }
  if (msg.includes('400') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('api key')) {
    return new GeminiError('invalid_key', `API Key 无效或请求错误: ${msg}`, false)
  }
  if (msg.includes('500') || msg.includes('503')) {
    return new GeminiError('server_error', `Gemini 服务端错误: ${msg}`, true)
  }
  if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('network')) {
    return new GeminiError('timeout', `网络超时: ${msg}`, true)
  }
  return new GeminiError('unknown', msg, true)
}

// ── GeminiService ─────────────────────────────────────────────────

export class GeminiService {
  private client: GoogleGenAI
  private queue: PQueue

  constructor(apiKey: string, concurrency = 4, intervalMs = 500) {
    if (!apiKey) throw new GeminiError('invalid_key', 'API Key 未配置，请先在设置中填入', false)
    this.client = new GoogleGenAI({ apiKey })
    this.queue = new PQueue({ concurrency, interval: intervalMs, intervalCap: 1 })
  }

  // ── 通用文本生成（LLM 节点使用） ──────────────────────────────

  async complete(
    model: string,
    systemPrompt: string,
    parts: Part[]
  ): Promise<string> {
    const { text } = await this.completeWithUsage(model, systemPrompt, parts)
    return text
  }

  async completeWithUsage(
    model: string,
    systemPrompt: string,
    parts: Part[]
  ): Promise<{ text: string; usage: TokenUsage }> {
    return this.queue.add(async () => {
      const resp = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          temperature: 0.7,
          ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        },
      })
      const usage: TokenUsage = {
        model,
        promptTokens: resp.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
      }
      return { text: resp.text ?? '', usage }
    }) as Promise<{ text: string; usage: TokenUsage }>
  }

  // ── 图片分析（文字输出） ────────────────────────────────────────

  async analyzeDesign(
    imageBase64: string,
    systemPrompt: string,
    onProgress?: ProgressCallback
  ): Promise<AnalysisResult> {
    return this.queue.add(async () => {
      onProgress?.('正在分析设计...')
      const imagePart: Part = {
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      }
      const resp = await this.withFallback(
        () => this.client.models.generateContent({
          model: MODELS.TEXT.PRO,
          contents: [{ role: 'user', parts: [imagePart, { text: systemPrompt }] }],
          config: { temperature: 0.4 },
        }),
        () => this.client.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: [{ role: 'user', parts: [imagePart, { text: systemPrompt }] }],
          config: { temperature: 0.4 },
        })
      )
      const raw = resp.text ?? ''
      // 提取 JSON（模型有时在 ```json ... ``` 里）
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) ?? raw.match(/\{[\s\S]*\}/)
      const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw
      let parsed: unknown = {}
      try { parsed = JSON.parse(jsonStr) } catch { parsed = { raw } }
      onProgress?.('分析完成')
      return { raw: jsonStr, parsed }
    }) as Promise<AnalysisResult>
  }

  // ── 图像生成（图片输出） ────────────────────────────────────────

  // 接受完整 parts 数组，由调用方负责组装多模态内容
  async generateImage(
    parts: Part[],
    options?: {
      model?: string
      aspectRatio?: string
      onProgress?: ProgressCallback
    }
  ): Promise<string> {
    const { base64 } = await this.generateImageWithUsage(parts, options)
    return base64
  }

  async generateImageWithUsage(
    parts: Part[],
    options?: {
      model?: string
      aspectRatio?: string
      onProgress?: ProgressCallback
    }
  ): Promise<{ base64: string; usage: TokenUsage }> {
    const { model = MODELS.IMAGE.FLASH, aspectRatio, onProgress } = options ?? {}
    return this.queue.add(async () => {
      onProgress?.('生成中…')

      const config: Record<string, unknown> = {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 1,
      }
      if (aspectRatio) config.aspectRatio = aspectRatio

      const resp = await this.withFallback(
        () => this.client.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config,
        }),
        () => this.client.models.generateContent({
          model: MODELS.IMAGE.FLASH,
          contents: [{ role: 'user', parts }],
          config,
        })
      )

      const usage: TokenUsage = {
        model,
        promptTokens: resp.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
        imageCount: 1,
      }

      const candidates = resp.candidates ?? []
      for (const cand of candidates) {
        for (const part of cand.content?.parts ?? []) {
          if (part.inlineData?.data) {
            onProgress?.('图片生成完成')
            return { base64: part.inlineData.data, usage }
          }
        }
      }

      const textParts = candidates.flatMap(c => c.content?.parts ?? []).filter(p => p.text).map(p => p.text).join(' | ')
      const finishReasons = candidates.map(c => c.finishReason).join(', ')
      console.error('[GeminiService] 无图片数据，完整响应:', JSON.stringify(resp, null, 2))
      const hint = textParts ? `模型返回文本："${textParts.slice(0, 100)}"` : `finishReason: ${finishReasons || '无'}`
      throw new GeminiError('unknown', `响应中未包含图片数据（${hint}），请检查模型权限`, false)
    }) as Promise<{ base64: string; usage: TokenUsage }>
  }

  // 并发生成 count 张，每次独立调用共享队列限速
  async generateImages(
    parts: Part[],
    count: number,
    options?: { model?: string; aspectRatio?: string }
  ): Promise<string[]> {
    const results = await this.generateImagesWithUsage(parts, count, options)
    return results.images
  }

  async generateImagesWithUsage(
    parts: Part[],
    count: number,
    options?: { model?: string; aspectRatio?: string }
  ): Promise<{ images: string[]; usages: TokenUsage[] }> {
    const results = await Promise.all(
      Array.from({ length: count }, () => this.generateImageWithUsage(parts, options))
    )
    return {
      images: results.map((r) => r.base64),
      usages: results.map((r) => r.usage),
    }
  }

  // ── Imagen 专用生成（文本 → 图片，支持完整参数） ──────────────────
  //
  // 使用 generateImages API（而非 generateContent），支持：
  //   aspectRatio / numberOfImages / guidanceScale / imageSize / outputMimeType
  //
  async generateImagenImages(
    prompt: string,
    count: number,
    options?: {
      model?: string
      aspectRatio?: string
      guidanceScale?: number
      imageSize?: string
      outputMimeType?: string
    }
  ): Promise<string[]> {
    const {
      model = MODELS.IMAGE.FLASH,
      aspectRatio,
      guidanceScale,
      imageSize,
      outputMimeType = 'image/png',
    } = options ?? {}

    return this.queue.add(async () => {
      const resp = await this.client.models.generateImages({
        model,
        prompt,
        config: {
          numberOfImages: count,
          outputMimeType,
          ...(aspectRatio    ? { aspectRatio }    : {}),
          ...(guidanceScale  !== undefined ? { guidanceScale } : {}),
          ...(imageSize      ? { imageSize }      : {}),
        },
      })

      const results: string[] = []
      for (const generated of resp.generatedImages ?? []) {
        const bytes = generated.image?.imageBytes
        if (bytes) results.push(bytes)
      }

      if (results.length === 0) {
        throw new GeminiError('unknown', 'Imagen 响应中未包含图片数据，请检查模型权限', false)
      }
      return results
    }) as Promise<string[]>
  }

  // ── 指数退避重试 ───────────────────────────────────────────────

  private async withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    try {
      return await primary()
    } catch (e) {
      const err = classifyError(e)
      if (err.retryable) {
        console.warn('[GeminiService] primary failed, trying fallback:', err.message)
        try {
          return await fallback()
        } catch (e2) {
          throw classifyError(e2)
        }
      }
      throw err
    }
  }

  // 等待队列清空
  async drain(): Promise<void> {
    await this.queue.onIdle()
  }

  get pendingCount(): number {
    return this.queue.size + this.queue.pending
  }
}

// ── 单例工厂（从 Zustand store 的 API Key 创建） ──────────────────

let _instance: GeminiService | null = null
let _lastKey = ''

export function getGeminiService(apiKey: string): GeminiService {
  if (!_instance || apiKey !== _lastKey) {
    _instance = new GeminiService(apiKey)
    _lastKey = apiKey
  }
  return _instance
}
