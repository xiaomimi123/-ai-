import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { authApi } from '../api'

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res = await authApi.login(form.username, form.password)
      if (res.data.success) { navigate('/overview') }
      else setError(res.data.message || '登录失败')
    } catch { setError('无法连接服务器') } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(99,102,241,.3)' }}>
            <Shield size={26} color="white"/>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6 }}>管理员登录</h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>灵镜AI 管理控制台</p>
        </div>
        <div style={{ background: '#1e293b', borderRadius: 16, padding: 28, border: '1px solid rgba(255,255,255,.08)' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 500, marginBottom: 6 }}>用户名</label>
              <input type="text" placeholder="admin" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required autoFocus style={{ background: '#263348', border: '1px solid rgba(255,255,255,.08)', color: '#f1f5f9' }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 500, marginBottom: 6 }}>密码</label>
              <input type="password" placeholder="--------" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required style={{ background: '#263348', border: '1px solid rgba(255,255,255,.08)', color: '#f1f5f9' }} />
            </div>
            {error && <div style={{ background: 'rgba(239,68,68,.1)', color: '#f87171', border: '1px solid rgba(239,68,68,.2)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: 12 }} disabled={loading}>{loading ? '登录中...' : '登录控制台'}</button>
          </form>
        </div>
      </div>
    </div>
  )
}
