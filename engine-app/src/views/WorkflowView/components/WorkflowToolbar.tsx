import { useEffect, useRef, useState } from 'react'
import { Play, Square, Save, Plus, Download, Upload, ChevronDown } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import { saveWorkflowJSON, loadWorkflowJSON } from '../../../services/FileService'
import type { WorkflowDefinition } from '../../../types'
import SaveDialog from './SaveDialog'

interface WorkflowToolbarProps {
  onRun: () => void
  onStop: () => void
}

export default function WorkflowToolbar({ onRun, onStop }: WorkflowToolbarProps) {
  const {
    isRunning, rfNodes, isDirty,
    currentWorkflowId, currentWorkflowName,
    setRfNodes, setRfEdges, markClean,
    createWorkflow, saveAsWorkflow, saveCurrentWorkflow,
  } = useAppStore()

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // JSON 下拉 click-outside 关闭
  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  // 新建：有未保存修改时先确认
  const handleNew = () => {
    if (isDirty && currentWorkflowId) {
      setShowDirtyConfirm(true)
      return
    }
    createWorkflow()
  }

  const handleNewConfirmed = () => {
    setShowDirtyConfirm(false)
    markClean()
    createWorkflow()
  }

  // 保存：有当前工作流则覆盖，否则弹命名框
  const handleSave = async () => {
    if (currentWorkflowId) {
      await saveCurrentWorkflow()
      showToast(`已保存「${currentWorkflowName}」`)
    } else {
      setShowSaveDialog(true)
    }
  }

  const handleSaveAs = () => setShowSaveDialog(true)

  const handleSaveDialogConfirm = async (name: string) => {
    setShowSaveDialog(false)
    await saveAsWorkflow(name)
    showToast(`已保存「${name}」`)
  }

  // 导出 JSON
  const handleExportJSON = async () => {
    setShowExportMenu(false)
    const { rfNodes: nodes, rfEdges: edges } = useAppStore.getState()
    const now = Date.now()
    const wf: WorkflowDefinition = {
      id: currentWorkflowId ?? crypto.randomUUID(),
      name: currentWorkflowName ?? '未命名工作流',
      status: 'draft',
      createdAt: now, updatedAt: now,
      nodes: nodes.map((n) => ({
        id: n.id, type: n.type ?? '',
        position: n.position, width: n.width, height: n.height,
        data: n.data as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    }
    try {
      await saveWorkflowJSON(wf, `${wf.name}.json`)
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e)
    }
  }

  // 导入 JSON
  const handleImportJSON = async () => {
    setShowExportMenu(false)
    try {
      const data = await loadWorkflowJSON() as WorkflowDefinition
      setRfNodes(data.nodes.map((n) => ({
        id: n.id, type: n.type, position: n.position,
        width: n.width, height: n.height, data: n.data,
      })))
      setRfEdges(data.edges.map((e) => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
      })))
      // 导入视为新的未保存状态，不关联已有工作流
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') console.error(e)
    }
  }

  const btn = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    opts?: { primary?: boolean; danger?: boolean; disabled?: boolean }
  ) => (
    <button
      onClick={onClick}
      disabled={opts?.disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-40"
      style={{
        background: opts?.primary ? '#fff' : opts?.danger ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
        color: opts?.primary ? '#000' : opts?.danger ? '#f87171' : 'var(--text-primary)',
        border: `1px solid ${opts?.primary ? 'transparent' : opts?.danger ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
      }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <>
      <div
        className="flex items-center gap-2 px-4 flex-shrink-0 relative"
        style={{ height: 44, borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}
      >
        {btn('新建', <Plus className="w-3.5 h-3.5" />, handleNew)}

        {/* 导入/导出下拉 — click-toggle 修复 hover 失效问题 */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <Download className="w-3.5 h-3.5" />
            JSON
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {showExportMenu && (
            <div
              className="absolute top-full left-0 mt-1 w-32 rounded-lg overflow-hidden z-50"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
            >
              <button
                onClick={handleExportJSON}
                className="w-full text-left px-3 py-2 text-xs transition-all hover:bg-white/5 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Download size={11} /> 导出 JSON
              </button>
              <button
                onClick={handleImportJSON}
                className="w-full text-left px-3 py-2 text-xs transition-all hover:bg-white/5 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Upload size={11} /> 导入 JSON
              </button>
            </div>
          )}
        </div>

        {/* 分隔线 */}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />

        {btn('另存为', <Save className="w-3.5 h-3.5" />, handleSaveAs)}
        {btn('保存', <Save className="w-3.5 h-3.5" />, handleSave, { primary: true, disabled: rfNodes.length === 0 })}

        {/* 当前工作流名称 + 未保存红点 */}
        <div style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {currentWorkflowName ? (
            <>
              <span style={{ fontSize: 12, color: '#555', fontWeight: 400 }}>
                {currentWorkflowName}
              </span>
              {isDirty && (
                <span
                  title="有未保存的修改"
                  style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }}
                />
              )}
            </>
          ) : (
            <span style={{ fontSize: 12, color: '#333' }}>未保存</span>
          )}
        </div>

        {isRunning && btn('取消', <Square className="w-3.5 h-3.5" />, onStop, { danger: true })}
        {btn('运行', <Play className="w-3.5 h-3.5" />, onRun, { primary: true, disabled: rfNodes.length === 0 })}
      </div>

      {/* 未保存修改确认条 */}
      {showDirtyConfirm && (
        <div style={{
          padding: '8px 16px',
          background: 'rgba(239,68,68,0.08)',
          borderBottom: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: '#f87171' }}>
            「{currentWorkflowName}」有未保存的修改，继续新建将丢失这些更改
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowDirtyConfirm(false)}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#888' }}
            >
              取消
            </button>
            <button
              onClick={handleNewConfirmed}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              继续新建
            </button>
          </div>
        </div>
      )}

      {showSaveDialog && (
        <SaveDialog
          defaultName={currentWorkflowName ? `${currentWorkflowName} 副本` : ''}
          onConfirm={handleSaveDialogConfirm}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}

      {/* Toast 提示 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(30,30,30,0.95)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '8px 16px',
          fontSize: 12, color: '#e0e0e0',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 9999, pointerEvents: 'none',
          animation: 'fadeInUp 0.15s ease',
        }}>
          ✓ {toast}
        </div>
      )}
      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateX(-50%) translateY(6px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`}</style>
    </>
  )
}
