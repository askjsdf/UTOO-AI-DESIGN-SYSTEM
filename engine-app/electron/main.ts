import { app, BrowserWindow, shell } from 'electron'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'

const isDev = !app.isPackaged

// ── MIME 类型表 ───────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.json': 'application/json',
  '.txt':  'text/plain',
  '.map':  'application/json',
}

// ── 本地静态文件服务器 ────────────────────────────────────────────────
// 在随机端口起一个 HTTP 服务器提供 dist/ 的静态文件。
// localhost 被浏览器视为 secure context，Service Worker / OPFS 完全支持。

function getDistPath(): string {
  // app.getAppPath() 在打包后指向 app.asar（或 app/），
  // Electron 的 fs 模块对 asar 有透明支持，readFile 可直接读取。
  return path.join(app.getAppPath(), 'dist')
}

function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const distPath = getDistPath()

    const server = http.createServer((req, res) => {
      let urlPath = (req.url || '/').split('?')[0]

      // SPA fallback：无扩展名路径一律返回 index.html
      let filePath: string
      if (!path.extname(urlPath) || urlPath === '/') {
        filePath = path.join(distPath, 'index.html')
      } else {
        filePath = path.join(distPath, urlPath)
      }

      // 防路径穿越
      if (!filePath.startsWith(distPath)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404)
          res.end('Not found')
          return
        }
        const ext = path.extname(filePath)
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        })
        res.end(data)
      })
    })

    // 端口 0 让系统自动选择空闲端口，避免冲突
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        resolve(addr.port)
      } else {
        reject(new Error('Cannot get server port'))
      }
    })

    server.on('error', reject)
  })
}

// ── 创建窗口 ──────────────────────────────────────────────────────────

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'UTOO 设计引擎',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    // 开发时加载 Vite dev server
    await win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const port = await startServer()
    await win.loadURL(`http://localhost:${port}`)
  }

  // 外部链接在系统默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── 生命周期 ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
