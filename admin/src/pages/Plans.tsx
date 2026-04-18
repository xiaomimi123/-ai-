import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Eye, EyeOff, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

interface Plan { id: number; name: string; description: string; price: number; quota: number; bonus_quota: number; is_available: boolean; sort_order: number }

// quota ↔ USD 换算（和前台保持一致，1 USD = 500000 quota）
const QUOTA_PER_USD = 500000
const quotaToUsd = (q: number) => q / QUOTA_PER_USD
const usdToQuota = (u: number) => Math.round(u * QUOTA_PER_USD)

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const [form, setForm] = useState({ name: '', description: '', price: 10, quota: 5000000, bonus_quota: 0, is_available: true, sort_order: 0 })
  const [saving, setSaving] = useState(false)

  const load = () => { http.get('/api/admin/lingjing/plans').then(r => { if (r.data.success) setPlans(r.data.data || []) }) }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', price: 10, quota: 5000000, bonus_quota: 0, is_available: true, sort_order: 0 }); setShowModal(true) }
  const openEdit = (p: Plan) => { setEditing(p); setForm({ name: p.name, description: p.description, price: p.price, quota: p.quota, bonus_quota: p.bonus_quota, is_available: p.is_available, sort_order: p.sort_order }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name || form.price <= 0 || form.quota <= 0) { toast.error('名称、价格、额度必填'); return }
    setSaving(true)
    try {
      const r = editing ? await http.put(`/api/admin/lingjing/plans/${editing.id}`, form) : await http.post('/api/admin/lingjing/plans', form)
      if (r.data.success) { toast.success(editing ? '已更新' : '已创建'); setShowModal(false); load() }
      else toast.error(r.data.message)
    } catch { toast.error('网络错误') } finally { setSaving(false) }
  }

  const handleDelete = async (p: Plan) => { if (!confirm(`删除「${p.name}」？`)) return; await http.delete(`/api/admin/lingjing/plans/${p.id}`); load() }
  const handleToggle = async (p: Plan) => { const r = await http.put(`/api/admin/lingjing/plans/${p.id}/toggle`, {}); if (r.data.success) load() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}><h1 className="page-title">套餐管理</h1><p className="page-desc">配置充值套餐，支持赠送额度和上下线控制</p></div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15}/>新增套餐</button>
      </div>

      <div style={{ background: 'var(--primary-50)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Package size={15}/>前台充值页实时显示已上线的套餐
      </div>

      {plans.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}><Package size={40} color="var(--muted)" style={{ marginBottom: 12 }}/><div style={{ fontWeight: 600, marginBottom: 8 }}>暂无套餐</div><button className="btn btn-primary" onClick={openCreate}>新增套餐</button></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {plans.map(p => (
            <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: p.is_available ? 1 : 0.6, padding: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{p.sort_order || p.id}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</span>
                  <span className={`badge ${p.is_available ? 'badge-green' : 'badge-gray'}`}>{p.is_available ? '已上线' : '已下线'}</span>
                  {p.bonus_quota > 0 && <span className="badge badge-yellow">赠 ${quotaToUsd(p.bonus_quota).toFixed(2)}</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{p.description || '暂无描述'}</div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>¥{p.price}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  到账 ${quotaToUsd(p.quota).toFixed(2)}
                  {p.bonus_quota > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}> + ${quotaToUsd(p.bonus_quota).toFixed(2)}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => handleToggle(p)} className="btn btn-sm btn-outline" style={{ padding: '6px 10px' }}>{p.is_available ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
                <button onClick={() => openEdit(p)} className="btn btn-sm btn-outline" style={{ padding: '6px 10px' }}><Edit2 size={14}/></button>
                <button onClick={() => handleDelete(p)} className="btn btn-sm" style={{ padding: '6px 10px', background: '#fee2e2', color: '#ef4444', border: 'none' }}><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
            <div className="modal-title">{editing ? '编辑套餐' : '新增套餐'}</div>
            <div className="form-group"><label className="form-label">套餐名称 *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="如：入门、标准" /></div>
            <div className="form-group"><label className="form-label">描述</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="适合个人开发者" /></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">支付金额（¥）*</label>
                <input type="number" min="1" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))} />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>用户实付的人民币金额</div>
              </div>
              <div className="form-group">
                <label className="form-label">到账额度（$）*</label>
                <input
                  type="number" min="0.01" step="0.01"
                  value={quotaToUsd(form.quota)}
                  onChange={e => setForm(p => ({ ...p, quota: usdToQuota(parseFloat(e.target.value) || 0) }))}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  按 1:1 汇率通常填与价格相同的值（如 ¥30 → $30）
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">赠送额度（$，0=不赠）</label>
                <input
                  type="number" min="0" step="0.01"
                  value={quotaToUsd(form.bonus_quota)}
                  onChange={e => setForm(p => ({ ...p, bonus_quota: usdToQuota(parseFloat(e.target.value) || 0) }))}
                />
                {form.bonus_quota > 0 && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>赠送 ${quotaToUsd(form.bonus_quota).toFixed(2)}</div>}
              </div>
              <div className="form-group"><label className="form-label">排序（小→前）</label><input type="number" min="0" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><input type="checkbox" checked={form.is_available} onChange={e => setForm(p => ({ ...p, is_available: e.target.checked }))} style={{ width: 'auto' }} />立即上线</label>
            <div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
