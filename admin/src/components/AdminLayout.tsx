import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Radio, Gift, ScrollText, LogOut, Settings, Shield, Menu, X, CreditCard, Share2, Bell, Sliders } from 'lucide-react'
import { useState } from 'react'

const navSections = [
  {
    label: '概览',
    items: [
      { to: '/overview', icon: LayoutDashboard, label: '数据面板' },
    ],
  },
  {
    label: '核心管理',
    items: [
      { to: '/channels', icon: Radio, label: '渠道管理' },
      { to: '/users', icon: Users, label: '用户管理' },
      { to: '/logs', icon: ScrollText, label: '调用日志' },
    ],
  },
  {
    label: '商业运营',
    items: [
      { to: '/orders', icon: CreditCard, label: '订单管理' },
      { to: '/redemptions', icon: Gift, label: '兑换码' },
      { to: '/referrals', icon: Share2, label: '分销管理' },
      { to: '/payment', icon: CreditCard, label: '支付配置' },
    ],
  },
  {
    label: '内容配置',
    items: [
      { to: '/model-manage', icon: Sliders, label: '模型管理' },
      { to: '/notices', icon: Bell, label: '公告管理' },
      { to: '/settings', icon: Settings, label: '系统设置' },
    ],
  },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const allItems = navSections.flatMap(s => s.items)
  const currentPage = allItems.find(n => location.pathname.startsWith(n.to))

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: 'var(--sidebar-width)', background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, overflowY: 'auto', transition: 'transform .2s' }}>
        <div style={{ padding: '18px 18px 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={14} color="white"/>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>灵镜AI</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', letterSpacing: '.05em' }}>ADMIN CONSOLE</div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0 8px' }}>
          {navSections.map(section => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              <div style={{ padding: '0 12px', fontSize: 10, color: 'rgba(255,255,255,.2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                {section.label}
              </div>
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                  color: isActive ? '#fff' : 'var(--sidebar-text)',
                  background: isActive ? 'var(--sidebar-active)' : 'transparent',
                  fontWeight: isActive ? 600 : 400, fontSize: 13, transition: 'all .12s',
                  marginBottom: 1,
                })}>
                  <Icon size={16}/>{label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
          <button onClick={() => { localStorage.removeItem('admin_token'); navigate('/login') }} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
            width: '100%', color: 'rgba(255,255,255,.3)', background: 'transparent', fontSize: 13,
          }}>
            <LogOut size={16}/>退出登录
          </button>
        </div>
      </aside>

      {mobileOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 40 }} onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <main style={{ marginLeft: 'var(--sidebar-width)', flex: 1, minHeight: '100vh' }}>
        <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="mobile-menu-btn" style={{ display: 'none', background: 'none', padding: 4 }}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1 style={{ fontSize: 15, fontWeight: 600 }}>{currentPage?.label || '管理控制台'}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>系统正常</span>
          </div>
        </header>
        <div style={{ padding: '24px' }}>
          <Outlet/>
        </div>
      </main>

      <style>{`
        @media (max-width: 1024px) {
          .sidebar { transform: translateX(${mobileOpen ? '0' : '-100%'}); width: 240px !important; }
          .mobile-menu-btn { display: block !important; }
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  )
}
