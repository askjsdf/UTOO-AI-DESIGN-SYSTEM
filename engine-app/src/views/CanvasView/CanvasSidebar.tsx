import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Send, Loader2, Image as ImageIcon, ChevronDown, X, AlertCircle, ChevronUp, Lightbulb,
} from 'lucide-react'

function UtooIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return <img src="/favicon.svg" alt="UTOO" style={{ width: size, height: size, display: 'block', ...style }} />
}
import { streamText, tool, stepCountIs } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import type { Editor, TLShapeId } from '@tldraw/tldraw'
import { useAppStore } from '../../store/appStore'
import { enqueueSelectedImages } from './workflowSend'
import { insertBase64ImagesIntoCanvas, createPlaceholderShape, replacePlaceholderWithDataUrl, calculateNextInsertPosition } from './canvasImageUtils'
import { GeminiService } from '../../services/GeminiService'
import { MODELS } from '../../config/models'
import type { ChatMessage } from '../../types'

interface Props {
  editor: Editor | null
}

// ── 子组件 ──────────────────────────────────────────────────────────

function TriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{
      width: 40, height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 12,
      background: '#0e0e0e', borderLeft: '1px solid rgba(255,255,255,0.07)',
    }}>
      <button onClick={onClick} title="打开 UTOO AI" style={{
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)',
        borderRadius: 8, cursor: 'pointer', color: '#D4AF37',
      }}>
        <UtooIcon size={18} />
      </button>
    </div>
  )
}

function CollapseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="13" y="2" width="2" height="12" rx="1" fill="currentColor" opacity="0.6" />
      <path d="M10 8L6 4.5v7L10 8z" fill="currentColor" />
    </svg>
  )
}

// [think]...[/think] 可折叠思考块
function ThinkBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
          background: expanded ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)',
          border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8,
          cursor: 'pointer', color: '#818cf8', fontSize: 11, fontWeight: 500,
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.12)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = expanded ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.05)')}
      >
        <Lightbulb size={11} fill={expanded ? 'rgba(99,102,241,0.4)' : 'none'} />
        思考过程
        <span style={{ marginLeft: 2, fontSize: 10, opacity: 0.7 }}>{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>
      {expanded && (
        <div style={{
          marginTop: 6, padding: '10px 12px',
          background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: '4px 12px 12px 12px',
          fontSize: 11, color: '#a5b4fc', lineHeight: 1.7,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 280, overflowY: 'auto',
        }}>
          {content}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: { id: string; role: string; content: string } }) {
  const isUser = msg.role === 'user'

  // 解析 [think]...[/think] 块（只在 assistant 消息里出现）
  if (!isUser) {
    const thinkMatch = msg.content.match(/^\[think\]([\s\S]*?)\[\/think\]\n([\s\S]*)$/)
    if (thinkMatch) {
      const planText = thinkMatch[1].trim()
      const summaryText = thinkMatch[2].trim()
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 12, gap: 6 }}>
          <ThinkBlock content={planText} />
          {summaryText && (
            <div style={{
              maxWidth: '85%', padding: '8px 12px',
              borderRadius: '4px 12px 12px 12px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 12, lineHeight: 1.65, color: '#d0d0d0',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {summaryText}
            </div>
          )}
        </div>
      )
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{
        maxWidth: '85%', padding: '8px 12px',
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        background: isUser ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.05)',
        border: isUser ? '1px solid rgba(212,175,55,0.2)' : '1px solid rgba(255,255,255,0.08)',
        fontSize: 12, lineHeight: 1.65,
        color: isUser ? '#e8d9a0' : '#d0d0d0',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

// 思考模式：规划步骤气泡（蓝色调）
function ThinkStepBubble({ step, content }: { step: string; content?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 4, paddingLeft: 2 }}>{step}</div>
      {content && (
        <div style={{
          padding: '8px 12px', borderRadius: '12px 12px 12px 4px',
          background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)',
          fontSize: 11, color: '#a5b4fc', lineHeight: 1.6, whiteSpace: 'pre-wrap',
          maxHeight: 180, overflowY: 'auto',
        }}>
          {content}
        </div>
      )}
    </div>
  )
}

