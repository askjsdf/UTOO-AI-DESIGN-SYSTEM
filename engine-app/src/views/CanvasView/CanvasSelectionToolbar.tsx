/**
 * 多选图片时出现的浮动工具栏（单选已由 CustomImageToolbar 原生集成处理）
 * 仅在选中 ≥2 张图片时显示
 */
import { useState, useEffect } from 'react'
import { Send, Loader2, Library, CheckCircle2 } from 'lucide-react'
import type { Editor, TLShapeId } from '@tldraw/tldraw'
import { useAppStore } from '../../store/appStore'
import { enqueueSelectedImages } from './workflowSend'
import { writeFile } from '../../services/LibraryFileService'
import { useLibraryStore } from '../../store/libraryStore'
import { getImageFile } from '../../services/imageStore'

interface Props {
  editor: Editor
}

export default function CanvasSelectionToolbar({ editor }: Props) {
  const [imageShapeCount, setImageShapeCount] = useState(0)
  const [targetWorkflowId, setTargetWorkflowId] = useState('')
  const [enqueueing, setEnqueueing] = useState(false)
  const [sendStatus, setSendStatus] = useState('')       // 发送给工作流的状态
  const [savingToLibrary, setSavingToLibrary] = useState(false)
  const [libraryStatus, setLibraryStatus] = useState('') // 存入资产库的状态

  const workflows = useAppStore((s) => s.workflows)
  const libraryRoot = useAppStore((s) => s.libraryRoot)
  const libraryReady = useAppStore((s) => s.libraryReady)

  useEffect(() => {
    const update = () => {
      const count = editor.getSelectedShapes().filter((s) => s.type === 'image').length
      setImageShapeCount(count)
    }
    update()
    const unsub = editor.store.listen(update)
    return unsub
  }, [editor])

  // 单选由原生 ImageToolbar 处理，这里只处理多选
  if (imageShapeCount < 2) return null

  const handleSend = async () => {
    if (!targetWorkflowId || enqueueing) return
    setEnqueueing(true)
    setSendStatus('发送中…')
    try {
      const { ok, error } = await enqueueSelectedImages(targetWorkflowId, editor)
      if (!ok) { alert(error); setSendStatus(''); return }
      setSendStatus(`${imageShapeCount} 个已加入队列`)
      setTimeout(() => setSendStatus(''), 2500)
    } catch (e) {
      alert(`发送失败：${(e as Error).message}`)
      setSendStatus('')
    } finally {
      setEnqueueing(false)
    }
  }

  const handleSaveToLibrary = async () => {
    if (!libraryRoot || savingToLibrary) return
    setSavingToLibrary(true)
    setLibraryStatus('导出中…')

    try {
      // 优先存入当前选中文件夹，否则存入根目录
      const libStore = useLibraryStore.getState()
      const navTarget = libStore.navTarget
      const targetDir = navTarget?.type === 'folder' ? navTarget.handle : libraryRoot

      const imageShapes = editor.getSelectedShapes().filter((s) => s.type === 'image')
      if (imageShapes.length === 0) { setLibraryStatus(''); setSavingToLibrary(false); return }

      let count = 0
      for (const shape of imageShapes) {
        try {
          // 从 OPFS 读取原始文件，不经 tldraw 渲染管线，保留原始格式和文件大小
          const assetId = (shape as any).props?.assetId as string | undefined
          const originalFile = assetId ? await getImageFile(assetId) : null
          if (originalFile) {
            const ext = originalFile.name.split('.').pop() ?? 'png'
            const name = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
            await writeFile(targetDir, name, await originalFile.arrayBuffer())
          } else {
            // OPFS 找不到（旧格式图片）→ 用 tldraw 渲染，但不加画布背景
            const { blob } = await editor.toImage([shape.id as TLShapeId], {
              format: 'png',
              background: false,
            })
            if (blob.size === 0) continue
            const name = `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`
            await writeFile(targetDir, name, await blob.arrayBuffer())
          }
          count++
        } catch { /* 单张失败不中断 */ }
      }

      // 刷新资产库（如果当前有导航目标）
      if (libStore.navTarget) libStore.loadFiles()

      const folderHint = navTarget?.type === 'folder'
        ? `→ ${navTarget.path[navTarget.path.length - 1]}`
        : '→ 根目录'
      setLibraryStatus(`已存入 ${count} 张 ${folderHint}`)
      setTimeout(() => setLibraryStatus(''), 3000)
    } catch (e) {
      setLibraryStatus('存入失败')
      console.error('[Library] 存入失败:', e)
      setTimeout(() => setLibraryStatus(''), 2000)
    } finally {
      setSavingToLibrary(false)
    }
  }

  const canSend = !!targetWorkflowId && !enqueueing

  return (
    <>
      <div style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}>
        <span style={{ fontSize: 12, color: '#888' }}>
          已选 <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{imageShapeCount}</span> 张图片
        </span>

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />

        <select
          value={targetWorkflowId}
          onChange={(e) => setTargetWorkflowId(e.target.value)}
          disabled={enqueueing}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            color: targetWorkflowId ? '#e0e0e0' : '#555',
            outline: 'none',
            cursor: enqueueing ? 'not-allowed' : 'pointer',
            minWidth: 130,
          }}
        >
          <option value="">选择工作流…</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        {/* 发送给工作流按钮 */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: canSend ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)',
            color: canSend ? '#2dd4bf' : '#444',
            fontSize: 11, fontWeight: 500,
            cursor: canSend ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {enqueueing
            ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            : sendStatus ? <CheckCircle2 size={11} /> : <Send size={11} />
          }
          {sendStatus || '发送给工作流'}
        </button>

        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />

        {/* 存入资产库按钮 */}
        <button
          onClick={handleSaveToLibrary}
          disabled={savingToLibrary || !libraryReady}
          title="存入视觉资产库"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 6, border: 'none',
            background: libraryReady ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
            color: libraryReady ? '#D4AF37' : '#444',
            fontSize: 11, fontWeight: 500,
            cursor: libraryReady && !savingToLibrary ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {savingToLibrary
            ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            : libraryStatus ? <CheckCircle2 size={11} style={{ color: '#86efac' }} /> : <Library size={11} />
          }
          {libraryStatus || '存入资产库'}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  )
}
