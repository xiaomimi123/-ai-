import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Zap, Shield, Globe, ChevronRight, Search, User, LogOut, CreditCard, Gift, FileText, Settings, BarChart2, Key, BookOpen } from 'lucide-react'

// ─── 类型 ───────────────────────────────────────────────
interface Plan { id: number; name: string; price: number; quota: number; bonus_quota: number; description: string }
interface Notice { id: number; title: string; content: string }
interface ModelPrice { model_name: string; provider: string; input_price: number; output_price: number; description: string; category: string }
interface UserInfo { id: number; username: string; display_name: string; quota: number }

// ─── 顶部导航 ────────────────────────────────────────────
function Navbar({ user, onLogout }: { user: UserInfo | null; onLogout: () => void }) {
  const [dropOpen, setDropOpen] = useState(false)
  const [search, setSearch] = useState('')

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e8eaf0', padding: '0 32px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={18} color="white" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>灵镜AI</span>
      </Link>

      <div style={{ flex: 1, maxWidth: 360, position: 'relative' }} className="desktop-only">
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索模型"
          style={{ width: '100%', paddingLeft: 36, paddingRight: 16, height: 36, border: '1.5px solid #e5e7eb', borderRadius: 20, fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 20 }} className="desktop-only">
          {[{ label: '模型', to: '/models' }, { label: '文档', to: '/docs' }].map(item => (
            <Link key={item.label} to={item.to} style={{ fontSize: 14, color: '#374151', textDecoration: 'none', fontWeight: 500 }}>{item.label}</Link>
          ))}
        </div>

        {user ? (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setDropOpen(!dropOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', border: 'none', borderRadius: 20, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={13} color="white" />
              </div>
              {user.display_name || user.username}
              <ChevronRight size={12} style={{ transform: dropOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .2s' }} />
            </button>

            {dropOpen && (
              <div style={{ position: 'absolute', right: 0, top: 44, background: 'white', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.12)', border: '1px solid #f0f0f0', padding: '8px 0', minWidth: 180, zIndex: 200 }}
                onMouseLeave={() => setDropOpen(false)}>
                <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>余额</div>
                  <div style={{ fontWeight: 700, color: '#4f6ef7' }}>¥{((user.quota || 0) / 500000).toFixed(2)}</div>
                </div>
                {[
                  { icon: BarChart2, label: '用量信息', to: '/dashboard' },
                  { icon: Key, label: 'API Keys', to: '/tokens' },
                  { icon: CreditCard, label: '充值', to: '/topup' },
                  { icon: Gift, label: '邀请返利', to: '/referral' },
                  { icon: FileText, label: '账单', to: '/orders' },
                  { icon: BookOpen, label: '接入文档', to: '/docs' },
                  { icon: Settings, label: '个人设置', to: '/settings' },
                ].map(item => (
                  <Link key={item.label} to={item.to} onClick={() => setDropOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', color: '#374151', textDecoration: 'none', fontSize: 13 }}>
                    <item.icon size={14} color="#9ca3af" />{item.label}
                  </Link>
                ))}
                <div style={{ borderTop: '1px solid #f5f5f5', marginTop: 4 }}>
                  <button onClick={() => { setDropOpen(false); onLogout() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, width: '100%' }}>
                    <LogOut size={14} />退出登录
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/login" style={{ padding: '7px 16px', borderRadius: 8, border: '1.5px solid #e5e7eb', color: '#374151', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>登录</Link>
            <Link to="/register" style={{ padding: '7px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>免费注册</Link>
          </div>
        )}
      </div>
    </nav>
  )
}

// ─── 主页 ────────────────────────────────────────────────
export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [models, setModels] = useState<ModelPrice[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/user/self', { credentials: 'include' })
      .then(r => r.json())
      .then(r => { if (r.success && r.data?.username) setUser(r.data) })
      .catch(() => {})
    fetch('/api/lingjing/plans').then(r => r.json()).then(r => r.success && setPlans(r.data || [])).catch(() => {})
    fetch('/api/lingjing/notices').then(r => r.json()).then(r => r.success && setNotices(r.data || [])).catch(() => {})
    fetch('/api/lingjing/model-prices').then(r => r.json()).then(r => r.success && setModels(r.data || [])).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await fetch('/api/user/logout', { method: 'get', credentials: 'include' })
    setUser(null)
  }

  const filteredModels = models.filter(m =>
    m.model_name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.provider?.toLowerCase().includes(modelSearch.toLowerCase())
  )

  const providerColor = (provider: string) => {
    const map: Record<string, string> = {
      'Anthropic': '#d97706', 'OpenAI': '#10a37f', 'DeepSeek': '#4f6ef7',
      '字节跳动': '#1e40af', '阿里': '#f97316', '月之暗面': '#7c3aed',
    }
    return map[provider] || '#6b7280'
  }

  return (
    <div style={{ background: '#f0f2f7', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <Navbar user={user} onLogout={handleLogout} />

      {notices.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>📢 {notices[0].title}</div>
          <Link to="/topup" style={{ background: 'linear-gradient(135deg, #8b5cf6, #4f6ef7)', color: 'white', padding: '6px 20px', borderRadius: 20, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>立即充值 →</Link>
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '64px 32px 48px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #e5e7eb', borderRadius: 20, padding: '4px 14px', fontSize: 12, color: '#6b7280', marginBottom: 24 }}>
          <Zap size={12} color="#4f6ef7" /> AI 统一接入平台
        </div>
        <h1 style={{ fontSize: 48, fontWeight: 800, color: '#1a1a2e', marginBottom: 16, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          快速便捷的 <span style={{ background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI 服务</span>
        </h1>
        <p style={{ fontSize: 16, color: '#6b7280', maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.8 }}>
          汇聚市面上最前沿的 AI 模型，完全兼容 OpenAI 接口格式，一个 API Key 调用所有模型
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {user ? (
            <Link to="/dashboard" style={{ padding: '12px 32px', borderRadius: 10, background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', color: 'white', textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>进入控制台 →</Link>
          ) : (
            <>
              <Link to="/register" style={{ padding: '12px 32px', borderRadius: 10, background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', color: 'white', textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>免费注册 →</Link>
              <Link to="/docs" style={{ padding: '12px 32px', borderRadius: 10, background: 'white', color: '#374151', textDecoration: 'none', fontSize: 15, fontWeight: 600, border: '1.5px solid #e5e7eb' }}>查看文档</Link>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '0 32px 48px', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #4f6ef7 0%, #06b6d4 100%)', borderRadius: 16, padding: 28, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', minHeight: 140, cursor: 'pointer' }} onClick={() => navigate('/docs')}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>⚡ 极速接入，3步完成</div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>完全兼容 OpenAI 接口格式</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ChevronRight size={20} color="white" /></div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #eab308 100%)', borderRadius: 16, padding: 28, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', minHeight: 140, cursor: 'pointer' }} onClick={() => navigate('/topup')}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>🎯 按需充值，永不过期</div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>无月费，用多少充多少</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ChevronRight size={20} color="white" /></div>
        </div>
      </div>

      <div style={{ background: 'white', padding: '48px 32px', textAlign: 'center', marginBottom: 2 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#1a1a2e', marginBottom: 8 }}>为什么选择灵镜AI？</h2>
        <p style={{ color: '#6b7280', fontSize: 15, marginBottom: 48 }}>我们提供业界领先的 AI 模型聚合服务</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32, maxWidth: 900, margin: '0 auto 48px' }}>
          {[
            { num: '50+', label: '支持模型数量', icon: '🤖' },
            { num: '< 500ms', label: '平均响应时间', icon: '⚡' },
            { num: '99.9%', label: '服务可用性', icon: '🛡️' },
            { num: '< ¥0.01', label: '最低每千Token', icon: '💰' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 36, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>{s.num}</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 900, margin: '0 auto' }}>
          {[
            { icon: Zap, color: '#f97316', title: '闪电般快速', desc: '全球节点加速，智能路由优化', tags: ['全球加速', '智能路由'] },
            { icon: Shield, color: '#10b981', title: '企业级安全', desc: '99.9% 可用性保证，故障自动转移', tags: ['数据加密', '故障转移'] },
            { icon: Globe, color: '#4f6ef7', title: '全模型覆盖', desc: '统一访问国内外供应商的模型', tags: ['50+模型', '实时更新'] },
          ].map(f => (
            <div key={f.title} style={{ background: '#f9fafb', borderRadius: 14, padding: 24, textAlign: 'left', border: '1px solid #f0f0f0' }}>
              <f.icon size={28} color={f.color} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#1a1a2e' }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginBottom: 16 }}>{f.desc}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {f.tags.map(t => <span key={t} style={{ fontSize: 11, color: '#6b7280', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px' }}>{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '48px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>热门模型</h2>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input placeholder="搜索模型" value={modelSearch} onChange={e => setModelSearch(e.target.value)}
              style={{ paddingLeft: 32, paddingRight: 14, height: 34, border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: 'white', outline: 'none' }} />
          </div>
        </div>
        {filteredModels.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 8 }}>模型配置中</div>
            <div style={{ color: '#9ca3af', fontSize: 13 }}>管理员正在配置模型，敬请期待</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {filteredModels.map(m => (
              <div key={m.model_name} style={{ background: 'white', borderRadius: 14, padding: 20, border: '1px solid #f0f0f0', transition: 'box-shadow .2s', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: providerColor(m.provider) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    {m.provider === 'Anthropic' ? '🤖' : m.provider === 'OpenAI' ? '🧠' : m.provider === 'DeepSeek' ? '🔍' : '⚡'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{m.model_name}</div>
                    <div style={{ fontSize: 11, color: providerColor(m.provider), fontWeight: 500 }}>by {m.provider}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 12, color: '#f97316', fontWeight: 600 }}>💰 ¥{m.input_price}/M</div>
                </div>
                {m.description && <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 10 }}>{m.description}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#4f6ef7', background: '#eff6ff', borderRadius: 6, padding: '2px 8px' }}>{m.category || 'chat'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: 'white', padding: '48px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>开发者快速调用大模型 API，仅需 3 步</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 900, margin: '0 auto' }}>
          {[
            { num: '1', title: '注册', desc: '创建账户即可开始使用', preview: '📧 邮箱注册 / 快速登录' },
            { num: '2', title: '充值', desc: '按需充值，额度永久有效', preview: '💳 支持支付宝 / 微信支付' },
            { num: '3', title: '开始使用', desc: '创建 API Key 并开始发请求', preview: '🔑 sk-xxxxxxxxxxxxxxxx' },
          ].map(s => (
            <div key={s.num} style={{ background: '#f9fafb', borderRadius: 14, padding: 28 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #eef2ff, #ddd6fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#4f6ef7', marginBottom: 16 }}>{s.num}</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#1a1a2e', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginBottom: 16 }}>{s.desc}</div>
              <div style={{ background: 'white', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#9ca3af', border: '1px solid #f0f0f0', fontFamily: 'monospace' }}>{s.preview}</div>
            </div>
          ))}
        </div>
      </div>

      {plans.length > 0 && (
        <div style={{ padding: '48px 32px', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginBottom: 24, textAlign: 'center' }}>充值套餐</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {plans.map((plan, i) => (
              <div key={plan.id} style={{ background: i === Math.floor(plans.length / 2) ? 'linear-gradient(135deg, #4f6ef7, #8b5cf6)' : 'white', borderRadius: 14, padding: 22, border: i === Math.floor(plans.length / 2) ? 'none' : '1.5px solid #e5e7eb', position: 'relative', color: i === Math.floor(plans.length / 2) ? 'white' : '#1a1a2e' }}>
                {i === Math.floor(plans.length / 2) && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#f97316', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 10, whiteSpace: 'nowrap' }}>最受欢迎</div>}
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 4 }}>¥{plan.price}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>{((plan.quota + plan.bonus_quota) / 500000).toFixed(0)} 元额度</div>
                <Link to="/register" style={{ display: 'block', textAlign: 'center', background: i === Math.floor(plans.length / 2) ? 'rgba(255,255,255,.2)' : 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', color: 'white', padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>立即购买</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', padding: '56px 32px', textAlign: 'center', margin: '0 32px 32px', borderRadius: 20 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 12 }}>立即开始使用灵镜AI</h2>
        <p style={{ color: 'rgba(255,255,255,.8)', fontSize: 15, marginBottom: 28 }}>注册账号，获取 API Key，开始调用全球顶尖 AI 模型</p>
        <Link to="/register" style={{ display: 'inline-block', background: 'white', color: '#4f6ef7', padding: '14px 40px', borderRadius: 12, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>快速开始 →</Link>
      </div>

      <footer style={{ background: 'white', borderTop: '1px solid #f0f0f0', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>© 2025 灵镜AI 版权所有</div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['关于我们', '联系我们', '接入文档', '隐私协议'].map(item => (
            <Link key={item} to="/docs" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>{item}</Link>
          ))}
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          h1 { font-size: 32px !important; }
        }
      `}</style>
    </div>
  )
}