// 生成完成后在聊天里展示缩略图
function GeneratedThumbnails({ images }: { images: string[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: '#444', marginBottom: 6, paddingLeft: 2 }}>生成结果（已添加到画布）</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {images.map((b64, i) => (
          <img
            key={i}
            src={`data:image/png;base64,${b64}`}
            alt={`生成图片 ${i + 1}`}
            style={{
              width: 100, height: 70, objectFit: 'cover',
              borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// 工具调用进度指示
function ToolCallBubble({ label }: { label: string }) {
  return (
    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Loader2 size={12} color="#D4AF37" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: '#666' }}>{label}</span>
    </div>
  )
}

// 附件图片缩略图条
function AttachedImages({ previews, onRemove }: { previews: string[]; onRemove: (i: number) => void }) {
  if (previews.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, padding: '8px 12px 0', flexWrap: 'wrap' }}>
      {previews.map((src, i) => (
        <div key={i} style={{ position: 'relative' }}>
          <img src={src} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }} />
          <button
            onClick={() => onRemove(i)}
            style={{
              position: 'absolute', top: -4, right: -4, width: 14, height: 14,
              borderRadius: '50%', background: '#333', border: 'none', cursor: 'pointer',
              color: '#aaa', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>
      ))}
    </div>
  )
}

const TEXT_MODELS = [
  { id: MODELS.TEXT.FLASH,     label: 'Gemini 3 Flash' },
  { id: MODELS.TEXT.PRO,       label: 'Gemini 3.1 Pro' },
  { id: MODELS.TEXT.FLASH_LITE, label: 'Gemini 3.1 Flash Lite' },
]

const IMAGE_MODELS = [
  { id: MODELS.IMAGE.PRO,   label: 'Nano Banana Pro' },
  { id: MODELS.IMAGE.FLASH, label: 'Nano Banana 2' },
]

// ── 主组件 ─────────────────────────────────────────────────────────

export default function CanvasSidebar({ editor }: Props) {
  const [open, setOpen] = useState(true)
  const [thinkMode, setThinkMode] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolCallLabel, setToolCallLabel] = useState<string | null>(null)   // 工具调用进行中的提示
  const [thinkStep, setThinkStep] = useState<{ step: string; content?: string } | null>(null)
  const [latestGenImages, setLatestGenImages] = useState<string[]>([])      // 本次生成的图片（非持久化）

  const [attachedBase64, setAttachedBase64] = useState<string[]>([])
  const [attachedPreviews, setAttachedPreviews] = useState<string[]>([])

  const [textModelId, setTextModelId] = useState(TEXT_MODELS[0].id)
  const [imageModelId, setImageModelId] = useState(IMAGE_MODELS[0].id)
  const [showModelPicker, setShowModelPicker] = useState(false)

  const [imageCount, setImageCount] = useState(0)
  const [workflowId, setWorkflowId] = useState('')
  const [enqueueing, setEnqueueing] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 本次流式生成中收到的图片（execute 回调写入，stream 结束后转 state）
  const pendingImagesRef = useRef<string[]>([])

  const settings = useAppStore((s) => s.settings)
  const workflows = useAppStore((s) => s.workflows)
  const chatMessages = useAppStore((s) => s.chatMessages)
  const currentProjectId = useAppStore((s) => s.currentCanvasProjectId)
  const addChatMessage = useAppStore((s) => s.addChatMessage)
  const clearProjectChat = useAppStore((s) => s.clearProjectChat)
  const canvasAttachRequest = useAppStore((s) => s.canvasAttachRequest)
  const setCanvasAttachRequest = useAppStore((s) => s.setCanvasAttachRequest)
  const addChatTokenUsage = useAppStore((s) => s.addChatTokenUsage)

  const apiKey = settings.geminiApiKey

  // 画布 AI 按钮点击 → 自动附加图片 + 展开侧边栏
  useEffect(() => {
    if (!canvasAttachRequest || canvasAttachRequest.length === 0) return
    setAttachedBase64((prev) => [...prev, ...canvasAttachRequest])
    setAttachedPreviews((prev) => [...prev, ...canvasAttachRequest.map((b) => `data:image/png;base64,${b}`)])
    setOpen(true)
    setCanvasAttachRequest(null)
  }, [canvasAttachRequest, setCanvasAttachRequest])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingContent, thinkStep, latestGenImages])

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const count = editor.getSelectedShapes().filter((s) => s.type === 'image').length
      setImageCount(count)
    }
    update()
    const unsub = editor.store.listen(update)
    return unsub
  }, [editor])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const removeAttached = (i: number) => {
    setAttachedBase64((prev) => prev.filter((_, idx) => idx !== i))
    setAttachedPreviews((prev) => prev.filter((_, idx) => idx !== i))
  }

  const pushMsg = useCallback(async (role: 'user' | 'assistant', content: string) => {
    if (!currentProjectId) return
    const msg: ChatMessage = { id: crypto.randomUUID(), projectId: currentProjectId, role, content, createdAt: Date.now() }
    await addChatMessage(msg)
  }, [currentProjectId, addChatMessage])

  const aiMessages = useMemo(() =>
    chatMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    [chatMessages]
  )

  // ── 智能对话模式（工具调用自动判断是否生图）────────────────────────
  const handleAgentSubmit = useCallback(async (text: string, attached: string[]) => {
    if (!apiKey) { await pushMsg('assistant', '请先在设置页面配置 Gemini API Key。'); return }

    setIsLoading(true)
    setStreamingContent('')
    setToolCallLabel(null)
    setLatestGenImages([])
    pendingImagesRef.current = []
    abortRef.current = new AbortController()

    const google = createGoogleGenerativeAI({ apiKey })
    const svc = new GeminiService(apiKey)
    const capturedEditor = editor

    // 构造带附图的最后一条用户消息
    type ContentPart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType: string }
    const lastUserParts: ContentPart[] = [
      ...attached.map((b64): ContentPart => ({ type: 'image', image: b64, mimeType: 'image/png' })),
      { type: 'text', text },
    ]

    try {
      const result = streamText({
        model: google(textModelId),
        system: `你是 UTOO AI，UTOO 设计工作台的智能创意助手，专注于香水品牌设计、视觉方向、CMF、图像创意等领域。
用简洁自然的中文与用户对话。
当用户请求生成、绘制、创建图片时，必须调用 generateImage 工具，自动将图片添加到画布。
生成图片前可以先用一句话说明你的创作意图，然后立即调用工具，不要等待用户确认。`,
        messages: [
          ...aiMessages,
          { role: 'user' as const, content: lastUserParts },
        ],
        stopWhen: stepCountIs(5),
        abortSignal: abortRef.current.signal,
        tools: {
          generateImage: tool({
            description: '生成图片并自动添加到画布',
            inputSchema: z.object({
              prompt: z.string().describe('详细的英文图像生成提示词'),
              label: z.string().describe('中文简短描述，如"一只猫"'),
            }),
            execute: async ({ prompt, label }): Promise<{ success: boolean; label: string; error?: string }> => {
              setToolCallLabel(`🎨 正在生成：${label}…`)

              // 提前在画布上创建占位符
              let placeholderShapeId: TLShapeId | null = null
              if (capturedEditor) {
                const { x, y } = calculateNextInsertPosition(capturedEditor, 512, 512)
                placeholderShapeId = createPlaceholderShape(capturedEditor, x, y, 512, 512)
              }

              try {
                const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
                  ...attached.map((b64) => ({ inlineData: { mimeType: 'image/png', data: b64 } })),
                  { text: prompt },
                ]
                const { base64: b64, usage } = await svc.generateImageWithUsage(parts, { model: imageModelId })
                addChatTokenUsage(usage)
                const dataUrl = `data:image/png;base64,${b64}`
                if (capturedEditor) {
                  if (placeholderShapeId) {
                    await replacePlaceholderWithDataUrl(capturedEditor, placeholderShapeId, dataUrl)
                  } else {
                    await insertBase64ImagesIntoCanvas(capturedEditor, [b64])
                  }
                }
                pendingImagesRef.current.push(b64)
                setToolCallLabel(null)
                return { success: true, label }
              } catch (err) {
                if (capturedEditor && placeholderShapeId) {
                  capturedEditor.deleteShape(placeholderShapeId)
                }
                setToolCallLabel(null)
                return { success: false, label, error: (err as Error).message }
              }
            },
          }),
        },
      })

      let textFull = ''
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          textFull += part.text
          setStreamingContent(textFull)
        }
      }

      await pushMsg('assistant', textFull || '✓ 完成')
      setLatestGenImages([...pendingImagesRef.current])
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      await pushMsg('assistant', `出错了：${(e as Error).message}`)
    } finally {
      setIsLoading(false)
      setStreamingContent('')
      setToolCallLabel(null)
      abortRef.current = null
    }
  }, [apiKey, editor, aiMessages, textModelId, imageModelId, pushMsg])

  // ── 思考模式（复杂任务拆分 → 并行生图）────────────────────────────
  const handleThinkSubmit = useCallback(async (text: string, attached: string[]) => {
    if (!apiKey || !editor) { await pushMsg('assistant', '请先配置 API Key 并打开画布。'); return }

    setIsLoading(true)
    setLatestGenImages([])
    pendingImagesRef.current = []
    abortRef.current = new AbortController()

    const google = createGoogleGenerativeAI({ apiKey })
    const svc = new GeminiService(apiKey)

    type ContentPart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType: string }
    const userParts: ContentPart[] = [
      ...attached.map((b64): ContentPart => ({ type: 'image', image: b64, mimeType: 'image/png' })),
      {
        type: 'text',
        text: `分析以下创意需求，制定图片生成计划。
输出严格的 JSON，不要有任何额外文字：
{
  "analysis": "用一两句话描述你对需求的理解",
  "tasks": [
    { "id": 1, "description": "中文描述这张图的用途", "prompt": "detailed English image generation prompt" },
    ...
  ]
}
任务数量根据需求合理拆分，通常 2-6 张。
需求：${text}`,
      },
    ]

    try {
      // Step 1：规划
      setThinkStep({ step: '🧠 规划中…', content: '' })
      const planResult = streamText({
        model: google(MODELS.TEXT.PRO),
        messages: [{ role: 'user' as const, content: userParts }],
        abortSignal: abortRef.current.signal,
      })

      let planText = ''
      for await (const chunk of planResult.textStream) {
        planText += chunk
        setThinkStep({ step: '🧠 任务规划', content: planText })
      }

      if (abortRef.current?.signal.aborted) return

      // 解析 JSON 计划
      interface TaskPlan {
        analysis?: string
        tasks?: Array<{ id: number; description: string; prompt: string }>
      }
      let plan: TaskPlan = {}
      try {
        const jsonMatch = planText.match(/\{[\s\S]*\}/)
        if (jsonMatch) plan = JSON.parse(jsonMatch[0]) as TaskPlan
      } catch { /* 降级处理 */ }

      const tasks = plan.tasks ?? [{ id: 1, description: text, prompt: text }]

      // Step 2：并行生成（先创建占位符，再并行生图，逐一替换）
      setThinkStep({ step: `🎨 并行生成 ${tasks.length} 张图片…`, content: tasks.map((t) => `• ${t.description}`).join('\n') })

      // 提前创建所有占位符（顺序排列，calculateNextInsertPosition 会自动考虑前一个占位符）
      const placeholderIds: TLShapeId[] = []
      for (let pi = 0; pi < tasks.length; pi++) {
        const { x, y } = calculateNextInsertPosition(editor, 512, 512)
        placeholderIds.push(createPlaceholderShape(editor, x, y, 512, 512))
      }

      const results = await Promise.allSettled(
        tasks.map(async (task, idx) => {
          const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
            ...attached.map((b64) => ({ inlineData: { mimeType: 'image/png', data: b64 } })),
            { text: task.prompt },
          ]
          const { base64: b64, usage } = await svc.generateImageWithUsage(parts, { model: imageModelId })
          addChatTokenUsage(usage)
          await replacePlaceholderWithDataUrl(editor, placeholderIds[idx], `data:image/png;base64,${b64}`)
          return b64
        })
      )

      // 清理失败任务的占位符
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          try { editor.deleteShape(placeholderIds[idx]) } catch { /* 已被删除则忽略 */ }
        }
      })

      const b64s: string[] = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map((r) => r.value)

      if (b64s.length > 0) {
        setLatestGenImages(b64s)
      }

      setThinkStep(null)

      // 把规划过程嵌入消息，供 MessageBubble 渲染可折叠思考块
      const planReadable = [
        plan.analysis ? `分析：${plan.analysis}` : '',
        '',
        tasks.map((t, i) => `${i + 1}. ${t.description}\n   提示词：${t.prompt}`).join('\n\n'),
      ].filter(s => s !== undefined && s !== null).join('\n').trim()

      const summary = [
        `✓ 已生成 ${b64s.length}/${tasks.length} 张图片并添加到画布`,
        b64s.length < tasks.length ? `⚠ ${tasks.length - b64s.length} 张生成失败` : '',
      ].filter(Boolean).join('\n')

      await pushMsg('assistant', `[think]\n${planReadable}\n[/think]\n${summary}`)
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      setThinkStep(null)
      await pushMsg('assistant', `生成失败：${(e as Error).message}`)
    } finally {
      setIsLoading(false)
      setThinkStep(null)
      abortRef.current = null
    }
  }, [apiKey, editor, imageModelId, pushMsg])

  // ── 统一提交 ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading || !currentProjectId) return

    const attached = [...attachedBase64]
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setAttachedBase64([])
    setAttachedPreviews([])
    setLatestGenImages([])

    await pushMsg('user', text)

    if (thinkMode) {
      await handleThinkSubmit(text, attached)
    } else {
      await handleAgentSubmit(text, attached)
    }
  }, [input, isLoading, currentProjectId, attachedBase64, thinkMode, pushMsg, handleAgentSubmit, handleThinkSubmit])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setIsLoading(false)
    setStreamingContent('')
    setToolCallLabel(null)
    setThinkStep(null)
  }

  const handleWorkflowSend = async () => {
    if (!workflowId || enqueueing || !editor) return
    setEnqueueing(true)
    try {
      const { ok, error } = await enqueueSelectedImages(workflowId, editor)
      if (!ok) { alert(error); return }
      setStatusMsg(`✓ 已入队 ${imageCount} 个任务`)
      setTimeout(() => setStatusMsg(''), 2500)
    } finally {
      setEnqueueing(false)
    }
  }

  const canWorkflowSend = !!workflowId && !enqueueing && imageCount > 0
  const currentTextModel = TEXT_MODELS.find((m) => m.id === textModelId)!

  if (!open) return <TriggerButton onClick={() => setOpen(true)} />

  return (
    <div style={{
      width: 300, height: '100%', display: 'flex', flexDirection: 'column',
      background: '#0e0e0e', borderLeft: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
    }}>
      {/* ── Header ── */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        <UtooIcon size={18} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', flex: 1, letterSpacing: 0.3 }}>UTOO AI</span>
        {chatMessages.length > 0 && (
          <button
            onClick={() => currentProjectId && clearProjectChat(currentProjectId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
          >清空</button>
        )}
        <button onClick={() => setOpen(false)} style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#555',
        }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#aaa')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
        ><CollapseIcon /></button>
      </div>

      {/* ── 无 API Key 提示 ── */}
      {!apiKey && (
        <div style={{
          margin: 12, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0,
        }}>
          <AlertCircle size={13} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, color: '#f87171', lineHeight: 1.5 }}>
            未配置 API Key，请前往<b>设置</b>页面填写 Gemini API Key。
          </span>
        </div>
      )}

      {/* ── 对话区域 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0' }}>
        {chatMessages.length === 0 && !streamingContent && !thinkStep ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 10, textAlign: 'center',
          }}>
            <UtooIcon size={32} style={{ opacity: 0.25 }} />
            <div style={{ fontSize: 12, color: '#333', lineHeight: 1.7 }}>
              你好，我是 UTOO AI<br />
              <span style={{ fontSize: 11, color: '#2a2a2a' }}>
                {thinkMode ? '思考模式：复杂任务自动拆分并行生成' : '直接告诉我你的想法，我会自动判断是否生图'}
              </span>
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg, idx) => (
              <div key={msg.id}>
                <MessageBubble msg={msg} />
                {/* 在最后一条 assistant 消息后展示本次生成的缩略图 */}
                {msg.role === 'assistant' && idx === chatMessages.length - 1 && latestGenImages.length > 0 && !isLoading && (
                  <GeneratedThumbnails images={latestGenImages} />
                )}
              </div>
            ))}

            {/* 流式文本气泡 */}
            {streamingContent && (
              <MessageBubble msg={{ id: 'streaming', role: 'assistant', content: streamingContent }} />
            )}

            {/* 工具调用进度 */}
            {toolCallLabel && <ToolCallBubble label={toolCallLabel} />}

            {/* 思考模式规划步骤 */}
            {thinkStep && <ThinkStepBubble step={thinkStep.step} content={thinkStep.content} />}

            {/* 通用 loading dots（初始等待） */}
            {isLoading && !streamingContent && !toolCallLabel && !thinkStep && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  padding: '8px 12px', borderRadius: '12px 12px 12px 4px',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', gap: 4, alignItems: 'center', width: 'fit-content',
                }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{
                      width: 5, height: 5, borderRadius: '50%', background: '#555',
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`, display: 'inline-block',
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* ── 工作流附件（仅选中图片时显示） ── */}
      {imageCount > 0 && (
        <div style={{ margin: '8px 12px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px 4px' }}>
            <Send size={12} color="#888" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ccc', flex: 1 }}>工作流处理</span>
            <button onClick={() => editor?.selectNone()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 0, display: 'flex' }}><X size={12} /></button>
          </div>
          <div style={{ padding: '2px 12px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ImageIcon size={11} color="#555" />
            <span style={{ fontSize: 11, color: '#666' }}>已选 <span style={{ color: '#aaa', fontWeight: 600 }}>{imageCount}</span> 张图片</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '0 10px 10px' }}>
            <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} disabled={enqueueing}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '5px 7px', fontSize: 11, color: workflowId ? '#ddd' : '#555', outline: 'none', cursor: 'pointer', minWidth: 0 }}>
              <option value="">选择工作流…</option>
              {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button onClick={handleWorkflowSend} disabled={!canWorkflowSend}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: 'none', background: canWorkflowSend ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)', color: canWorkflowSend ? '#2dd4bf' : '#333', fontSize: 11, fontWeight: 500, cursor: canWorkflowSend ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
              {enqueueing ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
              {statusMsg || (enqueueing ? '入队…' : '发送')}
            </button>
          </div>
        </div>
      )}

      {/* ── 输入区 ── */}
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, marginTop: 8 }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, overflow: 'visible' }}>

          {/* 附件缩略图 */}
          <AttachedImages previews={attachedPreviews} onRemove={removeAttached} />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={apiKey
              ? (thinkMode ? '描述复杂任务，AI 会拆分并行生成… (Enter 发送)' : '告诉我你的想法… (Enter 发送)')
              : '请先配置 API Key…'}
            disabled={!apiKey || isLoading}
            rows={3}
            style={{
              width: '100%', background: 'none', border: 'none', outline: 'none', resize: 'none',
              fontSize: 12, color: '#e0e0e0', lineHeight: 1.6, padding: '12px 14px 8px',
              minHeight: 72, maxHeight: 160, overflowY: 'auto', fontFamily: 'inherit',
              boxSizing: 'border-box', opacity: apiKey ? 1 : 0.4,
            }}
          />

          {/* 底部工具栏 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 4 }}>


            {/* 文本模型选择 */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => !thinkMode && setShowModelPicker((v) => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '4px 7px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6, cursor: thinkMode ? 'default' : 'pointer', color: '#888', fontSize: 11, fontWeight: 500,
                opacity: thinkMode ? 0.5 : 1,
              }}>
                <UtooIcon size={13} />
                <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentTextModel.label}
                </span>
                {!thinkMode && (showModelPicker ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
              </button>
              {showModelPicker && !thinkMode && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
                  background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, overflow: 'hidden', zIndex: 100,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)', minWidth: 160,
                }}>
                  {TEXT_MODELS.map((m) => (
                    <button key={m.id} onClick={() => { setTextModelId(m.id); setShowModelPicker(false) }}
                      style={{
                        width: '100%', textAlign: 'left', padding: '8px 12px',
                        background: m.id === textModelId ? 'rgba(212,175,55,0.1)' : 'transparent',
                        border: 'none', cursor: 'pointer', fontSize: 11,
                        color: m.id === textModelId ? '#D4AF37' : '#aaa',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                      onMouseEnter={(e) => { if (m.id !== textModelId) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                      onMouseLeave={(e) => { if (m.id !== textModelId) e.currentTarget.style.background = 'transparent' }}
                    >
                      {m.id === textModelId ? <span style={{ color: '#D4AF37', fontSize: 10 }}>✓</span> : <span style={{ width: 14 }} />}
                      {m.label}
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px 4px' }}>
                    <div style={{ fontSize: 10, color: '#444', marginBottom: 4 }}>生图模型</div>
                    {IMAGE_MODELS.map((m) => (
                      <button key={m.id} onClick={() => { setImageModelId(m.id) }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '6px 0',
                          background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11,
                          color: m.id === imageModelId ? '#D4AF37' : '#888',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        {m.id === imageModelId ? <span style={{ color: '#D4AF37', fontSize: 10 }}>✓</span> : <span style={{ width: 14 }} />}
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: 1 }} />

            {/* 思考模式灯泡开关 */}
            <button
              onClick={() => setThinkMode((v) => !v)}
              title={thinkMode ? '思考模式（点击关闭）' : '快速模式（点击开启思考）'}
              style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: thinkMode ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${thinkMode ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8, cursor: 'pointer',
                color: thinkMode ? '#a5b4fc' : '#444',
                transition: 'all 0.2s',
              }}
            >
              <Lightbulb size={14} fill={thinkMode ? 'rgba(99,102,241,0.3)' : 'none'} />
            </button>

            {/* 停止 / 发送 */}
            {isLoading ? (
              <button onClick={handleStop} style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 9, cursor: 'pointer', color: '#f87171', flexShrink: 0,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: '#f87171' }} />
              </button>
            ) : (
              <button onClick={input.trim() ? handleSubmit : undefined} style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: input.trim() ? '#D4AF37' : '#1e1e1e', border: 'none',
                borderRadius: 9, cursor: input.trim() ? 'pointer' : 'default',
                color: input.trim() ? '#000' : '#666', flexShrink: 0, transition: 'all 0.15s',
              }}>
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } }
      `}</style>
    </div>
  )
}
