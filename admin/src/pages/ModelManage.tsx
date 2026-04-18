import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Save, Eye, EyeOff, Radio, Sliders, Trash2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

interface ModelInfo {
  model_name: string
  input_ratio: number
  completion_ratio: number
  input_price: number
  output_price: number
  provider: string
  category: string
  description: string
  is_visible: number
  price_id: number
  channel_count: number
}

export default function ModelManagePage() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [search, setSearch] = useState('')
  const [editModel, setEditModel] = useState<ModelInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  const load = () => {
    setLoading(true)
    http.get('/api/admin/lingjing/models').then(r => {
      if (r.data.success) setModels(r.data.data || [])
    }).catch(() => toast.error('加载失败')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // 从模型价格页跳转过来：?model=xxx 高亮目标行并滚动过去
  useEffect(() => {
    const target = searchParams.get('model')
    if (!target || models.length === 0) return
    const el = rowRefs.current[target]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.background = 'var(--accent-light, #dbeafe)'
    el.style.transition = 'background 1.5s ease'
    const t = setTimeout(() => { if (el) el.style.background = '' }, 1500)
    return () => clearTimeout(t)
  }, [models, searchParams])

  const handleSave = async () => {
    if (!editModel) return
    setSaving(true)
    try {
      // 后端 AdminUpdateModel 是全量覆盖 —— 必须把 editModel 里的完整字段透传回去
      // （包括 input_price/output_price/provider/description/is_visible 这些展示字段的"原值"）
      // 否则后端会把没传的字段当成零值写回，把模型广场数据清空
      const r = await http.put('/api/admin/lingjing/models', editModel)
      if (r.data.success) {
        toast.success(`${editModel.model_name} 倍率已更新`)
        setEditModel(null)
        load()
      } else toast.error(r.data.message)
    } catch { toast.error('保存失败') } finally { setSaving(false) }
  }

  const handleRemove = async (m: ModelInfo) => {
    if (!confirm(`确认从列表移除「${m.model_name}」？\n将清除其定价配置和残留的 ability 记录。\n此操作仅对渠道数=0 的「僵尸模型」有效，不影响正在使用的渠道。`)) return
    try {
      const r = await http.delete(`/api/admin/lingjing/models?model_name=${encodeURIComponent(m.model_name)}`)
      if (r.data.success) {
        toast.success(r.data.message || '已移除')
        load()
      } else {
        toast.error(r.data.message || '移除失败')
      }
    } catch { toast.error('移除失败') }
  }

  const gotoPriceEditor = (modelName: string) => {
    navigate(`/model-prices?model=${encodeURIComponent(modelName)}`)
  }

  const filtered = search
    ? models.filter(m => m.model_name.toLowerCase().includes(search.toLowerCase()) || m.provider?.toLowerCase().includes(search.toLowerCase()))
    : models

  const activeModels = models.filter(m => m.channel_count > 0)
  const visibleModels = models.filter(m => m.is_visible === 1)
  const providers = Array.from(new Set(models.map(m => m.provider).filter(Boolean)))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={22} color="var(--primary)" />模型管理
          </h1>
          <p className="page-desc">专注计费倍率和渠道关联 · 展示相关（图标/描述/标签）请去「模型价格」页</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ padding: '14px 20px', minWidth: 100 }}>
          <div className="stat-label">全部模型</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>{models.length}</div>
        </div>
        <div className="stat-card" style={{ padding: '14px 20px', minWidth: 100 }}>
          <div className="stat-label">有渠道</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>{activeModels.length}</div>
        </div>
        <div className="stat-card" style={{ padding: '14px 20px', minWidth: 100 }}>
          <div className="stat-label">前台可见</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{visibleModels.length}</div>
        </div>
        {providers.slice(0, 5).map(p => (
          <div key={p} className="stat-card" style={{ padding: '14px 20px', minWidth: 100 }}>
            <div className="stat-label">{p}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{models.filter(m => m.provider === p).length}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 16 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
        <input placeholder="搜索模型名称或供应商..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
      </div>

      {/* Info */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#0369a1' }}>
        <strong>职责分工：</strong>本页只管<strong>计费倍率</strong>（实际扣费）。模型的图标、描述、标签、可见性等<strong>展示字段</strong>请在右侧「调展示」按钮跳转的「模型价格」页管理。
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
        <table>
          <thead>
            <tr>
              <th>模型名称</th>
              <th>渠道数</th>
              <th>输入倍率</th>
              <th>补全倍率</th>
              <th>展示价格 ($/M)</th>
              <th>供应商</th>
              <th>前台可见</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="empty-state">
                {loading ? '加载中...' : search ? '未找到匹配模型' : '暂无模型，请先在渠道管理中添加渠道'}
              </td></tr>
            ) : filtered.map(m => {
              return (
                <tr key={m.model_name} ref={el => { rowRefs.current[m.model_name] = el }} style={{ background: m.channel_count === 0 ? '#fefce8' : undefined }}>
                  <td>
                    <strong style={{ fontSize: 13 }}>{m.model_name}</strong>
                    {m.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.description}</div>}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Radio size={12} color={m.channel_count > 0 ? 'var(--success)' : 'var(--muted)'} />
                      <span style={{ fontWeight: 600, color: m.channel_count > 0 ? 'var(--success)' : 'var(--muted)' }}>{m.channel_count}</span>
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{m.input_ratio || <span style={{ color: 'var(--muted)' }}>未设</span>}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{m.completion_ratio || <span style={{ color: 'var(--muted)' }}>1x</span>}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {m.input_price > 0 ? (
                      <span><span style={{ color: 'var(--success)' }}>${m.input_price}</span> / <span style={{ color: 'var(--primary)' }}>${m.output_price}</span></span>
                    ) : <span style={{ color: 'var(--muted)' }}>未设</span>}
                  </td>
                  <td>{m.provider ? <span className="badge badge-blue">{m.provider}</span> : <span style={{ color: 'var(--muted)' }}>-</span>}</td>
                  <td>
                    {m.is_visible ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}><Eye size={14}/>可见</span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}><EyeOff size={14}/>隐藏</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setEditModel({ ...m })} title="调整计费倍率">
                        调倍率
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => gotoPriceEditor(m.model_name)}
                        title="跳转到模型价格页修改图标/描述/展示价等"
                        style={{ padding: '4px 10px' }}
                      >
                        <ExternalLink size={12} style={{ marginRight: 2 }}/>调展示
                      </button>
                      {m.channel_count === 0 && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleRemove(m)}
                          title="无渠道的僵尸条目，点击清除残留配置"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '4px 10px' }}
                        >
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Modal — 只改倍率 */}
      {editModel && (
          <div className="modal-overlay" onClick={() => setEditModel(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
              <div className="modal-title">调整倍率 — {editModel.model_name}</div>

              {/* 计费倍率（可编辑） */}
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>计费倍率（真实扣费）</h4>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">输入倍率</label>
                    <input
                      type="number" step="0.001" placeholder="例：0.14"
                      value={editModel.input_ratio || ''}
                      onChange={e => setEditModel({ ...editModel, input_ratio: parseFloat(e.target.value) || 0 })}
                    />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      倍率 × 2 = $/M input → 当前: <strong>${((editModel.input_ratio || 0) * 2).toFixed(3)}/M</strong>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">补全倍率</label>
                    <input
                      type="number" step="0.01" placeholder="例：1.5"
                      value={editModel.completion_ratio || ''}
                      onChange={e => setEditModel({ ...editModel, completion_ratio: parseFloat(e.target.value) || 0 })}
                    />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      输出 / 输入 比 → 输出: <strong>${((editModel.input_ratio || 0) * (editModel.completion_ratio || 1) * 2).toFixed(3)}/M</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* 前台展示（只读+跳转） */}
              <div style={{ background: '#fafafa', border: '1px dashed var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>前台展示（只读）</h4>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { setEditModel(null); gotoPriceEditor(editModel.model_name) }}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    <ExternalLink size={12} style={{ marginRight: 4 }}/>去「模型价格」页修改
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>展示输入价</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>${editModel.input_price || '—'}/M</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>展示输出价</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>${editModel.output_price || '—'}/M</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>供应商</div>
                    <div>{editModel.provider || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>前台可见</div>
                    <div>{editModel.is_visible ? '是' : '否'}</div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setEditModel(null)}>取消</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  <Save size={14}/>{saving ? '保存中...' : '保存倍率'}
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  )
}
