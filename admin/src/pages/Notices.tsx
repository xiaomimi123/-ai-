import { useEffect, useState } from 'react'
import { Plus, Trash2, Bell } from 'lucide-react'
import { noticeApi } from '../api'
import toast from 'react-hot-toast'
import { PageHeader } from '../components/PageHeader'
import { EmptyCard } from '../components/EmptyCard'
import { ConfirmDialog } from '../components/ConfirmDialog'

export default function NoticesPage() {
  const [notices, setNotices] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  const load = () => { noticeApi.list().then(r => { if (r.data.success) setNotices(r.data.data || []) }) }
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error('请填写标题'); return }
    try {
      const r = await noticeApi.create(form)
      if (r.data.success) { toast.success('公告已发布'); setShowCreate(false); setForm({ title: '', content: '' }); load() }
      else toast.error(r.data.message)
    } catch { toast.error('网络错误') }
  }

  const handleDelete = (n: any) => setDeleteTarget(n)

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      await noticeApi.delete(deleteTarget.id)
      toast.success('已删除')
      load()
    } catch { toast.error('删除失败') } finally { setDeleteTarget(null) }
  }

  return (
    <div>
      <PageHeader
        title="公告管理"
        description="发布公告将在用户前台首页显示"
        icon={Bell}
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/>发布公告</button>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notices.length === 0 ? (
          <EmptyCard icon={Bell} title="暂无公告" description="点击右上角「发布公告」开始" />
        ) : notices.map(n => (
          <div className="card" key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20 }}>
            <div>
              <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{n.title}</h3>
              {n.content && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{n.content}</p>}
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                {n.created_at ? new Date(n.created_at).toLocaleString('zh-CN') : ''}
                {n.is_active ? <span className="badge badge-green" style={{ marginLeft: 8 }}>显示中</span> : <span className="badge badge-gray" style={{ marginLeft: 8 }}>已隐藏</span>}
              </p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(n)}>
              <Trash2 size={15} color="var(--danger)" />
            </button>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">发布公告</div>
            <div className="form-group"><label className="form-label">标题</label><input placeholder="公告标题" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} autoFocus /></div>
            <div className="form-group"><label className="form-label">内容（选填）</label><textarea rows={4} placeholder="公告详情..." value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} style={{ resize: 'vertical' }} /></div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}>发布</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除公告"
        description={<>公告「<strong>{deleteTarget?.title}</strong>」将被删除。<br />此操作不可撤销。</>}
        confirmLabel="删除"
        confirmVariant="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
