import { useEffect, useState } from 'react'
import { Plus, Trash2, Bell } from 'lucide-react'
import { noticeApi } from '../api'
import toast from 'react-hot-toast'

export default function NoticesPage() {
  const [notices, setNotices] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })

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

  const handleDelete = async (id: number) => {
    if (!confirm('删除此公告？')) return
    await noticeApi.delete(id); load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">公告管理</h1>
          <p className="page-desc">发布公告将在用户前台首页显示</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/>发布公告</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notices.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
            <Bell size={32} style={{ marginBottom: 8, opacity: .4 }} />
            <div>暂无公告</div>
          </div>
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
            <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(n.id)}>
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
    </div>
  )
}
