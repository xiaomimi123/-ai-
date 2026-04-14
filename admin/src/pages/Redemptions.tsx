import { useEffect, useState } from 'react'
import { Plus, Copy, Trash2, Gift, Download } from 'lucide-react'
import { redemptionApi } from '../api'

export default function RedemptionsPage() {
  const [list, setList] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', quota: '10', count: '1' })
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)

  const load = async () => { const r = await redemptionApi.list({ p: 0 }); if (r.data.success) setList(r.data.data || []) }
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    setLoading(true)
    try { await redemptionApi.create({ name: form.name, quota: Math.round(parseFloat(form.quota) * 500000), count: parseInt(form.count) }); setShowCreate(false); setForm({ name: '', quota: '10', count: '1' }); load() }
    finally { setLoading(false) }
  }

  const handleDelete = async (id: number) => { if (!confirm('删除此兑换码？')) return; await redemptionApi.delete(id); load() }
  const copyKey = (key: string, id: number) => { navigator.clipboard.writeText(key); setCopied(id); setTimeout(() => setCopied(null), 2000) }

  const exportAll = () => {
    const unused = list.filter(r => r.status === 1)
    const text = unused.map(r => `${r.name}\t${r.key}\t$${(r.quota / 500000).toFixed(2)}`).join('\n')
    navigator.clipboard.writeText(text)
    alert(`已复制 ${unused.length} 个未使用兑换码到剪贴板`)
  }

  const usedCount = list.filter(r => r.status !== 1).length
  const unusedCount = list.filter(r => r.status === 1).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">兑换码管理</h1>
          <p className="page-desc">生成并分发充值码</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unusedCount > 0 && <button className="btn btn-outline" onClick={exportAll}><Download size={15}/>导出未使用</button>}
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/>生成兑换码</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: '总数', value: list.length, color: 'var(--primary)', bg: 'var(--primary-50)' },
          { label: '已使用', value: usedCount, color: 'var(--danger)', bg: '#fee2e2' },
          { label: '未使用', value: unusedCount, color: 'var(--success)', bg: '#dcfce7' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>名称</th><th>兑换码</th><th>面值</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            {list.length === 0
              ? <tr><td colSpan={6} className="empty-state"><Gift size={32}/><div>暂无兑换码</div></td></tr>
              : list.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }}>{r.key?.slice(0,10)}...{r.key?.slice(-6)}</code>
                      <button className="btn btn-ghost btn-icon" onClick={() => copyKey(r.key, r.id)} style={{ color: copied === r.id ? 'var(--success)' : 'var(--muted)' }}>
                        {copied === r.id ? '✓' : <Copy size={13}/>}
                      </button>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--success)', fontFamily: 'monospace' }}>${(r.quota / 500000).toFixed(2)}</td>
                  <td><span className={`badge ${r.status === 1 ? 'badge-green' : 'badge-red'}`}>{r.status === 1 ? '未使用' : '已使用'}</span></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{new Date(r.created_time * 1000).toLocaleDateString('zh-CN')}</td>
                  <td><button className="btn btn-ghost btn-icon" onClick={() => handleDelete(r.id)}><Trash2 size={14} color="var(--danger)"/></button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">生成兑换码</div>
            <div className="form-group"><label className="form-label">备注名称</label><input placeholder="例如：618活动" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus/></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">面值 ($)</label><input type="number" min="0.1" step="0.1" value={form.quota} onChange={e => setForm(p => ({ ...p, quota: e.target.value }))}/></div>
              <div className="form-group"><label className="form-label">生成数量</label><input type="number" min="1" max="1000" value={form.count} onChange={e => setForm(p => ({ ...p, count: e.target.value }))}/></div>
            </div>
            <div style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-light)', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: 'var(--primary)', fontWeight: 500 }}>
              将生成 {form.count} 张面值 ${form.quota} 的兑换码
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>{loading ? '生成中...' : '生成'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
