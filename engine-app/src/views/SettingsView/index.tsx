import { useState, useRef } from 'react'
import { CheckCircle2, XCircle, Loader2, FolderOpen, Link, RefreshCw, Unlink, Library, HardDrive, Download, Upload } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { saveApiKey, saveSettings, saveOutputDirHandle } from '../../services/SettingsService'
import { pickOutputDirectory } from '../../services/FileService'
import { exportAllData, importAllData } from '../../services/dataTransfer'
import { GoogleGenAI } from '@google/genai'

export default function SettingsView() {
  const {
    settings, setSettings, workflows,
    workflowDirConnected, workflowDirHandle, workflowDirName, connectWorkflowDir, reconnectWorkflowDir, disconnectWorkflowDir,
    libraryReady,
  } = useAppStore()
  const [apiKey, setApiKey] = useState(settings.geminiApiKey)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // 数据迁移
  const importInputRef = useRef<HTMLInputElement>(null)
  const [exportStatus, setExportStatus] = useState<{ busy: boolean; msg: string; ok?: boolean } | null>(null)
  const [importStatus, setImportStatus] = useState<{ busy: boolean; msg: string; ok?: boolean } | null>(null)

  const handleTestKey = async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const client = new GoogleGenAI({ apiKey: apiKey.trim() })
      const resp = await client.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: '回复数字1',
      })
      const text = resp.text ?? ''
      if (text) {
        setTestResult({ success: true, message: '连接成功，API Key 有效' })
        setSettings({ geminiApiKey: apiKey.trim() })
        saveApiKey(apiKey.trim())
      } else {
        setTestResult({ success: false, message: '响应为空，请检查 Key 权限' })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setTestResult({ success: false, message: `连接失败：${msg}` })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveKey = () => {
    setSettings({ geminiApiKey: apiKey.trim() })
    saveApiKey(apiKey.trim())
    setTestResult({ success: true, message: 'API Key 已保存（未验证）' })
  }

  const handleChooseOutputDir = async () => {
    try {
      const handle = await pickOutputDirectory()
      setSettings({ outputDirHandle: handle, outputDirName: handle.name })
      saveSettings({ outputDirName: handle.name })
      await saveOutputDirHandle(handle)
    } catch (e) {
      // 用户取消选择
      if ((e as DOMException).name !== 'AbortError') console.error(e)
    }
  }

  const handleExport = async () => {
    setExportStatus({ busy: true, msg: '准备中…' })
    try {
      await exportAllData((msg) => setExportStatus({ busy: true, msg }))
      setExportStatus({ busy: false, msg: '导出成功，文件已下载', ok: true })
    } catch (e) {
      setExportStatus({ busy: false, msg: `导出失败：${e instanceof Error ? e.message : String(e)}`, ok: false })
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportStatus({ busy: true, msg: '正在读取文件…' })
    try {
      await importAllData(file, (msg) => setImportStatus({ busy: true, msg }))
      setImportStatus({ busy: false, msg: '导入成功！请重启应用以加载新数据。', ok: true })
    } catch (e) {
      setImportStatus({ busy: false, msg: `导入失败：${e instanceof Error ? e.message : String(e)}`, ok: false })
    }
  }

  return (
    <div className="h-full overflow-y-auto p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-semibold mb-1">系统设置</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            API Key 和输出目录配置
          </p>
        </div>

        {/* API Key */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            Gemini API Key
          </h2>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 py-2 rounded-lg text-xs transition-all"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleTestKey}
                disabled={!apiKey.trim() || testing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                测试连接
              </button>
              <button
                onClick={handleSaveKey}
                disabled={!apiKey.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: '#fff', color: '#000' }}
              >
                保存
              </button>
            </div>

            {testResult && (
              <div
                className="flex items-start gap-2 px-4 py-3 rounded-lg text-sm"
                style={{
                  background: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${testResult.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: testResult.success ? '#4ade80' : '#f87171',
                }}
              >
                {testResult.success
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                {testResult.message}
              </div>
            )}
          </div>
        </section>

        {/* 输出目录 */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            输出文件夹
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            生成的图片将保存到此文件夹。浏览器会请求一次访问权限，刷新页面后自动恢复。
          </p>
          <div className="flex gap-2 items-center">
            <div
              className="flex-1 px-4 py-2.5 rounded-lg text-sm truncate"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: settings.outputDirName ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {settings.outputDirName || '未设置，点击右侧选择文件夹'}
            </div>
            <button
              onClick={handleChooseOutputDir}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <FolderOpen className="w-4 h-4" />
              选择
            </button>
          </div>
          {settings.outputDirHandle && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              ✓ 已授权访问：{settings.outputDirName}
            </p>
          )}
        </section>

        {/* 视觉资产库 */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            视觉资产库
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            资产库使用浏览器私有存储（OPFS），无需授权，刷新后自动可用。容量取决于磁盘剩余空间（通常可用数十 GB）。
          </p>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: libraryReady ? 'rgba(34,197,94,0.08)' : 'var(--bg-card)', border: `1px solid ${libraryReady ? 'rgba(34,197,94,0.15)' : 'var(--border)'}` }}>
            <HardDrive size={14} style={{ color: libraryReady ? '#4ade80' : '#555', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="text-sm font-medium" style={{ color: libraryReady ? '#4ade80' : 'var(--text-secondary)' }}>
                {libraryReady ? '浏览器私有存储（OPFS）已就绪' : '初始化中…'}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                数据保存在本机浏览器内，清除浏览器数据会同时清除资产库内容
              </div>
            </div>
            <Library size={14} style={{ color: libraryReady ? '#4ade80' : '#333', flexShrink: 0 }} />
          </div>
        </section>

        {/* 数据备份与迁移 */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            数据备份与迁移
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            将所有数据（工作流、画布、图片、API Key）打包为一个 ZIP 文件，可在不同设备或环境之间迁移。导入会覆盖本地现有数据。
          </p>

          {/* 导出 */}
          <div className="space-y-2">
            <button
              onClick={handleExport}
              disabled={exportStatus?.busy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {exportStatus?.busy
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              导出所有数据
            </button>
            {exportStatus && !exportStatus.busy && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{
                  background: exportStatus.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${exportStatus.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: exportStatus.ok ? '#4ade80' : '#f87171',
                }}
              >
                {exportStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                {exportStatus.msg}
              </div>
            )}
            {exportStatus?.busy && (
              <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>{exportStatus.msg}</p>
            )}
          </div>

          {/* 导入 */}
          <div className="space-y-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importStatus?.busy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {importStatus?.busy
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              导入数据
            </button>
            {importStatus && !importStatus.busy && (
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                style={{
                  background: importStatus.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${importStatus.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: importStatus.ok ? '#4ade80' : '#f87171',
                }}
              >
                {importStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span className="flex-1">{importStatus.msg}</span>
                {importStatus.ok && (
                  <button
                    onClick={() => window.location.reload()}
                    className="ml-2 px-2 py-0.5 rounded text-xs font-medium shrink-0"
                    style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}
                  >
                    立即重启
                  </button>
                )}
              </div>
            )}
            {importStatus?.busy && (
              <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>{importStatus.msg}</p>
            )}
          </div>
        </section>

        {/* 工作流存储 */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            工作流存储
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            将工作流保存为本地 JSON 文件，防止因浏览器清缓存导致数据丢失。每个工作流单独存为一个文件，可直接备份或用 Git 管理。
          </p>

          {workflowDirConnected ? (
            <div className="space-y-3">
              {/* 已连接状态 */}
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, display: 'inline-block' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm font-medium" style={{ color: '#4ade80' }}>已连接</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{workflowDirName}</div>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{workflows.length} 个工作流</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={connectWorkflowDir}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <FolderOpen className="w-4 h-4" />
                  更换文件夹
                </button>
                <button
                  onClick={disconnectWorkflowDir}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  <Unlink className="w-4 h-4" />
                  断开连接
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 未连接 / 需重新授权 */}
              {workflowDirHandle ? (
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{ background: 'rgba(161,98,7,0.08)', border: '1px solid rgba(161,98,7,0.2)' }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ca8a04', flexShrink: 0, display: 'inline-block' }} />
                  <div style={{ flex: 1 }}>
                    <div className="text-sm" style={{ color: '#ca8a04' }}>需要重新授权</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{workflowDirName}</div>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-lg"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    工作流目前仅存储于浏览器 IndexedDB，清除浏览器数据后将丢失
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                {workflowDirHandle && (
                  <button
                    onClick={reconnectWorkflowDir}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ background: 'rgba(161,98,7,0.15)', border: '1px solid rgba(161,98,7,0.3)', color: '#ca8a04' }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    重新授权
                  </button>
                )}
                <button
                  onClick={connectWorkflowDir}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{ background: '#fff', color: '#000' }}
                >
                  <Link className="w-4 h-4" />
                  {workflowDirHandle ? '更换文件夹' : '连接本地文件夹'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
