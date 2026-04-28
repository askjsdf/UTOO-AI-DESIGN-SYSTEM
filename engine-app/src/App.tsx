import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import NavigationBar from './components/NavigationBar'
import { useAppStore } from './store/appStore'
import WorkflowView from './views/WorkflowView'
import CanvasView from './views/CanvasView'
import TasksView from './views/TasksView'
import SettingsView from './views/SettingsView'
import UsageView from './views/UsageView'
import LibraryView from './views/LibraryView'
import { isMigrationDone, migrateCanvasImages, type MigrationProgress } from './services/canvasMigration'
import { runOPFSGarbageCollection } from './services/imageStore'
import { sanitizeAllTldrawIDBs } from './services/dataTransfer'

// ── 迁移进度界面 ──────────────────────────────────────────────────────

function MigrationScreen({ progress }: { progress: MigrationProgress | null }) {
  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0e0e0e',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, zIndex: 9999,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <img src="/favicon.svg" alt="UTOO" style={{ width: 48, height: 48, opacity: 0.8 }} />
      <div style={{ color: '#e0e0e0', fontSize: 15, fontWeight: 600 }}>
        正在迁移画布图片数据
      </div>
      <div style={{ color: '#555', fontSize: 12 }}>
        {progress?.phase === 'scanning' ? '扫描画布数据库…' : null}
        {progress?.phase === 'migrating' ? `迁移图片 ${progress.done} / ${progress.total}` : null}
        {!progress ? '正在准备…' : null}
      </div>
      {/* 进度条 */}
      <div style={{
        width: 280, height: 3,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: '#2dd4bf',
          width: pct + '%',
          transition: 'width 0.3s',
        }} />
      </div>
      <div style={{ color: '#444', fontSize: 11 }}>
        完成后自动进入，请勿关闭页面
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────

export default function App() {
  const initSettings = useAppStore((s) => s.initSettings)
  const initCanvasProjects = useAppStore((s) => s.initCanvasProjects)
  const initTasks = useAppStore((s) => s.initTasks)
  const initLibrary = useAppStore((s) => s.initLibrary)

  // 'checking' | 'migrating' | 'ready'
  const [migrationState, setMigrationState] = useState<'checking' | 'migrating' | 'ready'>('checking')
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null)

  useEffect(() => {
    initSettings()
    initCanvasProjects()
    initTasks()
    initLibrary()   // 独立调用，不依赖 initSettings 顺序
  }, [])

  useEffect(() => {
    // 等 SW 就绪后再检查迁移（确保 SW 能接管资产请求）
    const run = async () => {
      // 等待 SW 激活（最多 5 秒，避免无限等待）
      if ('serviceWorker' in navigator) {
        try {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 5000)),
          ])
        } catch {
          // SW 未就绪也继续（降级运行）
        }
      }

      if (isMigrationDone()) {
        // 防御性数据清理：扫描所有 tldraw IDB，把 image asset 非法 w/h 修好
        // 必须在 CanvasView 挂载之前完成，否则 tldraw schema 校验会抛错
        await sanitizeAllTldrawIDBs().catch((e) =>
          console.warn('[sanitize] tldraw IDB 清理失败（不影响功能）:', e)
        )
        setMigrationState('ready')
        // Phase 3.1：迁移已完成，后台运行 GC（每天最多一次）
        runOPFSGarbageCollection().catch((e) =>
          console.warn('[GC] 垃圾回收失败（不影响功能）:', e)
        )
        return
      }

      setMigrationState('migrating')

      try {
        await migrateCanvasImages((progress) => {
          setMigrationProgress({ ...progress })
        })
      } catch (e) {
        console.error('[Migration] failed:', e)
        // 迁移失败不阻断 app，继续运行（旧数据仍在 IndexedDB）
      }

      // 迁移完成后跑一次防御性数据清理 + 立即 GC
      await sanitizeAllTldrawIDBs().catch((e) =>
        console.warn('[sanitize] tldraw IDB 清理失败（不影响功能）:', e)
      )
      runOPFSGarbageCollection(true).catch(() => {})

      setMigrationState('ready')
    }

    run()
  }, [])

  if (migrationState !== 'ready') {
    return <MigrationScreen progress={migrationProgress} />
  }

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen bg-[var(--bg-base)]">
        <NavigationBar />
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/workflow" replace />} />
            <Route path="/workflow" element={<WorkflowView />} />
            <Route path="/canvas" element={<CanvasView />} />
            <Route path="/library" element={<LibraryView />} />
            <Route path="/batch" element={<TasksView />} />
            <Route path="/usage" element={<UsageView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
