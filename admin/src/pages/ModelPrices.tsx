import { useEffect, useState } from 'react'
import { Plus, Trash2, Tag } from 'lucide-react'
import { modelPriceApi } from '../api'
import toast from 'react-hot-toast'

export default function ModelPricesPage() {
  const [prices, setPrices] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ model_name: '', input_price: '', output_price: '', provider: '', category: 'chat', description: '', is_visible: 1 })

  const load = () => { modelPriceApi.list().then(r => { if (r.data.success) setPrices(r.data.data || []) }) }
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    try {
      const r = await modelPriceApi.upsert({ ...form, input_price: parseFloat(form.input_price), output_price: parseFloat(form.output_price) })
      if (r.data.success) { toast.success('已保存'); setShowCreate(false); setForm({ model_name: '', input_price: '', output_price: '', provider: '', category: 'chat', description: '', is_visible: 1 }); load() }
      else toast.error(r.data.message)
    } catch { toast.error('网络错误') }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('删除此定价？')) return
    await modelPriceApi.delete(id); load()
  }

  const providers = Array.from(new Set(prices.map(p => p.provider).filter(Boolean)))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">模型定价</h1>
          <p className="page-desc">配置模型在前台的展示价格（$/百万 Token）</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/>添加模型</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ padding: 16, minWidth: 120 }}>
          <div className="stat-label">模型总数</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{prices.length}</div>
        </div>
        {providers.map(p => (
          <div key={p} className="stat-card" style={{ padding: 16, minWidth: 120 }}>
            <div className="stat-label">{p}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{prices.filter(m => m.provider === p).length}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>模型名称</th><th>供应商</th><th>类别</th><th>输入价格</th><th>输出价格</th><th>可见</th><th>操作</th></tr></thead>
          <tbody>
            {prices.length === 0
              ? <tr><td colSpan={7} className="empty-state"><Tag size={28}/><div style={{ marginTop: 8 }}>暂无模型定价</div></td></tr>
              : prices.map(p => (
                <tr key={p.id}>
                  <td><strong style={{ fontSize: 13 }}>{p.model_name}</strong></td>
                  <td><span className="badge badge-blue">{p.provider}</span></td>
                  <td><span className="badge badge-gray">{p.category}</span></td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--success)', fontWeight: 600 }}>${p.input_price}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>${p.output_price}</td>
                  <td><span className={`badge ${p.is_visible ? 'badge-green' : 'badge-red'}`}>{p.is_visible ? '显示' : '隐藏'}</span></td>
                  <td><button className="btn btn-ghost btn-icon" onClick={() => handleDelete(p.id)}><Trash2 size={14} color="var(--danger)"/></button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">添加/更新模型定价</div>
            <div className="form-group"><label className="form-label">模型名称</label><input placeholder="claude-3-5-sonnet-20241022" value={form.model_name} onChange={e => setForm(p => ({ ...p, model_name: e.target.value }))} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">供应商</label><input placeholder="Anthropic" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">类别</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="chat">chat</option><option value="embedding">embedding</option><option value="image">image</option><option value="audio">audio</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">输入价格 ($/M)</label><input type="number" step="0.01" value={form.input_price} onChange={e => setForm(p => ({ ...p, input_price: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">输出价格 ($/M)</label><input type="number" step="0.01" value={form.output_price} onChange={e => setForm(p => ({ ...p, output_price: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">描述</label><input placeholder="简短描述" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
