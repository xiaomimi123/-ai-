import { useState } from 'react'
import { Download, Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { playgroundApi } from '../../api'

interface Props {
  model: string
  quota: number
  onQuotaMaybeChanged: () => void
}

interface GeneratedItem {
  id: number
  url: string       // data:image/...;base64,...
  prompt: string
  model: string
  createdAt: number
}

// Loader2 旋转动画（全局 index.css 没有 .spin，就近注入一份）
if (typeof document !== 'undefined' && !document.getElementById('pg-spin-style')) {
  const style = document.createElement('style')
  style.id = 'pg-spin-style'
  style.textContent = '@keyframes pg-spin { to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '1:1 正方形' },
  { value: '1792x1024', label: '16:9 横向' },
  { value: '1024x1792', label: '9:16 纵向' },
]

// 会话内最多保留 20 张；超出淘汰最老
const MAX_HISTORY = 20

export default function ImageTab({ model, quota, onQuotaMaybeChanged }: Props) {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<GeneratedItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const isNanoBanana = model.toLowerCase().includes('flash-image') || model.toLowerCase().includes('nano-banana')

  const submit = async () => {
    const p = prompt.trim()
    if (!p || loading) return
    if (quota <= 0) {
      toast.error('余额不足，请先充值')
      return
    }
    if (!model) {
      toast.error('请先选择模型')
      return
    }
    setLoading(true)
    try {
      const r = await playgroundApi.generateImage({
        model,
        prompt: p,
        // Nano Banana 不支持 size 参数，留空让后端忽略
        ...(isNanoBanana ? {} : { size }),
      })
      if (!r.data.success) {
        toast.error(r.data.message || '生成失败')
        return
      }
      const urls: string[] = r.data.data.images || []
      if (urls.length === 0) {
        toast.error('未返回图片')
        return
      }
      const now = Date.now()
      const items: GeneratedItem[] = urls.map((u, i) => ({
        id: now + i,
        url: u,
        prompt: p,
        model,
        createdAt: now,
      }))
      setHistory(prev => [...items, ...prev].slice(0, MAX_HISTORY))
      setSelectedId(items[0].id)
      onQuotaMaybeChanged()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }

  const download = (item: GeneratedItem) => {
    const a = document.createElement('a')
    a.href = item.url
    a.download = `lingjing-${item.createdAt}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const current = history.find(h => h.id === selectedId) || history[0]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '320px 1fr',
      gap: 20,
      minHeight: 'calc(100vh - 260px)',
    }}>
      {/* 左侧控制栏 */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: 'fit-content',
      }}>
        <div style={{
          fontSize: 12,
          color: 'var(--warning)',
          background: 'var(--warning-bg)',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          lineHeight: 1.5,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>生成的图片不会保存在云端，请及时下载</span>
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>
            描述（Prompt）
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="描述你想生成的图像，越具体效果越好"
            rows={6}
            maxLength={1000}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: 10,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 2 }}>
            {prompt.length} / 1000
          </div>
        </div>

        {!isNanoBanana && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>
              尺寸
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SIZE_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSize(s.value)}
                  style={{
                    padding: '6px 10px',
                    background: size === s.value ? 'var(--primary-light)' : 'var(--surface)',
                    border: `1px solid ${size === s.value ? 'var(--accent)' : 'var(--border)'}`,
                    color: size === s.value ? 'var(--accent)' : 'var(--text)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !prompt.trim() || quota <= 0 || !model}
          className="btn btn-accent"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px' }}
        >
          {loading ? <Loader2 size={16} style={{ animation: 'pg-spin 1s linear infinite' }} /> : <Sparkles size={16} />}
          {loading ? '生成中...' : '生成图像'}
        </button>
      </div>

      {/* 右侧展示区 */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minWidth: 0,
      }}>
        {current ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg)',
              borderRadius: 'var(--radius-sm)',
              minHeight: 400,
              overflow: 'hidden',
            }}>
              <img
                src={current.url}
                alt={current.prompt}
                loading="lazy"
                style={{ maxWidth: '100%', maxHeight: 600, objectFit: 'contain' }}
              />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div style={{
                flex: 1,
                fontSize: 13,
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {current.prompt}
              </div>
              <button
                onClick={() => download(current)}
                className="btn btn-accent"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', whiteSpace: 'nowrap' }}
              >
                <Download size={14} />
                下载
              </button>
            </div>
          </>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            fontSize: 14,
            gap: 8,
          }}>
            <Sparkles size={32} style={{ opacity: 0.3 }} />
            <div>输入描述开始生成</div>
          </div>
        )}

        {history.length > 1 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              本次会话（{history.length}/{MAX_HISTORY}，刷新后丢失）
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
              gap: 8,
            }}>
              {history.map(h => (
                <button
                  key={h.id}
                  onClick={() => setSelectedId(h.id)}
                  style={{
                    padding: 0,
                    border: `2px solid ${selectedId === h.id ? 'var(--accent)' : 'transparent'}`,
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    aspectRatio: '1',
                    background: 'var(--bg)',
                  }}
                >
                  <img
                    src={h.url}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
