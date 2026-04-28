import { useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, NodeResizer, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { Code2, Plus, X, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import NodeShell from './NodeShell'
import { PORT_COLORS } from './portStyles'
import { useAppStore } from '../../../store/appStore'

// ── 类型 ─────────────────────────────────────────────────────────

export interface CodeInputSlot {
  id: string
  name: string
}

export interface CodeNodeData {
  label: string
  code: string
  inputSlots: CodeInputSlot[]
  requirement?: string  // AI 生成提示词区的需求描述
  // 运行后填充
  _outputText?: string
  _status?: string
  _startedAt?: number
  _duration?: number
}

// ── 常量 ─────────────────────────────────────────────────────────

const DEFAULT_CODE = `// inputs: { [端口名]: { text?: string, images?: string[] } }
// 返回: { text?, images? }

const raw = inputs['输入']?.text ?? ''
const data = JSON.parse(raw)
return { text: String(data) }
`

const SLOT_HANDLE_LEFT = -16

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

// ── 生成发给 LLM 的提示词 ────────────────────────────────────────

function buildPrompt(slots: CodeInputSlot[], requirement: string): string {
  const slotDesc = slots.length > 0
    ? slots.map((s) => `  - "${s.name}"：{ text?: string, images?: string[] }`).join('\n')
    : '  （当前未配置输入端口）'

  return `你是一个工作流引擎的 Code 节点助手。请根据我的需求，直接输出可执行的 JavaScript 代码。

【输出格式要求】
- 直接输出代码内容，不要用 Markdown 代码块（不要写 \`\`\`javascript）
- 不要写 function 声明，直接写函数体逻辑，最后用 return 返回结果

【运行环境】
- 代码运行在浏览器中，支持现代 JavaScript（ES2023）语法
- 支持 async/await
- 无法访问 Node.js API（fs、path 等）

【输入参数】
代码接收一个 inputs 对象，结构如下：
inputs = {
  "[端口名]": {
    text?: string,    // 上游节点输出的文本
    images?: string[] // 上游节点输出的图片（base64 字符串数组，不含 data: 前缀）
  }
}

当前节点配置的输入端口：
${slotDesc}

访问数据时请加可选链防止报错，例如：
const text = inputs['端口名']?.text ?? ''

【返回值】
必须 return 一个对象，支持以下字段：
{ text?: string, images?: string[] }
- text：字符串，传递给下游文本类节点（textDisplay、llm、imageGen 文本槽等）
- images：base64 字符串数组，传递给下游图片类节点

【我的需求】
${requirement || '（请在此填写你的需求描述）'}`
}

// ── 组件 ─────────────────────────────────────────────────────────

export default function CodeNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as CodeNodeData
  const slots: CodeInputSlot[] = d.inputSlots ?? []
  const updateNodeInternals = useUpdateNodeInternals()

  const [showPrompt, setShowPrompt] = useState(false)
  const [copied, setCopied] = useState(false)
  const reqRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, slots.length, updateNodeInternals])

  const updateData = useCallback((patch: Partial<CodeNodeData>) => {
    const nodes = useAppStore.getState().rfNodes
    useAppStore.getState().setRfNodes(
      nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    )
  }, [id])

  const stopProp = (e: React.KeyboardEvent) => e.stopPropagation()

  // ── 复制提示词 ────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    // 从 DOM ref 读取，避免依赖 Zustand 同步时序
    const req = reqRef.current?.value ?? d.requirement ?? ''
    updateData({ requirement: req })
    const prompt = buildPrompt(slots, req)
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [slots, d.requirement, updateData])

  // ── 槽操作 ──────────────────────────────────────────────────────

  const addSlot = useCallback(() => {
    const newSlot: CodeInputSlot = {
      id: `slot-${Date.now()}`,
      name: `输入${slots.length + 1}`,
    }
    updateData({ inputSlots: [...slots, newSlot] })
  }, [slots, updateData])

  const removeSlot = useCallback((slotId: string) => {
    updateData({ inputSlots: slots.filter((s) => s.id !== slotId) })
  }, [slots, updateData])

  const renameSlot = useCallback((slotId: string, name: string) => {
    updateData({
      inputSlots: slots.map((s) => s.id === slotId ? { ...s, name } : s),
    })
  }, [slots, updateData])

  return (
    <NodeShell
      title={d.label ?? 'Code'}
      icon={<Code2 size={13} />}
      selected={selected}
      runState={d as any}
      onRename={(name) => updateData({ label: name })}
    >
      <NodeResizer
        minWidth={280} minHeight={260}
        isVisible={selected}
        lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }}
        handleStyle={{ borderColor: 'rgba(255,255,255,0.3)', background: '#222' }}
      />

      {/* ── 输入端口（固定高度区域） ──────────────────────── */}
      <div style={{ flexShrink: 0, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={labelStyle}>输入端口</div>
          <button
            onClick={addSlot}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, padding: '2px 6px',
              cursor: 'pointer', color: '#aaa', fontSize: 10,
            }}
          >
            <Plus size={10} /> 添加
          </button>
        </div>

        {slots.map((slot) => (
          <div
            key={slot.id}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5, paddingLeft: 4 }}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={slot.id}
              style={{
                background: PORT_COLORS.text,
                border: '2px solid #0a0a0a',
                width: 11, height: 11,
                position: 'absolute',
                left: SLOT_HANDLE_LEFT,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
            <input
              key={slot.id + '-name'}
              defaultValue={slot.name}
              onBlur={(e) => renameSlot(slot.id, e.target.value)}
              onKeyDown={stopProp}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4, padding: '3px 6px',
                fontSize: 11, color: '#ccc', outline: 'none', minWidth: 0,
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
              onBlurCapture={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.06)')}
            />
            <button
              onClick={() => removeSlot(slot.id)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center',
                background: 'transparent', border: 'none',
                cursor: 'pointer', color: '#444', padding: 2, borderRadius: 3,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
            >
              <X size={11} />
            </button>
          </div>
        ))}

        {slots.length === 0 && (
          <div style={{ fontSize: 10, color: '#333', textAlign: 'center', padding: '4px 0' }}>
            点击"添加"配置输入端口
          </div>
        )}
      </div>

      {/* ── AI 提示词区（可折叠） ────────────────────────── */}
      <div style={{
        flexShrink: 0,
        marginBottom: 8,
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.15)',
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        {/* 折叠头部 */}
        <button
          onClick={() => setShowPrompt((v) => !v)}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 8px',
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: '#7c7cf8',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            AI 生成代码
          </span>
          {showPrompt
            ? <ChevronUp size={11} color="#7c7cf8" />
            : <ChevronDown size={11} color="#7c7cf8" />}
        </button>

        {showPrompt && (
          <div style={{ padding: '0 8px 8px' }}>
            {/* 需求描述输入框——非受控，避免 IME 冲突 */}
            <textarea
              ref={reqRef}
              defaultValue={d.requirement ?? ''}
              onBlur={(e) => { updateData({ requirement: e.target.value }); e.target.style.borderColor = 'rgba(99,102,241,0.2)' }}
              onKeyDown={stopProp}
              placeholder="描述你需要这段代码做什么，例如：从LLM输出的JSON数组中提取第一条提示词字符串"
              style={{
                width: '100%',
                height: 56,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 4,
                padding: '5px 7px',
                fontSize: 10,
                color: '#ccc',
                outline: 'none',
                resize: 'none',
                lineHeight: 1.5,
                boxSizing: 'border-box',
                marginBottom: 6,
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(99,102,241,0.5)')}
            />

            {/* 复制按钮 */}
            <button
              onClick={handleCopy}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '5px 0',
                background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(99,102,241,0.15)',
                border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(99,102,241,0.3)'}`,
                borderRadius: 4,
                cursor: 'pointer',
                color: copied ? '#4ade80' : '#a5b4fc',
                fontSize: 10,
                fontWeight: 500,
                transition: 'all 0.2s',
              }}
            >
              {copied
                ? <><Check size={10} /> 已复制！发给 LLM 即可</>
                : <><Copy size={10} /> 复制完整提示词</>}
            </button>

            <div style={{ fontSize: 9, color: '#444', marginTop: 5, lineHeight: 1.4, textAlign: 'center' }}>
              复制后粘贴给 Claude / GPT，将返回的代码粘回下方编辑框
            </div>
          </div>
        )}
      </div>

      {/* ── 代码编辑器（随卡片高度伸展） ─────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ ...labelStyle, flexShrink: 0 }}>JavaScript</div>
        <textarea
          value={d.code ?? DEFAULT_CODE}
          onChange={(e) => updateData({ code: e.target.value })}
          onKeyDown={stopProp}
          spellCheck={false}
          style={{
            flex: 1,
            width: '100%',
            minHeight: 0,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            color: '#a8d8a8',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.6,
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
        />
      </div>

      {/* ── 输出预览（固定高度，运行后显示） ────────────── */}
      {d._outputText !== undefined && (
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 6,
          marginTop: 6,
          fontSize: 10,
          color: '#555',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 56,
          overflow: 'hidden',
          lineHeight: 1.5,
        }}>
          {String(d._outputText).slice(0, 300)}{String(d._outputText).length > 300 ? '…' : ''}
        </div>
      )}

      {/* ── 输出 Handle（右侧） ───────────────────────────── */}
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        style={{
          background: PORT_COLORS.text,
          border: '2px solid #0a0a0a',
          width: 11, height: 11,
          right: -6,
        }}
        title="output"
      />
    </NodeShell>
  )
}
