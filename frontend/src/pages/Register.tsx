import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import { UserPlus } from 'lucide-react'

export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  // 从 URL ?ref=xxx 静默读取邀请码，用户无感知
  const refCode = searchParams.get('ref') || searchParams.get('aff') || ''
  const [form, setForm] = useState({ username: '', password: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      // 静默携带邀请码
      const res = await authApi.register({ ...form, aff_code: refCode })
      if (res.data.success) navigate('/login')
      else setError(res.data.message || '注册失败')
    } catch { setError('网络错误') } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #eff6ff 0%, #faf5ff 50%, #f0fdf4 100%)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>AI</div>
            <span style={{ fontWeight: 700, fontSize: 20 }}>灵镜AI</span>
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>创建账号</h1>
          {refCode && (
            <p style={{ color: 'var(--success)', fontSize: 13, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <UserPlus size={14} />好友邀请您加入灵镜AI
            </p>
          )}
        </div>
        <div className="card" style={{ padding: 32 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group"><label className="form-label">用户名</label><input placeholder="用户名" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">邮箱</label><input type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">密码</label><input type="password" placeholder="至少8位" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required /></div>
            {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: 12 }} disabled={loading}>{loading ? '注册中...' : '免费注册'}</button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-secondary)', fontSize: 14 }}>已有账号？<Link to="/login" style={{ color: 'var(--primary)', fontWeight: 500 }}> 登录</Link></p>
        </div>
      </div>
    </div>
  )
}
