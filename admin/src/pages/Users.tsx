import { useEffect, useState } from 'react'
import { Search, Edit2, UserX, UserCheck, Trash2, Plus } from 'lucide-react'
import { userApi, groupApi } from '../api'
import toast from 'react-hot-toast'
import Pagination from '../components/Pagination'

const ROLES = [
  { value: 1, label: '普通用户' },
  { value: 10, label: '管理员' },
  { value: 100, label: '超级管理员' },
]

interface GroupConfig {
  key: string
  name: string
  description: string
  priority: number
  price_ratio: number
  rpm_limit: number
  tpm_limit: number
}

// 分组视觉映射（后端没存颜色，前端按 key 就近匹配）
const GROUP_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  default:    { bg: '#f3f4f6', color: '#4b5563', border: '#d1d5db' },
  vip:        { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  pro:        { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
  enterprise: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
}
const fallbackColor = { bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' }
const pickColor = (k: string) => GROUP_COLORS[k] || fallbackColor

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1) // 1-indexed
  const [search, setSearch] = useState('')
  const [groups, setGroups] = useState<GroupConfig[]>([])
  const [editUser, setEditUser] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    username: '', display_name: '', email: '', password: '',
    quota: '', role: 1, group: 'default', status: 1,
  })
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: '', display_name: '', email: '', password: '',
    quota: '0', role: 1, group: 'default',
  })
  const PAGE_SIZE = 15

  const load = async (p = page) => {
    try {
      // 前端 1-indexed，后端 p 0-indexed
      const r = await userApi.list({ p: p - 1, page_size: PAGE_SIZE })
      if (r.data.success) { setUsers(r.data.data || []); setTotal(r.data.total || r.data.data?.length || 0) }
    } catch {}
  }
  useEffect(() => { load() }, [page])

  // 加载分组列表（动态，不再硬编码）
  useEffect(() => {
    groupApi.list().then(r => {
      if (r.data.success) setGroups(r.data.data || [])
    }).catch(() => {})
  }, [])

  // 构造 tooltip 描述一个分组的特权
  const groupTooltip = (g?: GroupConfig) => {
    if (!g) return ''
    const parts = [g.description || g.name]
    if (g.price_ratio !== 1) parts.push(`价格: ${(g.price_ratio * 100).toFixed(0)}%`)
    parts.push(`RPM: ${g.rpm_limit || '无限'}`)
    parts.push(`TPM: ${g.tpm_limit ? g.tpm_limit.toLocaleString() : '无限'}`)
    return parts.join(' · ')
  }

  // 按分组统计人数（基于当前页，和 Redemptions stats 一个思路）
  const groupCounts: Record<string, number> = {}
  users.forEach(u => { const k = u.group || 'default'; groupCounts[k] = (groupCounts[k] || 0) + 1 })

  const toUsd = (q: number) => (q / 500000).toFixed(2)

  const handleEdit = (u: any) => {
    setEditUser(u)
    setEditForm({
      username: u.username,
      display_name: u.display_name || '',
      email: u.email || '',
      password: '',
      quota: toUsd(u.quota),
      role: u.role,
      group: u.group || 'default',
      status: u.status,
    })
  }

  const handleSave = async () => {
    if (!editUser) return

    // 关键变动二次确认：防误操作（角色提升/降级、大额 quota、禁用账号、重置密码）
    const newQuotaUsd = parseFloat(editForm.quota) || 0
    const oldQuotaUsd = editUser.quota / 500000
    const quotaDelta = newQuotaUsd - oldQuotaUsd
    const confirms: string[] = []

    if (editForm.role !== editUser.role) {
      const oldLabel = ROLES.find(r => r.value === editUser.role)?.label || `role=${editUser.role}`
      const newLabel = ROLES.find(r => r.value === editForm.role)?.label || `role=${editForm.role}`
      if (editForm.role > editUser.role) {
        confirms.push(`⚠️ 角色提升：${oldLabel} → ${newLabel}（将获得更高后台权限）`)
      } else {
        confirms.push(`⚠️ 角色降级：${oldLabel} → ${newLabel}（将失去后台管理权限）`)
      }
    }

    if (Math.abs(quotaDelta) > 100) {
      const sign = quotaDelta > 0 ? '+' : ''
      confirms.push(`⚠️ 额度大幅变动：$${oldQuotaUsd.toFixed(2)} → $${newQuotaUsd.toFixed(2)}（${sign}$${quotaDelta.toFixed(2)}）`)
    }

    if (editForm.status !== editUser.status && editForm.status === 2) {
      confirms.push(`⚠️ 账号将被禁用，用户无法登录和调用 API`)
    }

    if (editForm.password) {
      confirms.push(`⚠️ 密码将被重置，用户需使用新密码登录`)
    }

    if (confirms.length > 0) {
      const msg = `请确认以下关键变动：\n\n${confirms.join('\n')}\n\n目标用户：${editUser.username} (#${editUser.id})\n\n确定提交吗？`
      if (!confirm(msg)) return
    }

    const data: any = {
      username: editForm.username,
      display_name: editForm.display_name,
      email: editForm.email,
      quota: Math.round(parseFloat(editForm.quota) * 500000),
      role: editForm.role,
      group: editForm.group,
      status: editForm.status,
    }
    if (editForm.password) data.password = editForm.password
    try {
      const r = await userApi.update(editUser.id, data)
      if (r.data.success) { toast.success('用户已更新'); setEditUser(null); load() }
      else toast.error(r.data.message || '更新失败')
    } catch { toast.error('网络错误') }
  }

  const handleToggle = async (u: any) => {
    try {
      await userApi.update(u.id, { status: u.status === 1 ? 2 : 1 })
      toast.success(u.status === 1 ? '已禁用' : '已启用')
      load()
    } catch { toast.error('操作失败') }
  }

  const handleDelete = async (u: any) => {
    if (!confirm(`确认删除用户 ${u.username}？此操作不可撤销！`)) return
    try {
      const r = await userApi.delete(u.id)
      if (r.data.success) { toast.success('已删除'); load() }
      else toast.error(r.data.message || '删除失败')
    } catch { toast.error('网络错误') }
  }

  const handleCreate = async () => {
    if (!createForm.username || !createForm.password) {
      toast.error('用户名和密码必填'); return
    }
    try {
      // One API 没有管理员创建用户的接口，用注册接口
      const r = await (await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: createForm.username, password: createForm.password, email: createForm.email }),
      })).json()
      if (r.success) {
        toast.success('用户已创建')
        setShowCreate(false)
        setCreateForm({ username: '', display_name: '', email: '', password: '', quota: '0', role: 1, group: 'default' })
        load()
      } else toast.error(r.message || '创建失败')
    } catch { toast.error('网络错误') }
  }

  const filtered = search ? users.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()) || u.email?.includes(search)) : users

  const getRoleLabel = (role: number) => {
    if (role >= 100) return { label: '超管', cls: 'badge-purple' }
    if (role >= 10) return { label: '管理员', cls: 'badge-yellow' }
    return { label: '用户', cls: 'badge-gray' }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">用户管理</h1>
          <p className="page-desc">共 {total} 名注册用户</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
            <input placeholder="搜索用户名/邮箱..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }}/>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/>添加用户</button>
        </div>
      </div>

      {/* 分组统计（当前页） */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>本页分组分布：</span>
          {groups.map(g => {
            const count = groupCounts[g.key] || 0
            const c = pickColor(g.key)
            return (
              <span
                key={g.key}
                title={groupTooltip(g)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600,
                  padding: '4px 10px', borderRadius: 999,
                  background: c.bg, color: c.color,
                  border: `1px solid ${c.border}`,
                  cursor: 'help',
                }}
              >
                {g.name}
                <span style={{ fontFamily: 'monospace', opacity: .85 }}>{count}</span>
              </span>
            )
          })}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>用户名</th><th>显示名</th><th>邮箱</th><th>分组</th><th>角色</th><th>状态</th><th>剩余额度</th><th>已消耗</th><th>请求数</th><th>操作</th></tr></thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={11} className="empty-state">暂无用户数据</td></tr>
              : filtered.map(u => {
                const role = getRoleLabel(u.role)
                return (
                  <tr key={u.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{u.id}</td>
                    <td><strong>{u.username}</strong></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.display_name || '-'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.email || '-'}</td>
                    <td>
                      {(() => {
                        const cur = u.group || 'default'
                        const c = pickColor(cur)
                        const curGroup = groups.find(g => g.key === cur)
                        return (
                          <select
                            value={cur}
                            title={groupTooltip(curGroup)}
                            onChange={async e => {
                              try {
                                const r = await groupApi.updateUser({ user_id: u.id, group: e.target.value })
                                if (r.data.success) { toast.success('用户组已更新'); load() }
                                else toast.error(r.data.message)
                              } catch { toast.error('更新失败') }
                            }}
                            style={{
                              fontSize: 12, fontWeight: 600,
                              padding: '3px 10px', borderRadius: 999,
                              background: c.bg, color: c.color,
                              border: `1px solid ${c.border}`,
                              cursor: 'pointer',
                              appearance: 'none',
                              // 从后端动态分组列表渲染选项
                            }}
                          >
                            {groups.length === 0
                              ? <option value={cur}>{cur}</option>
                              : groups.map(g => <option key={g.key} value={g.key}>{g.name}</option>)
                            }
                          </select>
                        )
                      })()}
                    </td>
                    <td><span className={`badge ${role.cls}`}>{role.label}</span></td>
                    <td><span className={`badge ${u.status === 1 ? 'badge-green' : 'badge-red'}`}>{u.status === 1 ? '正常' : '禁用'}</span></td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>${toUsd(u.quota - u.used_quota)}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>${toUsd(u.used_quota)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.request_count?.toLocaleString() || 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" title="编辑" onClick={() => handleEdit(u)}>
                          <Edit2 size={14} color="var(--primary)"/>
                        </button>
                        <button className="btn btn-ghost btn-icon" title={u.status === 1 ? '禁用' : '启用'} onClick={() => handleToggle(u)}>
                          {u.status === 1 ? <UserX size={14} color="var(--warning)"/> : <UserCheck size={14} color="var(--success)"/>}
                        </button>
                        {u.role < 100 && (
                          <button className="btn btn-ghost btn-icon" title="删除" onClick={() => handleDelete(u)}>
                            <Trash2 size={14} color="var(--danger)"/>
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

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      {/* Edit Modal */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
            <div className="modal-title">编辑用户 — {editUser.username} (#{editUser.id})</div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">用户名</label>
                <input value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">显示名称</label>
                <input value={editForm.display_name} onChange={e => setEditForm(p => ({ ...p, display_name: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">邮箱</label>
                <input value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">重置密码 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(留空不修改)</span></label>
                <input type="password" placeholder="留空不修改" value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">额度 ($)</label>
                <input type="number" step="0.01" value={editForm.quota} onChange={e => setEditForm(p => ({ ...p, quota: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">分组</label>
                <select value={editForm.group} onChange={e => setEditForm(p => ({ ...p, group: e.target.value }))}>
                  {groups.length === 0
                    ? <option value={editForm.group}>{editForm.group}</option>
                    : groups.map(g => <option key={g.key} value={g.key}>{g.name} · {g.description}</option>)
                  }
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">角色</label>
                <select value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: parseInt(e.target.value) }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">状态</label>
                <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: parseInt(e.target.value) }))}>
                  <option value={1}>正常</option>
                  <option value={2}>禁用</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setEditUser(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>保存修改</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">添加用户</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">用户名 *</label>
                <input value={createForm.username} onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))} placeholder="username" />
              </div>
              <div className="form-group">
                <label className="form-label">密码 *</label>
                <input type="password" value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} placeholder="至少8位" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">邮箱</label>
              <input value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="选填" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}>创建用户</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
