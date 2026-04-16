import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit2, Eye, EyeOff, Star, X } from 'lucide-react'
import { modelPriceApi } from '../api'
import toast from 'react-hot-toast'

interface ModelPrice {
  id?: number
  model_id: string
  name: string
  provider: string
  description: string
  tags: string
  logo: string
  input_price: number
  output_price: number
  context_window: string
  featured: boolean
  is_visible: boolean
  sort_order: number
  created_at?: number
  updated_at?: number
}

const emptyModel: ModelPrice = {
  model_id: '', name: '', provider: '', description: '',
  tags: '', logo: '', input_price: 0, output_price: 0,
  context_window: '', featured: false, is_visible: true, sort_order: 0,
}

export default function ModelPricesPage() {
  const [prices, setPrices] = useState<ModelPrice[]>([])
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; data: ModelPrice } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    modelPriceApi.list().then(r => { if (r.data.success) setPrices(r.data.data || []) })
  }
  useEffect(() => { load() }, [])

  const openCreate = () => setDialog({ mode: 'create', data: { ...emptyModel } })
  const openEdit = (m: ModelPrice) => setDialog({ mode: 'edit', data: { ...m } })

  const handleSubmit = async () => {
    if (!dialog) return
    const d = dialog.data
    if (!d.model_id.trim() || !d.name.trim()) {
      toast.error('模型标识和显示名称必填')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...d,
        input_price: Number(d.input_price) || 0,
        output_price: Number(d.output_price) || 0,
        sort_order: parseInt(String(d.sort_order)) || 0,
      }
      const r = dialog.mode === 'create'
        ? await modelPriceApi.create(payload)
        : await modelPriceApi.update(d.id!, payload)
      if (r.data.success) {
        toast.success(dialog.mode === 'create' ? '已新增' : '已保存')
        setDialog(null)
        load()
      } else {
        toast.error(r.data.message || '保存失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (m: ModelPrice) => {
    if (!confirm(`确认删除「${m.name}」（${m.model_id}）？此操作不可恢复。`)) return
    try {
      const r = await modelPriceApi.delete(m.id!)
      if (r.data.success) { toast.success('已删除'); load() }
      else toast.error(r.data.message || '删除失败')
    } catch { toast.error('删除失败') }
  }

  const handleToggle = async (m: ModelPrice) => {
    try {
      const r = await modelPriceApi.toggle(m.id!)
      if (r.data.success) { toast.success(r.data.message || '已切换'); load() }
      else toast.error(r.data.message || '切换失败')
    } catch { toast.error('切换失败') }
  }

  const visibleCount = prices.filter(p => p.is_visible).length
  const featuredCount = prices.filter(p => p.featured).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">模型广场</h1>
          <p className="page-desc">管理前台模型广场展示的模型卡片信息</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15}/>新增模型</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: '全部模型', value: prices.length, color: 'var(--primary)' },
          { label: '前台可见', value: visibleCount, color: 'var(--success)' },
          { label: '推荐', value: featuredCount, color: '#ca8a04' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 20px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 表格 */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>排序</th>
              <th style={{ width: 48 }}>Logo</th>
              <th>名称</th>
              <th>厂商</th>
              <th>标识</th>
              <th>输入 ¥/K</th>
              <th>输出 ¥/K</th>
              <th>上下文</th>
              <th>标签</th>
              <th>状态</th>
              <th style={{ width: 180 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {prices.length === 0 ? (
              <tr><td colSpan={11} className="empty-state" style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无模型，点击「新增模型」</td></tr>
            ) : prices.map(m => (
              <tr key={m.id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--muted)', fontSize: 12 }}>{m.sort_order}</td>
                <td>
                  {m.logo ? (
                    <img
                      src={`https://unpkg.com/@lobehub/icons-static-png@latest/light/${m.logo.toLowerCase()}.png`}
                      alt={m.logo}
                      width={28} height={28}
                      style={{ borderRadius: 6, objectFit: 'contain' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.name}
                    {m.featured && <Star size={12} color="#ca8a04" fill="#ca8a04" />}
                  </div>
                  {m.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</div>}
                </td>
                <td>{m.provider || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td><code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{m.model_id}</code></td>
                <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--success)' }}>¥{(m.input_price ?? 0).toFixed(4)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>¥{(m.output_price ?? 0).toFixed(4)}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{m.context_window || '—'}</td>
                <td style={{ maxWidth: 160 }}>
                  {m.tags
                    ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {m.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                          <span key={t} className="badge badge-gray" style={{ fontSize: 10 }}>{t}</span>
                        ))}
                      </div>
                    : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td>
                  <span className={`badge ${m.is_visible ? 'badge-green' : 'badge-gray'}`}>
                    {m.is_visible ? '显示' : '隐藏'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-outline btn-sm" title="编辑" onClick={() => openEdit(m)} style={{ padding: '4px 10px' }}>
                      <Edit2 size={12}/>
                    </button>
                    <button className="btn btn-outline btn-sm" title={m.is_visible ? '隐藏' : '显示'} onClick={() => handleToggle(m)} style={{ padding: '4px 10px' }}>
                      {m.is_visible ? <EyeOff size={12}/> : <Eye size={12}/>}
                    </button>
                    <button className="btn btn-outline btn-sm" title="删除" onClick={() => handleDelete(m)} style={{ padding: '4px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新增/编辑弹窗 */}
      {dialog && (
        <div
          onClick={() => !saving && setDialog(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20, backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ width: 620, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', padding: 28, position: 'relative' }}
          >
            <button
              onClick={() => !saving && setDialog(null)}
              style={{ position: 'absolute', top: 14, right: 14, padding: 4, color: 'var(--muted)', display: 'flex' }}
            >
              <X size={18}/>
            </button>

            <h3 style={{ fontWeight: 600, marginBottom: 18, fontSize: 18 }}>
              {dialog.mode === 'create' ? '新增模型' : `编辑模型 — ${dialog.data.name}`}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  模型标识 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  placeholder="例如 deepseek-chat"
                  value={dialog.data.model_id}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, model_id: e.target.value } })}
                  disabled={dialog.mode === 'edit'}
                  style={{ fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>API 调用时填的 model 值</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  显示名称 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  placeholder="例如 DeepSeek V3"
                  value={dialog.data.name}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, name: e.target.value } })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>厂商</label>
                <input
                  placeholder="DeepSeek / OpenAI / Anthropic"
                  value={dialog.data.provider}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, provider: e.target.value } })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Logo (品牌 key)</label>
                <input
                  placeholder="deepseek / openai / anthropic / google / qwen"
                  value={dialog.data.logo}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, logo: e.target.value } })}
                  style={{ fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>小写，LobeHub 品牌 key，不填则按标识推断</div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>简介</label>
              <textarea
                rows={2}
                placeholder="一句话描述模型特色"
                value={dialog.data.description}
                onChange={e => setDialog({ ...dialog, data: { ...dialog.data, description: e.target.value } })}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>标签</label>
              <input
                placeholder="对话,国产 —— 逗号分隔"
                value={dialog.data.tags}
                onChange={e => setDialog({ ...dialog, data: { ...dialog.data, tags: e.target.value } })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>输入 ¥/千 Token</label>
                <input
                  type="number" step="0.0001" min="0"
                  value={dialog.data.input_price}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, input_price: parseFloat(e.target.value) || 0 } })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>输出 ¥/千 Token</label>
                <input
                  type="number" step="0.0001" min="0"
                  value={dialog.data.output_price}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, output_price: parseFloat(e.target.value) || 0 } })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>上下文窗口</label>
                <input
                  placeholder="64K / 128K / 1M"
                  value={dialog.data.context_window}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, context_window: e.target.value } })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>排序</label>
                <input
                  type="number" min="0"
                  placeholder="数字越小越靠前"
                  value={dialog.data.sort_order}
                  onChange={e => setDialog({ ...dialog, data: { ...dialog.data, sort_order: parseInt(e.target.value) || 0 } })}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end', paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dialog.data.featured}
                    onChange={e => setDialog({ ...dialog, data: { ...dialog.data, featured: e.target.checked } })}
                    style={{ width: 'auto' }}
                  />
                  设为推荐（前台显示徽章）
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={dialog.data.is_visible}
                    onChange={e => setDialog({ ...dialog, data: { ...dialog.data, is_visible: e.target.checked } })}
                    style={{ width: 'auto' }}
                  />
                  前台可见
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline"
                disabled={saving}
                onClick={() => setDialog(null)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={handleSubmit}
              >
                {saving ? '保存中...' : (dialog.mode === 'create' ? '新增' : '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
