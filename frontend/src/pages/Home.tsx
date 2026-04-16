import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ModelIcon from '../components/ModelIcon'

interface Notice { id: number; title: string; content: string }
interface ModelPrice { model_id: string; name: string; provider: string; input_price: number; output_price: number; description: string; logo?: string }
interface UserInfo { id: number; username: string; display_name: string; quota: number }

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [models, setModels] = useState<ModelPrice[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/user/self', { credentials: 'include' })
      .then(r => r.json())
      .then(r => { if (r.success && r.data?.username) setUser(r.data) })
      .catch(() => {})
    fetch('/api/lingjing/notices').then(r => r.json()).then(r => r.success && setNotices(r.data || [])).catch(() => {})
    fetch('/api/lingjing/model-prices').then(r => r.json()).then(r => r.success && setModels(r.data || [])).catch(() => {})
  }, [])

  // 按 provider 归组取前 8 个流行模型
  const providerMap: Record<string, ModelPrice> = {}
  models.forEach(m => {
    const p = m.provider || m.model_id
    if (!providerMap[p]) providerMap[p] = m
  })
  const topModels = Object.values(providerMap).slice(0, 8)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* 顶部公告 */}
      {notices.length > 0 && (
        <div style={{
          background: 'var(--accent-light)',
          borderBottom: '0.5px solid var(--border)',
          padding: '8px 40px',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--primary)',
        }}>
          <span style={{ fontWeight: 500 }}>{notices[0].title}</span>
          {notices[0].content && <span style={{ color: 'var(--muted)' }}> — {notices[0].content}</span>}
        </div>
      )}

      {/* 导航栏 */}
      <nav className="home-nav" style={{
        background: '#fff',
        borderBottom: '0.5px solid var(--border)',
        padding: '0 40px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="brand-logo" style={{ fontSize: 14 }}>境</div>
          <span style={{ fontWeight: 600, fontSize: 16 }}>灵镜 AI</span>
        </Link>

        <div className="home-nav-links" style={{ display: 'flex', gap: 28 }}>
          <Link to="/models" style={{ fontSize: 14, color: 'var(--muted)' }}>模型广场</Link>
          <Link to="/docs" style={{ fontSize: 14, color: 'var(--muted)' }}>接入文档</Link>
          <Link to="/models" style={{ fontSize: 14, color: 'var(--muted)' }}>定价</Link>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {user ? (
            <Link to="/dashboard" className="btn btn-accent btn-sm">进入控制台</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline btn-sm">登录</Link>
              <Link to="/register" className="btn btn-accent btn-sm">免费注册</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" style={{
        padding: '80px 40px 60px',
        maxWidth: 720,
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--accent-light)',
          color: 'var(--primary)',
          fontSize: 12,
          fontWeight: 500,
          padding: '4px 12px',
          borderRadius: 20,
          marginBottom: 24,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
          DeepSeek · Claude · GPT-4o · Gemini 全部支持
        </div>

        <h1 className="hero-title" style={{
          fontSize: 48,
          fontWeight: 600,
          lineHeight: 1.2,
          color: 'var(--text)',
          marginBottom: 18,
          letterSpacing: '-0.02em',
        }}>
          连接一切大模型<br />
          <span style={{ color: 'var(--accent)' }}>一个 Key</span> 搞定
        </h1>

        <p style={{
          fontSize: 16,
          color: 'var(--muted)',
          marginBottom: 32,
          lineHeight: 1.8,
        }}>
          统一 API 接口，按量计费，毫秒级响应。<br />
          开发者首选的大模型 API 中转服务。
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {user ? (
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary" style={{ padding: '11px 24px', fontSize: 15 }}>
              进入控制台
            </button>
          ) : (
            <button onClick={() => navigate('/register')} className="btn btn-primary" style={{ padding: '11px 24px', fontSize: 15 }}>
              免费开始使用
            </button>
          )}
          <button onClick={() => navigate('/models')} className="btn btn-outline" style={{ padding: '11px 24px', fontSize: 15 }}>
            查看模型定价
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
          已有 1,000+ 开发者在使用 · 注册即赠 500 万 Token
        </p>
      </section>

      {/* 特性卡片 */}
      <section style={{ padding: '0 40px 80px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {[
            { title: '统一接口', desc: '完全兼容 OpenAI 格式，原有代码改一行 API 地址即可接入', icon: '⬡' },
            { title: '按量计费', desc: '精确到 Token 计费，无最低消费，余额永久有效', icon: '◈' },
            { title: '毫秒响应', desc: '香港节点直连，低延迟稳定转发，支持流式输出', icon: '◎' },
          ].map(f => (
            <div key={f.title} className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontSize: 22, marginBottom: 12, color: 'var(--accent)', lineHeight: 1 }}>{f.icon}</div>
              <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: 'var(--text)' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 支持的模型 */}
      {topModels.length > 0 && (
        <section style={{ padding: '40px 0 80px', borderTop: '0.5px solid var(--border)', background: '#fff' }}>
          <p style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--muted)',
            marginBottom: 24,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            支持的模型
          </p>
          <div style={{
            display: 'flex',
            gap: 36,
            justifyContent: 'center',
            flexWrap: 'wrap',
            padding: '0 40px',
            maxWidth: 960,
            margin: '0 auto',
          }}>
            {topModels.map(m => (
              <div key={m.model_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                color: 'var(--text)', fontSize: 14, fontWeight: 500,
              }}>
                <ModelIcon modelName={m.model_id} logo={m.logo} size={24} />
                {m.provider || m.model_id}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <Link to="/models" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>
              查看全部模型 →
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer style={{
        borderTop: '0.5px solid var(--border)',
        padding: '24px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        background: 'var(--bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="brand-logo" style={{ width: 20, height: 20, fontSize: 10, borderRadius: 5 }}>境</div>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            © {new Date().getFullYear()} 灵镜 AI · API Service Provider
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <a style={{ fontSize: 12, color: 'var(--muted)' }}>服务条款</a>
          <a style={{ fontSize: 12, color: 'var(--muted)' }}>隐私政策</a>
          <a style={{ fontSize: 12, color: 'var(--muted)' }}>联系我们</a>
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .home-nav { padding: 0 16px !important; }
          .home-nav-links { display: none !important; }
          .hero { padding: 48px 20px 40px !important; }
        }
      `}</style>
    </div>
  )
}
