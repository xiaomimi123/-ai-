import { useEffect, useState } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import {
  User, Lock, Save, LogOut, ChevronRight,
  ScrollText, Receipt, Gift, Bell, BookOpen,
} from 'lucide-react'
import { authApi } from '../api'
import axios from 'axios'

// 移动端 TabBar 挤不下的入口，集中放到"我的"页面
const shortcuts = [
  { icon: ScrollText, label: '用量日志', to: '/logs' },
  { icon: Receipt,    label: '订单记录', to: '/orders' },
  { icon: Gift,       label: '邀请返利', to: '/referral' },
  { icon: Bell,       label: '通知中心', to: '/notifications' },
  { icon: BookOpen,   label: '接入文档', to: '/docs' },
]

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) })
  }, [])

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await authApi.logout().catch(() => {})
      navigate('/login')
    } finally {
      setLoggingOut(false)
    }
  }

  const handlePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm) {
      setMsg({ ok: false, text: '两次密码不一致' }); return
    }
    if (passwordForm.new_password.length < 8) {
      setMsg({ ok: false, text: '密码至少8位' }); return
    }
    setLoading(true); setMsg(null)
    try {
      const res = await axios.put('/api/user/self', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      }, { withCredentials: true })
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
          <User size={18} color="var(--accent)" />
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
          <Lock size={18} color="var(--accent)" />
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
        {msg && <div style={{ background: msg.ok ? 'var(--accent-light)' : 'var(--danger-bg)', color: msg.ok ? 'var(--primary)' : 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{msg.text}</div>}
        <button className="btn btn-primary" onClick={handlePassword} disabled={loading}>
          <Save size={16} />{loading ? '保存中...' : '保存修改'}
        </button>
      </div>

      {/* 快捷入口：TabBar 挤不下的放这里，移动端主要入口 */}
      <div className="card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
        {shortcuts.map((s, i) => (
          <NavLink
            key={s.to}
            to={s.to}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px',
              borderTop: i === 0 ? 'none' : '0.5px solid var(--border)',
              color: 'var(--text)',
            }}
          >
            <s.icon size={18} color="var(--accent)" />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{s.label}</span>
            <ChevronRight size={16} color="var(--muted)" />
          </NavLink>
        ))}
      </div>

      {/* 退出登录：TabBar 下方 32px 的 margin 让按钮在移动端充分可见 */}
      <div style={{ marginTop: 20, marginBottom: 32 }}>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="btn btn-outline"
          style={{
            width: '100%', padding: 13, fontSize: 15, fontWeight: 600,
            color: 'var(--danger)', borderColor: 'var(--danger)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <LogOut size={16} />{loggingOut ? '退出中...' : '退出登录'}
        </button>
      </div>
    </div>
  )
}
