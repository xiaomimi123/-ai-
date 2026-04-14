import { useEffect, useState } from 'react'
import { Search, ChevronLeft, ChevronRight, DollarSign, UserCheck, UserX } from 'lucide-react'
import { userApi } from '../api'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState<any>(null)
  const [editForm, setEditForm] = useState({ quota: '', group: '' })
  const PAGE_SIZE = 15

  const load = async (p = page) => {
    try { const r = await userApi.list({ p, page_size: PAGE_SIZE }); if (r.data.success) { setUsers(r.data.data || []); setTotal(r.data.total || 0) } } catch {}
  }
  useEffect(() => { load() }, [page])

  const handleToggle = async (u: any) => {
    await userApi.update(u.id, { status: u.status === 1 ? 2 : 1 }); load()
  }

  const handleSave = async () => {
    if (!editUser) return
    await userApi.update(editUser.id, { quota: Math.round(parseFloat(editForm.quota) * 500000) })
    setEditUser(null); load()
  }

  const toYuan = (q: number) => (q / 500000).toFixed(2)
  const filtered = search ? users.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()) || u.email?.includes(search)) : users
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">用户管理</h1>
          <p className="page-desc">共 {total} 名注册用户</p>
        </div>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
          <input placeholder="搜索用户名或邮箱..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }}/>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>状态</th><th>剩余额度</th><th>已消耗</th><th>请求数</th><th>操作</th></tr></thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={9} className="empty-state">暂无用户数据</td></tr>
              : filtered.map(u => (
                <tr key={u.id}>
                  <td style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'monospace' }}>{u.id}</td>
                  <td><strong>{u.username}</strong></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.email || '-'}</td>
                  <td><span className={`badge ${u.role >= 100 ? 'badge-purple' : 'badge-gray'}`}>{u.role >= 100 ? '管理员' : '用户'}</span></td>
                  <td><span className={`badge ${u.status === 1 ? 'badge-green' : 'badge-red'}`}>{u.status === 1 ? '正常' : '禁用'}</span></td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>${toYuan(u.quota - u.used_quota)}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>${toYuan(u.used_quota)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.request_count?.toLocaleString() || 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-icon" title="调整额度" onClick={() => { setEditUser(u); setEditForm({ quota: toYuan(u.quota), group: u.group || 'default' }) }}>
                        <DollarSign size={14} color="var(--primary)"/>
                      </button>
                      <button className="btn btn-ghost btn-icon" title={u.status === 1 ? '禁用' : '启用'} onClick={() => handleToggle(u)}>
                        {u.status === 1 ? <UserX size={14} color="var(--danger)"/> : <UserCheck size={14} color="var(--success)"/>}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>第 {page} / {totalPages} 页，共 {total} 条</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={14}/> 上一页</button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一页 <ChevronRight size={14}/></button>
        </div>
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">调整额度 — {editUser.username}</div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>当前额度</span><div style={{ fontWeight: 600 }}>${toYuan(editUser.quota)}</div></div>
                <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>已消耗</span><div style={{ fontWeight: 600 }}>${toYuan(editUser.used_quota)}</div></div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">新总额度 ($)</label>
              <input type="number" step="0.01" value={editForm.quota} onChange={e => setEditForm(p => ({ ...p, quota: e.target.value }))} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setEditUser(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
