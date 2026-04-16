import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api'
import AuthBrandPanel from '../components/AuthBrandPanel'

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await authApi.login(form.username.trim(), form.password)
      if (res.data.success) {
        navigate('/dashboard')
      } else setError(res.data.message || '登录失败')
    } catch { setError('网络错误') } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <AuthBrandPanel />

      {/* 右侧表单 */}
      <div className="auth-form-pane" style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 56px',
        minHeight: '100vh',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>欢迎回来</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>登录您的账号继续使用</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">邮箱 / 用户名</label>
              <input
                type="text"
                placeholder="请输入邮箱或用户名"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">密码</label>
              <input
                type="password"
                placeholder="请输入密码"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required
              />
            </div>
            {error && (
              <div style={{
                background: 'var(--danger-bg)', color: 'var(--danger)',
                padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
              }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15 }}
              disabled={loading}
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--muted)', fontSize: 14 }}>
            没有账号？
            <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 500, marginLeft: 4 }}>
              免费注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
