import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { authApi } from '../api'
import AuthBrandPanel from '../components/AuthBrandPanel'

// 由邮箱前缀 + 短随机串生成 username（One API 不允许 username 含 @）
function genUsername(email: string): string {
  const prefix = (email.split('@')[0] || 'user')
    .replace(/[^a-zA-Z0-9_-]/g, '') // 清掉非法字符
    .slice(0, 10) || 'user'
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${prefix}_${suffix}`
}

export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  // 从 URL 读邀请码，多种命名兼容
  const refCode =
    searchParams.get('aff') ||
    searchParams.get('ref') ||
    searchParams.get('referral') || ''

  const [form, setForm] = useState({ email: '', password: '' })
  const [verifyCode, setVerifyCode] = useState('')
  // 记录"发码时"的邮箱，用户在倒计时内改邮箱框时仍用原邮箱提交，避免后端 Redis key 不匹配
  const [codeEmail, setCodeEmail] = useState('')
  const [emailVerifyEnabled, setEmailVerifyEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [codeSending, setCodeSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 启动时拉取平台配置：是否启用邮箱验证码
  useEffect(() => {
    fetch('/api/lingjing/config', { credentials: 'include' })
      .then(r => r.json())
      .then(r => {
        if (r.success) setEmailVerifyEnabled(!!r.data?.email_verify_enabled)
      })
      .catch(() => {})
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

  const sendCode = async () => {
    // 早期 return：按钮虽然 disabled，但用户在网络慢的几百 ms 里能连点导致并发请求被自己刷限流
    if (codeSending || countdown > 0) return
    const email = form.email.trim().toLowerCase()
    if (!isValidEmail(email)) {
      setError('请先输入有效的邮箱地址')
      return
    }
    // 立即上锁 + 起 60s 倒计时（不等 await）：防止 await 期间多次点击产生并发请求
    setCodeSending(true)
    setCountdown(60)
    setError('')
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
    try {
      const res = await authApi.sendEmailCode(email)
      if (res.data.success) {
        // 记录这次发码时的邮箱：之后提交注册时用这个邮箱，不用 form.email
        // 防止用户改了邮箱框却还在用旧码，提交后后端查不到
        setCodeEmail(email)
      } else {
        setError(res.data.message || '验证码发送失败')
        // 失败时回滚倒计时让用户重试
        setCountdown(0)
        if (timerRef.current) clearInterval(timerRef.current)
      }
    } catch (err: any) {
      // 429 限流 / 5xx 等：把后端 message 显示给用户，不再笼统说"网络错误"
      const msg = err?.response?.data?.message || '网络错误，请稍后重试'
      setError(msg)
      setCountdown(0)
      if (timerRef.current) clearInterval(timerRef.current)
    } finally {
      setCodeSending(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError('')

    // 启用邮箱验证时，统一用"发码时"记录的邮箱，避免用户在倒计时内改了邮箱框
    // 不启用时，退回当前表单值
    const email = emailVerifyEnabled && codeEmail
      ? codeEmail
      : form.email.trim().toLowerCase()
    if (!isValidEmail(email)) {
      setError('请输入有效的邮箱地址'); return
    }
    if (form.password.length < 8) {
      setError('密码至少 8 位'); return
    }
    if (emailVerifyEnabled && !verifyCode.trim()) {
      setError('请输入邮箱验证码'); return
    }
    if (emailVerifyEnabled && !codeEmail) {
      setError('请先点击"获取验证码"'); return
    }
    if (emailVerifyEnabled && codeEmail !== form.email.trim().toLowerCase()) {
      setError('邮箱已修改，请重新获取验证码'); return
    }

    setLoading(true)
    // username 不能含 @，自动生成「邮箱前缀_随机短串」；冲突时重试 3 次
    let attempt = 0
    let lastErr = ''
    while (attempt < 3) {
      try {
        const payload: {
          username: string
          password: string
          email: string
          aff_code?: string
          verification_code?: string
        } = {
          username: genUsername(email),
          password: form.password,
          email,
        }
        if (refCode) payload.aff_code = refCode
        if (emailVerifyEnabled && verifyCode) payload.verification_code = verifyCode.trim()

        const res = await authApi.register(payload)
        if (res.data.success) {
          setSuccess('注册成功！正在跳转到登录页...')
          setTimeout(() => navigate('/login'), 1200)
          setLoading(false)
          return
        }
        lastErr = res.data.message || '注册失败'
        // 用户名冲突就再试一次新的随机名
        if (lastErr.includes('用户名') || lastErr.includes('username') || lastErr.includes('已存在')) {
          attempt++
          continue
        }
        break
      } catch (err: any) {
        // 把后端 429 / 5xx 的 message 透出给用户
        lastErr = err?.response?.data?.message || '网络错误'
        break
      }
    }
    setError(lastErr)
    setLoading(false)
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
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>创建账号</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>免费注册，即刻开始使用</p>
            {refCode && (
              <div style={{
                marginTop: 12,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--accent-light)', color: 'var(--primary)',
                fontSize: 12, padding: '4px 10px', borderRadius: 20,
              }}>
                <UserPlus size={13} color="var(--accent)" />
                好友邀请您加入（邀请码 {refCode}）
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">邮箱</label>
              <input
                type="email"
                placeholder="your@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
                autoFocus
                autoComplete="email"
              />
              <p className="form-hint">用作登录账号 + 接收通知</p>
            </div>

            <div className="form-group">
              <label className="form-label">密码</label>
              <input
                type="password"
                placeholder="至少 8 位"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {emailVerifyEnabled && (
              <div className="form-group">
                <label className="form-label" htmlFor="verification_code">邮箱验证码</label>
                {/* 手机端踩坑：input 和按钮并排放 flex 容器里时，Android 输入法 + maxLength
                    会锁住输入；按钮的触摸热区也可能吞掉 input 点击。改为 input 独占一行，
                    "获取验证码" 放下方小字按钮，彻底脱离 flex 布局。type=tel 是移动端最兼容
                    的数字键盘触发方式；不设 maxLength，改 onChange 里截断。 */}
                <input
                  id="verification_code"
                  name="verification_code"
                  type="tel"
                  placeholder="请输入 6 位验证码"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    验证码发送到注册邮箱
                  </span>
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={codeSending || countdown > 0}
                    style={{
                      background: 'none', border: 'none', padding: '4px 2px',
                      color: (codeSending || countdown > 0) ? 'var(--muted)' : 'var(--accent)',
                      fontSize: 13, fontWeight: 500,
                      cursor: (codeSending || countdown > 0) ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {countdown > 0 ? `${countdown}s 后重发` : (codeSending ? '发送中...' : '获取验证码')}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: 'var(--danger-bg)', color: 'var(--danger)',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
              }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{
                background: 'var(--accent-light)', color: 'var(--primary)',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
              }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15 }}
              disabled={loading}
            >
              {loading ? '注册中...' : '免费注册'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--muted)', fontSize: 14 }}>
            已有账号？
            <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 500, marginLeft: 4 }}>
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
