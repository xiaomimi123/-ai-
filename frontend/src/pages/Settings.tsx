import { useEffect, useState } from 'react'
import { User, Lock, Save } from 'lucide-react'
import { authApi } from '../api'
import axios from 'axios'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) })
  }, [])

  const handlePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm) {
      setMsg({ ok: false, text: '两次密码不一致' }); return
    }
    if (passwordForm.new_password.length < 8) {
      setMsg({ ok: false, text: '密码至少8位' }); return
    }
    setLoading(true); setMsg(null)
    try {
      const token = localStorage.getItem('access_token')
      const res = await axios.put('/api/user/self', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      }, { headers: { Authorization: `Bearer ${token}` } })
      if (res.data.success) {
        setMsg({ ok: true, text: '密码修改成功' })
        setPasswordForm({ old_password: '', new_password: '', confirm: '' })
      } else setMsg({ ok: false, text: res.data.message || '修改失败' })
    } catch { setMsg({ ok: false, text: '网络错误' }) } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1 className="page-title">个人设置</h1>
        <p className="page-desc">管理您的账号信息</p>
      </div>

      {/* Profile Info */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <User size={18} color="var(--primary)" />
          <h3 style={{ fontWeight: 600 }}>账号信息</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>用户名</div>
            <div style={{ fontWeight: 600 }}>{user?.username || '--'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>邮箱</div>
            <div style={{ fontWeight: 600 }}>{user?.email || '--'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>注册时间</div>
            <div style={{ fontWeight: 600 }}>{user?.created_time ? new Date(user.created_time * 1000).toLocaleDateString('zh-CN') : '--'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>角色</div>
            <div style={{ fontWeight: 600 }}>{user?.role >= 100 ? '管理员' : '普通用户'}</div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Lock size={18} color="var(--warning)" />
          <h3 style={{ fontWeight: 600 }}>修改密码</h3>
        </div>
        <div className="form-group">
          <label className="form-label">当前密码</label>
          <input type="password" placeholder="输入当前密码" value={passwordForm.old_password} onChange={e => setPasswordForm(p => ({ ...p, old_password: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">新密码</label>
          <input type="password" placeholder="至少8位" value={passwordForm.new_password} onChange={e => setPasswordForm(p => ({ ...p, new_password: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">确认新密码</label>
          <input type="password" placeholder="再次输入新密码" value={passwordForm.confirm} onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))} />
        </div>
        {msg && <div style={{ background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? '#166534' : '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{msg.text}</div>}
        <button className="btn btn-primary" onClick={handlePassword} disabled={loading}>
          <Save size={16} />{loading ? '保存中...' : '保存修改'}
        </button>
      </div>
    </div>
  )
}
