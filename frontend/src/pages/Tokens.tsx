import { useEffect, useState } from 'react'
import { Plus, Copy, Trash2, Key } from 'lucide-react'
import { tokenApi } from '../api'
import Pagination from '../components/Pagination'

interface Token { id: number; name: string; key: string; status: number; quota: number; used_quota: number; created_time: number }

const PAGE_SIZE = 15

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [copied, setCopied] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await tokenApi.list({ p: page - 1, page_size: PAGE_SIZE })
      if (r.data.success) {
        // 过滤广场内部自动建的系统 token（name 以双下划线开头，如 __playground__）
        // 对用户完全不可见：既不想让他们困惑，也防止误删导致广场失效
        const rawList = (r.data.data || []) as Token[]
        const visible = rawList.filter(t => !t.name.startsWith('__'))
        setTokens(visible)
        setTotal(Math.max(0, (r.data.total || 0) - (rawList.length - visible.length)))
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [page])

  const refreshToFirst = () => { if (page === 1) load(); else setPage(1) }

  const handleCreate = async () => {
    if (!newName.trim()) return
    // 默认创建无限额度令牌：unlimited_quota=true 让后端 ValidateUserToken 跳过
    // 余额检查；否则后端默认 RemainQuota=0 会让令牌一用就被置为「已耗尽」
    await tokenApi.create({ name: newName, unlimited_quota: true, remain_quota: -1 })
    setNewName(''); setShowCreate(false); refreshToFirst()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此令牌？')) return
    await tokenApi.delete(id); load()
  }

  const copyKey = (key: string, id: number) => {
    navigator.clipboard.writeText(key); setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Key size={22} color="var(--accent)" />API 令牌
          </h1>
          <p className="page-desc">管理您的 API 密钥</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16}/>新建令牌</button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, marginBottom: 20 }}>新建令牌</h3>
            <div className="form-group"><label className="form-label">名称</label><input placeholder="例如：我的项目" value={newName} onChange={e => setNewName(e.target.value)} autoFocus /></div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}>创建</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>名称</th><th>密钥</th><th>状态</th><th>用量</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            {tokens.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>
                  {loading ? '加载中...' : '暂无令牌，点击上方按钮创建'}
                </td></tr>
              : tokens.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code style={{ background: 'var(--bg)', padding: '3px 8px', borderRadius: 6, fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: 'var(--text)' }}>{t.key.slice(0, 8)}...{t.key.slice(-6)}</code>
                      <button className="btn btn-ghost btn-sm" onClick={() => copyKey(t.key, t.id)} style={{ padding: '4px 8px', color: copied === t.id ? 'var(--success)' : 'var(--muted)' }}>
                        {copied === t.id ? '✓' : <Copy size={13}/>}
                      </button>
                    </div>
                  </td>
                  <td><span className={`badge ${t.status === 1 ? 'badge-green' : 'badge-red'}`}>{t.status === 1 ? '启用' : '禁用'}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{(t.used_quota / 500000).toFixed(3)} / {t.quota === -1 ? '∞' : (t.quota / 500000).toFixed(2)}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{new Date(t.created_time * 1000).toLocaleDateString('zh-CN')}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t.id)} style={{ color: 'var(--danger)' }}><Trash2 size={14}/></button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
