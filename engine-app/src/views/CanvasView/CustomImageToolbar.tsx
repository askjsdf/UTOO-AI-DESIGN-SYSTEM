/**
 * 覆盖 tldraw 原生 ImageToolbar
 *
 * tldraw 的 DefaultImageToolbar children 是"替换"而非"追加"，
 * 所以需要手动渲染 DefaultImageToolbarContent 并自己管理 crop 状态，
 * 再在后面追加我们的工作流发送按钮。
 */
import { useState, useCallback } from 'react'
import {
  useEditor,
  useValue,
  DefaultImageToolbar,
  DefaultImageToolbarContent,
} from '@tldraw/tldraw'
import type { TLImageShape } from '@tldraw/tldraw'
import { Send, Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { enqueueSelectedImages } from './workflowSend'

export function CustomImageToolbar() {
  const editor = useEditor()
  const workflows = useAppStore((s) => s.workflows)
  const [workflowId, setWorkflowId] = useState('')
  const [loading, setLoading] = useState(false)

  // 响应式：是否处于裁剪模式（需要 useValue 才能触发重渲染）
  const isInCropTool = useValue('isInCropTool', () => editor.isIn('select.crop.'), [editor])

  // 响应式：当前选中的图片 shape ID
  const imageShapeId = useValue(
    'imageShapeId',
    () => {
      const shape = editor.getOnlySelectedShape()
      return shape?.type === 'image' ? (shape.id as TLImageShape['id']) : null
    },
    [editor]
  )

  // 复现 DefaultImageToolbar 内部的 crop 回调
  const handleManipulatingStart = useCallback(() => {
    editor.setCurrentTool('select.crop.idle')
  }, [editor])

  const handleManipulatingEnd = useCallback(() => {
    ;(editor as any).setCroppingShape?.(null)
    editor.setCurrentTool('select.idle')
  }, [editor])

  const handleSend = useCallback(async () => {
    if (!workflowId || loading) return
    setLoading(true)
    try {
      const { ok, error } = await enqueueSelectedImages(workflowId, editor)
      if (!ok) alert(error)
    } finally {
      setLoading(false)
    }
  }, [workflowId, loading, editor])

  if (!imageShapeId) return null

  const canSend = !!workflowId && !loading

  return (
    <DefaultImageToolbar>
      {/* 原生按钮（裁剪、替换、下载、ALT…） */}
      <DefaultImageToolbarContent
        imageShapeId={imageShapeId}
        isManipulating={isInCropTool}
        onEditAltTextStart={() => {}}   // 简化：暂不实现 alt text 弹窗
        onManipulatingStart={handleManipulatingStart}
        onManipulatingEnd={handleManipulatingEnd}
      />

      {/* 分隔线 */}
      <div style={{
        width: 1, height: 18,
        background: 'rgba(255,255,255,0.2)',
        margin: '0 4px',
        flexShrink: 0,
        alignSelf: 'center',
      }} />

      {/* 工作流选择 */}
      <select
        value={workflowId}
        onChange={(e) => setWorkflowId(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          height: 28,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 5,
          padding: '0 6px',
          fontSize: 11,
          color: workflowId ? '#fff' : 'rgba(255,255,255,0.35)',
          outline: 'none',
          cursor: 'pointer',
          maxWidth: 130,
          flexShrink: 0,
        }}
      >
        <option value="">选择工作流…</option>
        {workflows.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      {/* 发送按钮 */}
      <button
        onClick={handleSend}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={!canSend}
        style={{
          height: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 10px',
          borderRadius: 5,
          border: 'none',
          background: canSend ? 'rgba(20,184,166,0.25)' : 'rgba(255,255,255,0.06)',
          color: canSend ? '#2dd4bf' : 'rgba(255,255,255,0.2)',
          fontSize: 11,
          fontWeight: 500,
          cursor: canSend ? 'pointer' : 'not-allowed',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {loading
          ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
          : <Send size={11} />
        }
        {loading ? '入队…' : '发送'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </DefaultImageToolbar>
  )
}
