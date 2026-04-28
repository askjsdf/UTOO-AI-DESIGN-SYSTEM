import { useMemo, useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { TokenUsage } from '../../types'

// ── 定价常量（与 appStore._runNextTask 保持一致）──────────────────
const INPUT_PRICE_PER_M = 0.50   // $/1M prompt tokens
const OUTPUT_PRICE_PER_M = 60.00 // $/1M output tokens

// ── 工具函数 ──────────────────────────────────────────────────────

function calcCost(usages: TokenUsage[]): number {
  return usages.reduce((s, u) =>
    s + u.promptTokens * INPUT_PRICE_PER_M / 1_000_000
      + u.outputTokens * OUTPUT_PRICE_PER_M / 1_000_000
  , 0)
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '< $0.001'
  return `$${usd.toFixed(3)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function modelLabel(modelId: string): string {
  if (modelId.includes('pro')) return 'Nano Banana Pro'
  if (modelId.includes('flash')) return 'Nano Banana 2'
  return modelId
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const date = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return `${date} ${time}`
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Period = '24h' | '7d' | '30d' | 'all' | 'custom'

const PERIOD_LABELS: Record<Exclude<Period, 'custom'>, string> = {
  '24h': '24小时',
  '7d': '近7天',
  '30d': '近30天',
  'all': '全部',
}

// ── 主视图 ────────────────────────────────────────────────────────

export default function UsageView() {
  const tasks = useAppStore((s) => s.tasks)
  const chatTokenUsages = useAppStore((s) => s.chatTokenUsages)

  const [period, setPeriod] = useState<Period>('30d')

  // 自定义时间范围（pending = 弹窗中正在编辑，applied = 已应用）
  const defaultStart = () => {
    const d = new Date(); d.setDate(d.getDate() - 7); return toDatetimeLocal(d)
  }
  const defaultEnd = () => toDatetimeLocal(new Date())

  const [pendingStart, setPendingStart] = useState(defaultStart)
  const [pendingEnd, setPendingEnd] = useState(defaultEnd)
  const [appliedStart, setAppliedStart] = useState(defaultStart)
  const [appliedEnd, setAppliedEnd] = useState(defaultEnd)
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭弹窗
  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const { cutoff, ceiling } = useMemo(() => {
    const now = Date.now()
    if (period === '24h') return { cutoff: now - 86400_000, ceiling: now }
    if (period === '7d') return { cutoff: now - 7 * 86400_000, ceiling: now }
    if (period === '30d') return { cutoff: now - 30 * 86400_000, ceiling: now }
    if (period === 'custom') return {
      cutoff: new Date(appliedStart).getTime(),
      ceiling: new Date(appliedEnd).getTime(),
    }
    return { cutoff: 0, ceiling: Infinity }
  }, [period, appliedStart, appliedEnd])

  // 有 token 记录的已完成任务（在时间段内）
  const relevantTasks = useMemo(() =>
    tasks.filter((t) =>
      t.completedAt &&
      t.completedAt >= cutoff &&
      t.completedAt <= ceiling &&
      t.tokenUsages && t.tokenUsages.length > 0
    ),
    [tasks, cutoff, ceiling]
  )

  const taskUsages = useMemo(() =>
    relevantTasks.flatMap((t) => t.tokenUsages ?? []),
    [relevantTasks]
  )

  // 对话生图用量（按时间段过滤，无时间戳的在"全部"下显示）
  const filteredChatUsages = useMemo(() =>
    chatTokenUsages.filter((u) =>
      u.timestamp ? (u.timestamp >= cutoff && u.timestamp <= ceiling) : period === 'all'
    ),
    [chatTokenUsages, cutoff, ceiling, period]
  )

  const allUsages = useMemo(() =>
    [...taskUsages, ...filteredChatUsages],
    [taskUsages, filteredChatUsages]
  )

  // ── 汇总统计 ─────────────────────────────────────────────────────
  const totalCost = calcCost(allUsages)
  const totalPromptTokens = allUsages.reduce((s, u) => s + u.promptTokens, 0)
  const totalOutputTokens = allUsages.reduce((s, u) => s + u.outputTokens, 0)
  const totalImages = allUsages.reduce((s, u) => s + (u.imageCount ?? 0), 0)

  // ── 按模型分组 ────────────────────────────────────────────────────
  const byModel = useMemo(() => {
    const map = new Map<string, TokenUsage[]>()
    for (const u of allUsages) {
      if (!map.has(u.model)) map.set(u.model, [])
      map.get(u.model)!.push(u)
    }
    return Array.from(map.entries()).map(([model, usages]) => ({
      model,
      label: modelLabel(model),
      cost: calcCost(usages),
      promptTokens: usages.reduce((s, u) => s + u.promptTokens, 0),
      outputTokens: usages.reduce((s, u) => s + u.outputTokens, 0),
      images: usages.reduce((s, u) => s + (u.imageCount ?? 0), 0),
      callCount: usages.length,
    })).sort((a, b) => b.cost - a.cost)
  }, [allUsages])

  // ── 统一明细列表（工作流任务 + 对话生图，按时间倒序）────────────────
  type DetailItem =
    | { kind: 'task'; ts: number; task: typeof relevantTasks[0] }
    | { kind: 'chat'; ts: number; usage: typeof chatTokenUsages[0] }

  const detailItems = useMemo((): DetailItem[] => {
    const taskItems: DetailItem[] = relevantTasks.map((t) => ({
      kind: 'task', ts: t.completedAt ?? 0, task: t,
    }))
    const chatItems: DetailItem[] = filteredChatUsages
      .filter((u) => !!u.timestamp)
      .map((u) => ({ kind: 'chat', ts: u.timestamp!, usage: u }))
    return [...taskItems, ...chatItems].sort((a, b) => b.ts - a.ts).slice(0, 50)
  }, [relevantTasks, filteredChatUsages])

  const isEmpty = allUsages.length === 0

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '20px 24px',
  }

  const statCard = (label: string, value: string, sub?: string) => (
    <div style={{ ...cardStyle, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )

  const handleApplyRange = () => {
    setAppliedStart(pendingStart)
    setAppliedEnd(pendingEnd)
    setPeriod('custom')
    setShowPicker(false)
  }

  // 自定义范围显示标签
  const customLabel = period === 'custom'
    ? (() => {
        const s = new Date(appliedStart)
        const e = new Date(appliedEnd)
        const fmt = (d: Date) =>
          `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        return `${fmt(s)} – ${fmt(e)}`
      })()
    : null

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-base)', padding: '32px 40px' }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>用量统计</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Nano Banana API 调用量与预估费用（按官方定价计算）
          </p>
        </div>

        {/* 时间筛选 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
            {(['24h', '7d', '30d', 'all'] as Exclude<Period, 'custom'>[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500,
                  background: period === p ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: period === p ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* 日历按钮 + 弹窗 */}
          <div style={{ position: 'relative' }} ref={pickerRef}>
            <button
              onClick={() => {
                setPendingStart(appliedStart)
                setPendingEnd(appliedEnd)
                setShowPicker((v) => !v)
              }}
              title="自定义时间范围"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: period === 'custom' ? 'rgba(255,255,255,0.1)' : 'var(--bg-panel)',
                color: period === 'custom' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              <Calendar size={13} />
              {customLabel ?? '自定义'}
            </button>

            {showPicker && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
                background: '#1a1a1a', border: '1px solid var(--border)', borderRadius: 12,
                padding: '20px', width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', marginBottom: 16 }}>自定义时间范围</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>开始时间</span>
                    <input
                      type="datetime-local"
                      value={pendingStart}
                      onChange={(e) => setPendingStart(e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6, padding: '7px 10px', color: '#e0e0e0', fontSize: 12,
                        outline: 'none', colorScheme: 'dark',
                      }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>结束时间</span>
                    <input
                      type="datetime-local"
                      value={pendingEnd}
                      onChange={(e) => setPendingEnd(e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6, padding: '7px 10px', color: '#e0e0e0', fontSize: 12,
                        outline: 'none', colorScheme: 'dark',
                      }}
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    onClick={() => setShowPicker(false)}
                    style={{
                      flex: 1, padding: '7px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                      background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleApplyRange}
                    disabled={!pendingStart || !pendingEnd || pendingStart >= pendingEnd}
                    style={{
                      flex: 2, padding: '7px', borderRadius: 6, border: 'none',
                      background: (!pendingStart || !pendingEnd || pendingStart >= pendingEnd)
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(255,255,255,0.15)',
                      color: (!pendingStart || !pendingEnd || pendingStart >= pendingEnd)
                        ? 'var(--text-secondary)'
                        : '#fff',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    确认应用
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14 }}>暂无用量数据</div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>
            运行工作流后，API 调用量将在此显示
          </div>
        </div>
      ) : (
        <>
          {/* 汇总卡片 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {statCard('预估总费用', formatCost(totalCost), '基于官方 token 定价')}
            {statCard('生成图片', `${totalImages} 张`, `共 ${relevantTasks.length} 次任务`)}
            {statCard('输入 Token', formatTokens(totalPromptTokens), `$${(totalPromptTokens * INPUT_PRICE_PER_M / 1_000_000).toFixed(4)}`)}
            {statCard('输出 Token', formatTokens(totalOutputTokens), `$${(totalOutputTokens * OUTPUT_PRICE_PER_M / 1_000_000).toFixed(4)}`)}
          </div>

          {/* 模型分布 */}
          {byModel.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', marginBottom: 16 }}>模型分布</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {byModel.map(({ model, label, cost, promptTokens, outputTokens, images, callCount }) => {
                  const pct = totalCost > 0 ? Math.round(cost / totalCost * 100) : 0
                  const isPro = model.includes('pro')
                  const barColor = isPro ? '#a78bfa' : '#2dd4bf'
                  return (
                    <div key={model}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: barColor, display: 'inline-block', flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 13, color: '#e0e0e0' }}>{label}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {callCount} 次调用 · {images > 0 ? `${images} 张图` : `${formatTokens(promptTokens + outputTokens)} tokens`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pct}%</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', minWidth: 60, textAlign: 'right' }}>
                            {formatCost(cost)}
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.4s' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 5 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          输入 {formatTokens(promptTokens)} tokens · ${(promptTokens * INPUT_PRICE_PER_M / 1_000_000).toFixed(4)}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          输出 {formatTokens(outputTokens)} tokens · ${(outputTokens * OUTPUT_PRICE_PER_M / 1_000_000).toFixed(4)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 任务明细（统一按时间倒序） */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', marginBottom: 14 }}>任务明细</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* 表头 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 160px 60px 80px 80px',
                padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)',
              }}>
                <span>任务</span>
                <span style={{ textAlign: 'right' }}>时间</span>
                <span style={{ textAlign: 'right' }}>张数</span>
                <span style={{ textAlign: 'right' }}>Tokens</span>
                <span style={{ textAlign: 'right' }}>费用</span>
              </div>

              {detailItems.map((item, idx) => {
                if (item.kind === 'task') {
                  const { task } = item
                  const usages = task.tokenUsages ?? []
                  const cost = task.estimatedCostUsd ?? calcCost(usages)
                  const tokens = usages.reduce((s, u) => s + u.promptTokens + u.outputTokens, 0)
                  const images = usages.reduce((s, u) => s + (u.imageCount ?? 0), 0)
                  const models = [...new Set(usages.map((u) => modelLabel(u.model)))].join(' · ')
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr 160px 60px 80px 80px',
                        padding: '9px 10px', borderRadius: 6,
                        background: 'rgba(255,255,255,0.02)',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: '#e0e0e0' }}>{task.workflowName}</div>
                        {models && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{models}</div>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
                        {formatTime(task.completedAt!)}
                      </div>
                      <div style={{ fontSize: 12, color: '#e0e0e0', textAlign: 'right' }}>
                        {images > 0 ? `${images} 张` : '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#e0e0e0', textAlign: 'right' }}>
                        {formatTokens(tokens)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: cost > 0.01 ? '#a78bfa' : '#e0e0e0', textAlign: 'right' }}>
                        {formatCost(cost)}
                      </div>
                    </div>
                  )
                } else {
                  const { usage: u } = item
                  const cost = calcCost([u])
                  const tokens = u.promptTokens + u.outputTokens
                  return (
                    <div
                      key={`chat-${idx}`}
                      style={{
                        display: 'grid', gridTemplateColumns: '1fr 160px 60px 80px 80px',
                        padding: '9px 10px', borderRadius: 6,
                        background: 'rgba(45,212,191,0.03)',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, color: '#e0e0e0', display: 'flex', alignItems: 'center', gap: 6 }}>
                          AI 对话生图
                          <span style={{
                            fontSize: 9, padding: '1px 5px', borderRadius: 4,
                            background: 'rgba(45,212,191,0.15)', color: '#2dd4bf',
                          }}>对话</span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{modelLabel(u.model)}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
                        {u.timestamp ? formatTime(u.timestamp) : '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#e0e0e0', textAlign: 'right' }}>
                        {(u.imageCount ?? 0) > 0 ? `${u.imageCount} 张` : '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#e0e0e0', textAlign: 'right' }}>
                        {formatTokens(tokens)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: cost > 0.01 ? '#a78bfa' : '#e0e0e0', textAlign: 'right' }}>
                        {formatCost(cost)}
                      </div>
                    </div>
                  )
                }
              })}

              {detailItems.length === 0 && (
                <div style={{ padding: '24px 10px', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                  该时间段内无记录
                </div>
              )}
            </div>
          </div>

          {/* 定价说明 */}
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              💡 定价基准：输入 $0.50/1M tokens · 输出 $60.00/1M tokens（Gemini 官方 preview 定价）。
              Preview 阶段实际可能免费或有赠额，请以{' '}
              <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer"
                style={{ color: '#2dd4bf', textDecoration: 'none' }}>
                Google AI 官网
              </a>
              {' '}账单为准。
            </div>
          </div>
        </>
      )}
    </div>
  )
}
