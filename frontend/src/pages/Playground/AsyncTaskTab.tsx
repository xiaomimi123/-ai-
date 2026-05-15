import { useCallback, useMemo, useState } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { taskApi, type TaskInfo, type TaskSubmitPayload } from './api/taskApi'
import TaskCard, { type SessionTask } from './TaskCard'

// 异步任务 Tab（G3：提交表单 + 会话内任务列表；卡片轮询/进度/下载/取消见 TaskCard）
// 主题严格遵循森林科技风：仅用 CSS 变量；禁蓝紫；禁 AI emoji。

// Loader2 旋转动画样式（与 ImageTab 同款，按需注入一次）
if (typeof document !== 'undefined' && !document.getElementById('pg-spin-style')) {
  const style = document.createElement('style')
  style.id = 'pg-spin-style'
  style.textContent = '@keyframes pg-spin { to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}

interface ModelConfig {
  id: string
  label: string
  eta: string
  supportsRatio: boolean
  supportsRes: boolean
}

const MODELS: ModelConfig[] = [
  { id: 'gpt-image-2', label: 'GPT Image 2 (apimart)', eta: '30-60秒', supportsRatio: true,  supportsRes: true  },
  { id: 'jimeng-v3.0', label: '即梦 v3.0',              eta: '60-90秒', supportsRatio: false, supportsRes: false },
]

const RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16']
const RESOLUTIONS = ['1k', '2k', '4k']
const N_OPTIONS = [1, 2, 3, 4]
const MAX_SESSION_TASKS = 20

// SessionTask 类型在 ./TaskCard 中定义（单一来源）

// 后端响应可能形如 { task_id, status, ... } 或 OpenAI 兼容 { data: [{ task_id }] }
// 这里两种都兼容提取 task_id
function extractTaskId(resp: unknown): string | undefined {
  if (!resp || typeof resp !== 'object') return undefined
  const r = resp as Record<string, unknown>
  if (typeof r.task_id === 'string') return r.task_id
  const data = r.data
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown> | undefined
    const tid = first?.task_id
    if (typeof tid === 'string') return tid
  }
  return undefined
}

function extractStatus(resp: unknown): string {
  if (!resp || typeof resp !== 'object') return 'submitted'
  const r = resp as Record<string, unknown>
  if (typeof r.status === 'string') return r.status
  return 'submitted'
}

export default function AsyncTaskTab() {
  const [model, setModel] = useState<string>(MODELS[0].id)
  const [prompt, setPrompt] = useState<string>('')
  const [size, setSize] = useState<string>('16:9')
  const [resolution, setResolution] = useState<string>('1k')
  const [n, setN] = useState<number>(1)
  const [tasks, setTasks] = useState<SessionTask[]>([])
  const [submitting, setSubmitting] = useState<boolean>(false)

  const currentModel = useMemo(
    () => MODELS.find(m => m.id === model) ?? MODELS[0],
    [model],
  )

  // G3：子卡片用 onUpdate 推回状态；useCallback 稳定引用避免 useEffect 多次触发
  const updateTask = useCallback((taskId: string, patch: Partial<SessionTask>) => {
    setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, ...patch } : t))
  }, [])

  const onSubmit = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      toast.error('请输入提示词')
      return
    }
    if (submitting) return

    setSubmitting(true)
    try {
      const payload: TaskSubmitPayload = {
        model,
        prompt: trimmed,
        n,
      }
      if (currentModel.supportsRatio) payload.size = size
      if (currentModel.supportsRes) payload.resolution = resolution

      const resp = await taskApi.submit(payload) as TaskInfo & { data?: unknown }
      const taskId = extractTaskId(resp)
      if (!taskId) {
        toast.error('上游未返回 task_id')
        return
      }

      const status = extractStatus(resp)
      setTasks(prev => [{
        taskId,
        model,
        prompt: trimmed,
        status,
        createdAt: Date.now(),
      }, ...prev].slice(0, MAX_SESSION_TASKS))

      setPrompt('')
      toast.success('任务已提交')

      // 提交后滚动到顶部，让新任务卡片可见
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '提交失败'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* 表单卡片 */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 20,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Sparkles size={18} color="var(--accent)" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
            异步生成
          </h2>
        </div>

        {/* 模型 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>模型</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            style={selectStyle}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label} · {m.eta}</option>
            ))}
          </select>
        </div>

        {/* 提示词 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>提示词（Prompt）</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="一只橘猫坐在窗台上看夕阳..."
            rows={3}
            maxLength={1000}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 2 }}>
            {prompt.length} / 1000
          </div>
        </div>

        {/* 参数区 */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          {currentModel.supportsRatio && (
            <div style={{ minWidth: 120 }}>
              <label style={labelStyle}>比例</label>
              <select value={size} onChange={e => setSize(e.target.value)} style={selectStyle}>
                {RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {currentModel.supportsRes && (
            <div style={{ minWidth: 120 }}>
              <label style={labelStyle}>分辨率</label>
              <select value={resolution} onChange={e => setResolution(e.target.value)} style={selectStyle}>
                {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div style={{ minWidth: 100 }}>
            <label style={labelStyle}>张数</label>
            <select
              value={n}
              onChange={e => setN(parseInt(e.target.value, 10))}
              style={selectStyle}
            >
              {N_OPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>

        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 12 }}>
          预估扣费: $0.006/张 · 异步生成约 30-60 秒，请耐心等待
        </div>

        <button
          onClick={onSubmit}
          disabled={submitting || !prompt.trim()}
          className="btn btn-accent"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 18px',
          }}
        >
          {submitting
            ? <Loader2 size={16} style={{ animation: 'pg-spin 1s linear infinite' }} />
            : <Send size={16} />
          }
          {submitting ? '提交中...' : '提交任务'}
        </button>
      </div>

      {/* 任务列表（每张卡自身轮询、显示进度、下载、取消） */}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        当前会话任务（最多 {MAX_SESSION_TASKS} 个，刷新后丢失）
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {tasks.length === 0 && (
          <div style={{
            background: 'var(--card)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            <div style={{ fontSize: 14, marginBottom: 16 }}>暂无任务，提交一个开始</div>
            <div style={{ fontSize: 12, marginBottom: 8 }}>试试这些提示词：</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {[
                '一只橘猫坐在窗台上看夕阳，水彩画风格',
                '星空下的古老城堡，电影感',
                '雪山脚下的森林木屋，黄昏',
                '科幻风格的霓虹城市，夜景',
              ].map(p => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {tasks.map(t => (
          <TaskCard
            key={t.taskId}
            task={t}
            onUpdate={(patch) => updateTask(t.taskId, patch)}
          />
        ))}
      </div>

      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-secondary)',
        marginTop: 16,
        fontStyle: 'italic',
      }}>
        提示：任务历史仅本次会话保存，刷新页面后丢失。完成的图片请及时下载（24小时有效）。
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--muted)',
  fontSize: 12,
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
