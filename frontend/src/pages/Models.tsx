import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles, Loader2 } from 'lucide-react'
import ModelIcon from '../components/ModelIcon'
import { publicApi } from '../api'

interface ModelPrice {
  id: number
  model_name: string
  input_price: number
  output_price: number
  is_visible: number
  description: string
  provider: string
  category: string
}

export default function ModelsPage() {
  const navigate = useNavigate()
  const [models, setModels] = useState<ModelPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [provider, setProvider] = useState('全部')

  useEffect(() => {
    publicApi.getModelPrices().then((r: any) => {
      if (r.data.success) setModels(r.data.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const providers = ['全部', ...Array.from(new Set(models.map(m => m.provider).filter(Boolean)))]

  const filtered = models.filter(m => {
    if (provider !== '全部' && m.provider !== provider) return false
    if (search && !m.model_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const categories = Array.from(new Set(filtered.map(m => m.category || 'chat')))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={24} color="var(--primary)" />模型广场
        </h1>
        <p className="page-desc">浏览所有可用模型及定价（价格单位：$/百万 Token）</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input placeholder="搜索模型名称..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {providers.map(p => (
            <button key={p} onClick={() => setProvider(p)} className={`btn btn-sm ${provider === p ? 'btn-primary' : 'btn-outline'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 8 }}>加载中...</p>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>暂无模型数据</div>
      ) : (
        categories.map(cat => (
          <div key={cat}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 8, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
              {cat === 'chat' ? '对话模型' : cat === 'embedding' ? '向量模型' : cat === 'image' ? '图像模型' : cat}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 32 }}>
              {filtered.filter(m => (m.category || 'chat') === cat).map(m => (
                <div key={m.id} className="card" onClick={() => navigate(`/model/${encodeURIComponent(m.model_name)}`)} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer', transition: 'box-shadow .2s' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <ModelIcon modelName={m.model_name} size={36} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, wordBreak: 'break-all' }}>{m.model_name}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span className="badge badge-blue">{m.provider}</span>
                        <span className="badge badge-gray">{m.category || 'chat'}</span>
                      </div>
                    </div>
                  </div>
                  {m.description && <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{m.description}</p>}
                  <div style={{ display: 'flex', gap: 20, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>输入</div>
                      <div style={{ fontWeight: 600, color: 'var(--success)', fontSize: 14 }}>${m.input_price}</div>
                    </div>
                    {m.output_price > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>输出</div>
                        <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 14 }}>${m.output_price}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
