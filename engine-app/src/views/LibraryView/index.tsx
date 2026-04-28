import { useEffect } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useLibraryStore } from '../../store/libraryStore'
import LibraryTreePanel from './LibraryTreePanel'
import LibraryFileGrid from './LibraryFileGrid'
import LibraryInspector from './LibraryInspector'

export default function LibraryView() {
  const { libraryRoot, libraryReady } = useAppStore()
  const { setLibraryRoot, loadFiles, refreshAllTags, navTarget, setNavTarget } = useLibraryStore()

  // 将 libraryRoot 注入 libraryStore
  useEffect(() => {
    setLibraryRoot(libraryRoot)
    if (libraryRoot) {
      // 初始化：默认显示全部文件 + 标签聚合
      if (!navTarget) setNavTarget({ type: 'all' })
      refreshAllTags()
    }
  }, [libraryRoot])

  // navTarget 变化时自动重新加载文件列表
  useEffect(() => {
    if (libraryRoot && navTarget) loadFiles()
  }, [navTarget, libraryRoot])

  // ── OPFS 初始化中 ───────────────────────────────────────────────

  if (!libraryReady) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#111', gap: 10, color: '#333',
      }}>
        <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: 12 }}>初始化资产库…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── OPFS 不可用 ─────────────────────────────────────────────────

  if (!libraryRoot) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#111', gap: 12, color: '#555',
      }}>
        <AlertTriangle size={28} style={{ color: '#ca8a04' }} />
        <div style={{ textAlign: 'center', fontSize: 13, color: '#888' }}>
          浏览器私有存储（OPFS）不可用
        </div>
        <div style={{ fontSize: 11, color: '#444', textAlign: 'center', maxWidth: 280, lineHeight: 1.7 }}>
          请使用 Chrome / Edge 最新版，并确保未处于无痕模式
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden', background: '#111' }}>
      <LibraryTreePanel
        rootHandle={libraryRoot}
        rootName="视觉资产库"
      />

      <LibraryFileGrid />

      <LibraryInspector />
    </div>
  )
}
