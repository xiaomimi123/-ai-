import { useEffect, useRef } from 'react'
import { Download, X, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { taskApi, type TaskInfo } from './api/taskApi'

// G3: 单个异步任务卡片 —— 轮询 / 进度 / 图片 / 下载 / 取消
// 主题：仅用 CSS 变量；唯一例外是错误红（#D9534F，全站无对应变量）。

export interface SessionTask {
  taskId: string
  model: string
  prompt: string
  status: string        // submitted/queued/in_progress/completed/failed/canceled
  progress?: number
  imageUrls?: string[]
  error?: string
  createdAt: number
}

interface Props {
  task: SessionTask
  onUpdate: (patch: Partial<SessionTask>) => void
}

const TERMINAL = new Set(['completed', 'failed', 'canceled'])

// 从上游 raw 结构提取图片 URL —— 兼容 apimart / jimeng 两种格式
// apimart : data.data.result.images[].url[0..n]
// jimeng  : data.data.image_urls[]
function extractImageURLs(raw: unknown): string[] {
  if (raw == null) return []
  let data: unknown
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return []
  }
  if (!data || typeof data !== 'object') return []

  // 兼容 view.result.raw 可能是 { data: {...} } 也可能直接是 {...}
  const root = data as Record<string, unknown>
  const inner = (root.data && typeof root.data === 'object')
    ? root.data as Record<string, unknown>
    : root

  // apimart 格式
  const result = inner.result as Record<string, unknown> | undefined
  const images = result?.images
  if (Array.isArray(images)) {
    const urls: string[] = []
    for (const im of images) {
      if (im && typeof im === 'object') {
        const u = (im as Record<string, unknown>).url
        if (Array.isArray(u)) {
          for (const x of u) if (typeof x === 'string') urls.push(x)
        } else if (typeof u === 'string') {
          urls.push(u)
        }
      }
    }
    if (urls.length > 0) return urls
  }

  // jimeng 格式
  const jimengURLs = inner.image_urls
  if (Array.isArray(jimengURLs)) {
    return jimengURLs.filter((u): u is string => typeof u === 'string')
  }

  return []
}

export default function TaskCard({ task, onUpdate }: Props) {
  const errCountRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 终态：不启动轮询
    if (TERMINAL.has(task.status)) return
    if (intervalRef.current != null) return

    const tick = async () => {
      try {
        const view = await taskApi.get(task.taskId) as TaskInfo & { result?: { raw?: unknown } | unknown }
        errCountRef.current = 0
        const status = typeof view.status === 'string' ? view.status : task.status

        const patch: Partial<SessionTask> = { status }
        if (typeof view.progress === 'number') patch.progress = view.progress
        if (view.error?.message) patch.error = view.error.message

        if (status === 'completed') {
          // result 可能是 { raw: ... } 也可能直接是 raw 本身（后端实现差异兜底）
          const result = view.result as Record<string, unknown> | undefined
          const raw = result && 'raw' in result ? result.raw : result
          const urls = extractImageURLs(raw)
          if (urls.length > 0) patch.imageUrls = urls
        }
        onUpdate(patch)

        if (TERMINAL.has(status) && intervalRef.current != null) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch {
        errCountRef.current += 1
        if (errCountRef.current >= 5 && intervalRef.current != null) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
          onUpdate({ status: 'failed', error: '查询任务状态多次失败' })
        }
      }
    }

    // 首次延迟 5s（给上游一点时间），之后每 3s
    firstTimeoutRef.current = setTimeout(() => {
      void tick()
      intervalRef.current = setInterval(() => { void tick() }, 3000)
    }, 5000)

    return () => {
      if (firstTimeoutRef.current != null) clearTimeout(firstTimeoutRef.current)
      if (intervalRef.current != null) clearInterval(intervalRef.current)
      firstTimeoutRef.current = null
      intervalRef.current = null
    }
  }, [task.taskId, task.status, onUpdate])

  const onCancel = async () => {
    try {
      await taskApi.cancel(task.taskId)
      onUpdate({ status: 'canceled' })
    } catch {
      /* 静默：用户重试或自然失败 */
    }
  }

  const onDownload = (url: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = `task-${task.taskId.slice(0, 12)}.png`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const elapsed = Math.max(0, Math.floor((Date.now() - task.createdAt) / 1000))
  const isInProgress = !TERMINAL.has(task.status)
  const progress = Math.max(0, Math.min(100, task.progress ?? 0))

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid var(--accent)',
      padding: 16,
      borderRadius: 'var(--radius-sm)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text)' }}>
          {task.taskId.slice(0, 24)}{task.taskId.length > 24 ? '...' : ''}
        </span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock size={12} /> {elapsed}s
        </span>
      </div>

      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 10 }}>
        {task.prompt}
      </div>

      {isInProgress && (
        <>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            marginBottom: 10,
          }}>
            <div style={{
              background: 'var(--accent)',
              height: '100%',
              width: `${progress}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 500 }}>
              {task.status.toUpperCase()} · {progress}%
            </span>
            <button
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: '1px solid #D9534F',
                color: '#D9534F',
                padding: '4px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <X size={12} /> 取消
            </button>
          </div>
        </>
      )}

      {task.status === 'completed' && task.imageUrls && task.imageUrls.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {task.imageUrls.map(url => (
              <div key={url} style={{ width: 200 }}>
                <img
                  src={url}
                  alt="generated"
                  style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }}
                  loading="lazy"
                />
                <button
                  onClick={() => onDownload(url)}
                  className="btn btn-accent"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    width: '100%',
                    justifyContent: 'center',
                    marginTop: 6,
                    fontSize: 12,
                    padding: '6px 10px',
                  }}
                >
                  <Download size={12} /> 下载
                </button>
              </div>
            ))}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={12} /> 提示：上游图片 24 小时内可下载，逾期失效
          </div>
        </>
      )}

      {task.status === 'completed' && (!task.imageUrls || task.imageUrls.length === 0) && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>已完成，但未解析到图片 URL</div>
      )}

      {task.status === 'failed' && (
        <div style={{ color: '#D9534F', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={14} /> 失败：{task.error || '未知错误'}
        </div>
      )}

      {task.status === 'canceled' && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>已取消</div>
      )}
    </div>
  )
}
