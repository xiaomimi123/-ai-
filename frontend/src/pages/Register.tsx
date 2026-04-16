import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api'
import { UserPlus } from 'lucide-react'

export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref') || searchParams.get('aff') || ''
  const [form, setForm] = useState({ username: '', password: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await authApi.register({ ...form, aff_code: refCode })
      if (res.data.success) navigate('/login')
      else setError(res.data.message || '注册失败')
    } catch { setError('网络错误') } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: -160, right: -160,
        width: 360, height: 360,
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-light) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: -140, left: -140,
        width: 320, height: 320,
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-light) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div className="brand-logo" style={{ width: 36, height: 36, fontSize: 16, borderRadius: 9 }}>境</div>
            <span style={{ fontWeight: 600, fontSize: 20 }}>灵镜 AI</span>
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>创建账号</h1>
          {refCode && (
            <p style={{
              color: 'var(--primary)',
              fontSize: 13,
              marginTop: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--accent-light)',
              padding: '4px 10px',
              borderRadius: 20,
            }}>
              <UserPlus size={13} color="var(--accent)" />好友邀请您加入灵镜 AI
            </p>
          )}
        </div>
        <div className="card" style={{ padding: 28 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group"><label className="form-label">用户名</label><input placeholder="用户名" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">邮箱</label><input type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">密码</label><input type="password" placeholder="至少 8 位" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required /></div>
            {error && (
              <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: 15 }} disabled={loading}>
              {loading ? '注册中...' : '免费注册'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--muted)', fontSize: 14 }}>
            已有账号？<Link to="/login" style={{ color: 'var(--accent)', fontWeight: 500 }}> 登录</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
