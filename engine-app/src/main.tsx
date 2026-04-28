import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import '@xyflow/react/dist/style.css'
import '@tldraw/tldraw/tldraw.css'

// Phase 2.4：先注册并等待 SW 激活后再挂载 React，
// 确保首批 /__local_asset__/* 请求一定被 SW 拦截（最多等 3 秒）
async function bootstrap() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js')
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ])
    } catch (err) {
      console.warn('[SW] 注册失败（不影响核心功能）:', err)
    }
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()
