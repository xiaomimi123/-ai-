import { useEffect, useState } from 'react'
import { Plus, Copy, Trash2, Gift, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { redemptionApi } from '../api'
import Pagination from '../components/Pagination'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyCard } from '../components/EmptyCard'

const PAGE_SIZE = 15

export default function RedemptionsPage() {
  const [list, setList] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1) // 1-indexed
  const [pageLoading, setPageLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', quota: '10', count: '1' })
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  const load = async () => {
    setPageLoading(true)
    try {
      const r = await redemptionApi.list({ p: page - 1, page_size: PAGE_SIZE })
      if (r.data.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    } finally { setPageLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [page])

  const refreshToFirst = () => { if (page === 1) load(); else setPage(1) }

  const handleCreate = async () => {
    setLoading(true)
    try { await redemptionApi.create({ name: form.name, quota: Math.round(parseFloat(form.quota) * 500000), count: parseInt(form.count) }); setShowCreate(false); setForm({ name: '', quota: '10', count: '1' }); refreshToFirst() }
    finally { setLoading(false) }
  }

  const handleDelete = (r: any) => setDeleteTarget(r)

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      await redemptionApi.delete(deleteTarget.id)
      toast.success('已删除')
      load()
    } catch { toast.error('删除失败') } finally { setDeleteTarget(null) }
  }
  const copyKey = (key: string, id: number) => { navigator.clipboard.writeText(key); setCopied(id); setTimeout(() => setCopied(null), 2000) }

  const exportAll = () => {
    // 导出需要一次性拉全部未使用，否则只能导出当前页
    redemptionApi.list({ p: 0, page_size: 500 }).then(r => {
      if (!r.data.success) return
      const unused = (r.data.data || []).filter((x: any) => x.status === 1)
      const text = unused.map((x: any) => `${x.name}\t${x.key}\t$${(x.quota / 500000).toFixed(2)}`).join('\n')
      navigator.clipboard.writeText(text)
      toast.success(`已复制 ${unused.length} 个未使用兑换码到剪贴板`)
    })
  }

  const usedCount = list.filter(r => r.status !== 1).length
  const unusedCount = list.filter(r => r.status === 1).length

  return (
    <div>
      <PageHeader
        title="兑换码管理"
        description="生成并分发充值码"
        icon={Gift}
        actions={
          <>
            {unusedCount > 0 && <button className="btn btn-outline" onClick={exportAll}><Download size={15}/>导出未使用</button>}
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/>生成兑换码</button>
          </>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard label="本页条数"   value={list.length}    icon={Gift}    color="info"    />
        <StatCard label="本页已使用" value={usedCount}      icon={Trash2}  color="danger"  />
        <StatCard label="本页未使用" value={unusedCount}    icon={Gift}    color="success" />
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>名称</th><th>兑换码</th><th>面值</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            {list.length === 0
              ? <tr><td colSpan={6} style={{ padding: 0 }}>
                  <EmptyCard
                    icon={Gift}
                    title={pageLoading ? '加载中...' : '暂无兑换码'}
                    description={!pageLoading ? '点击右上角「生成兑换码」' : ''}
                  />
                </td></tr>
              : list.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ background: 'var(--surface-2)', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }}>{r.key?.slice(0,10)}...{r.key?.slice(-6)}</code>
                      <button className="btn btn-ghost btn-icon" onClick={() => copyKey(r.key, r.id)} style={{ color: copied === r.id ? 'var(--success)' : 'var(--muted)' }}>
                        {copied === r.id ? '✓' : <Copy size={13}/>}
                      </button>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--success)', fontFamily: 'monospace' }}>${(r.quota / 500000).toFixed(2)}</td>
                  <td><span className={`badge ${r.status === 1 ? 'badge-green' : 'badge-red'}`}>{r.status === 1 ? '未使用' : '已使用'}</span></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{new Date(r.created_time * 1000).toLocaleDateString('zh-CN')}</td>
                  <td><button className="btn btn-ghost btn-icon" onClick={() => handleDelete(r)}><Trash2 size={14} color="var(--danger)"/></button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

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
      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除兑换码"
        description={<>「<strong>{deleteTarget?.name}</strong>」(面值 ${(deleteTarget?.quota / 500000).toFixed(2)}) 将被删除。<br />此操作不可撤销。</>}
        confirmLabel="删除"
        confirmVariant="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
