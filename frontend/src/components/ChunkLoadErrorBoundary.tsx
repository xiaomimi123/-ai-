import { Component, type ReactNode } from 'react'

// 部署窗口期：用户浏览器还引用旧版 chunk 文件名（如 Models-abc123.js），
// 但服务器上新部署后旧文件被删 → dynamic import() 拿到 404 → 抛错
// 这里捕获后自动 reload 让浏览器重新拉 index.html 拿到最新 chunk hash
//
// 同时监听全局未捕获的 error 事件作为兜底（异步 chunk 加载有时不走 React 的 error 路径）

interface Props { children: ReactNode }
interface State { hasError: boolean }

const CHUNK_RELOAD_KEY = '__chunkReloadAttemptedAt'

function isChunkLoadError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)) || ''
  return /Loading chunk|dynamically imported|Failed to fetch dynamically/i.test(msg)
}

function safeReload() {
  // 防死循环：如果 5 秒内已经 reload 过一次还失败，说明真的是问题不是缓存，停止刷新
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
  if (Date.now() - last < 5000) return
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
}

export default class ChunkLoadErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    if (isChunkLoadError(error)) {
      safeReload()
      return { hasError: true }
    }
    // 不是 chunk 错误就交给上层
    throw error
  }

  componentDidMount() {
    // 兜底：监听全局未处理的 error / promise rejection
    window.addEventListener('error', this.handleGlobalError)
    window.addEventListener('unhandledrejection', this.handleRejection)
  }
  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError)
    window.removeEventListener('unhandledrejection', this.handleRejection)
  }
  handleGlobalError = (e: ErrorEvent) => {
    if (isChunkLoadError(e.error || e.message)) safeReload()
  }
  handleRejection = (e: PromiseRejectionEvent) => {
    if (isChunkLoadError(e.reason)) safeReload()
  }

  render() {
    if (this.state.hasError) {
      // reload 已触发，给个空白避免闪烁
      return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>检测到新版本，正在刷新...</div>
    }
    return this.props.children
  }
}
