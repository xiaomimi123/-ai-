import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Search } from 'lucide-react'
import { modelPriceApi } from '../api'
import ModelIcon from '../components/ModelIcon'

interface ModelItem {
  id: number
  model_id: string
  name: string
  provider: string
  description: string
  tags: string // 逗号分隔
  logo: string
  input_price: number
  output_price: number
  context_window: string
  featured: boolean
  is_visible: boolean
  sort_order: number
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState('全部')
  const navigate = useNavigate()

  useEffect(() => {
    modelPriceApi.listPublic()
      .then(r => { if (r.data.success) setModels(r.data.data || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 提取所有标签
  const allTags = ['全部', ...Array.from(new Set(
    models.flatMap(m => m.tags ? m.tags.split(',').map(t => t.trim()).filter(Boolean) : [])
  ))]

  // 过滤
  const filtered = models.filter(m => {
    const q = search.toLowerCase()
    const matchSearch = !search
      || (m.name || '').toLowerCase().includes(q)
      || (m.provider || '').toLowerCase().includes(q)
      || (m.model_id || '').toLowerCase().includes(q)
    const matchTag = activeTag === '全部'
      || (m.tags && m.tags.split(',').map(t => t.trim()).includes(activeTag))
    return matchSearch && matchTag
  })

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* 标题 */}
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Cpu size={22} color="var(--accent)" />
          模型广场
        </h1>
        <p className="page-desc">浏览所有可用模型及定价（价格单位：$/百万 Token）</p>
      </div>

      {/* 搜索 + 筛选 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            placeholder="搜索模型名称或厂商..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`btn btn-sm ${activeTag === tag ? 'btn-accent' : 'btn-outline'}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 加载 / 空状态 / 网格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <Cpu size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div>没有找到匹配的模型</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 14,
        }}>
          {filtered.map(m => (
            <div
              key={m.model_id || String(m.id)}
              className="card"
              style={{
                borderLeft: m.featured ? '3px solid var(--accent)' : undefined,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                padding: 18,
                cursor: 'pointer',
                transition: 'border-color .15s',
              }}
              onClick={() => m.model_id && navigate(`/model/${encodeURIComponent(m.model_id)}`)}
              onMouseEnter={e => { if (!m.featured) e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { if (!m.featured) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {/* 推荐徽章 */}
              {m.featured && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'var(--accent-light)', color: 'var(--primary)',
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                }}>推荐</div>
              )}

              {/* Logo + 名称 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <ModelIcon modelName={m.model_id} logo={m.logo} size={40} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2, wordBreak: 'break-all' }}>
                    {m.name || m.model_id}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{m.provider}</div>
                </div>
              </div>

              {/* 标签 */}
              {m.tags && (
                <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                  {m.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 20,
                      background: 'var(--bg)', color: 'var(--muted)',
                      border: '0.5px solid var(--border)',
                    }}>{tag}</span>
                  ))}
                </div>
              )}

              {/* 描述 */}
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12, flex: 1 }}>
                {m.description || '—'}
              </p>

              {/* 价格区 */}
              <div style={{
                borderTop: '0.5px solid var(--border)', paddingTop: 12, marginBottom: 12,
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>输入</div>
                  <div style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 14 }}>
                    ${(m.input_price ?? 0).toFixed(2)}
                    <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>/M</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>输出</div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 14 }}>
                    ${(m.output_price ?? 0).toFixed(2)}
                    <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>/M</span>
                  </div>
                </div>
                {m.context_window && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>上下文窗口</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{m.context_window}</div>
                  </div>
                )}
              </div>

              {/* 按钮 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1 }}
                  onClick={e => { e.stopPropagation(); navigate('/tokens') }}
                >
                  获取令牌
                </button>
                <button
                  className="btn btn-accent btn-sm"
                  style={{ flex: 1 }}
                  onClick={e => { e.stopPropagation(); navigate('/playground') }}
                >
                  立即体验
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
