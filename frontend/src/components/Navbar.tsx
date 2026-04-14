import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Menu, X, ChevronDown, LogOut, Settings, LayoutDashboard, Key, CreditCard, Receipt, Gift, ScrollText, BookOpen } from 'lucide-react'
import { authApi } from '../api'
import Avatar from './Avatar'

const userMenuItems = [
  { icon: LayoutDashboard, label: '控制台', to: '/dashboard' },
  { icon: Key, label: 'API 令牌', to: '/tokens' },
  { icon: CreditCard, label: '充值', to: '/topup' },
  { icon: Receipt, label: '充值记录', to: '/orders' },
  { icon: Gift, label: '邀请返利', to: '/referral' },
  { icon: ScrollText, label: '用量日志', to: '/logs' },
  { icon: BookOpen, label: '接入文档', to: '/docs' },
  { icon: Settings, label: '个人设置', to: '/settings' },
]

export default function Navbar() {
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'

  useEffect(() => {
    authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
    navigate('/login')
  }

  const isLoggedIn = !!user

  const navLinks = [
    { to: '/', label: '首页' },
    ...(isLoggedIn ? [{ to: '/dashboard', label: '控制台' }] : []),
    { to: '/models', label: '模型广场' },
    { to: '/docs', label: '文档' },
  ]

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    color: isActive ? (isHome ? '#a5b4fc' : 'var(--primary)') : (isHome ? 'rgba(255,255,255,.5)' : 'var(--text-secondary)'),
    fontWeight: isActive ? 600 : 500, fontSize: 14, padding: '8px 16px', borderRadius: 8, transition: 'all .15s',
  })

  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--nav-height)', background: isHome ? 'rgba(10,10,20,.85)' : 'rgba(255,255,255,.85)', backdropFilter: 'blur(12px)', borderBottom: isHome ? '1px solid rgba(255,255,255,.06)' : '1px solid var(--border)', zIndex: 100, display: 'flex', alignItems: 'center' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/favicon.svg" alt="灵境AI" style={{ width: 32, height: 32 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: isHome ? '#fff' : 'var(--text)' }}>灵镜AI</span>
        </NavLink>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="desktop-nav">
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to} style={linkStyle} end={link.to === '/'}>{link.label}</NavLink>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isLoggedIn ? (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: isHome ? 'rgba(255,255,255,.08)' : 'var(--bg)', border: isHome ? '1px solid rgba(255,255,255,.12)' : '1px solid var(--border)', color: isHome ? '#fff' : 'var(--text)', fontSize: 14, fontWeight: 500 }}>
                <Avatar name={user?.username || 'user'} size={28} />
                {user?.username || '...'}
                <ChevronDown size={14} />
              </button>
              {dropdownOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setDropdownOpen(false)} />
                  <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 210, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,.12)', zIndex: 51, overflow: 'hidden' }}>
                    {/* 用户名+余额 */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.display_name || user?.username}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        余额：<span style={{ color: 'var(--primary)', fontWeight: 600 }}>¥{((user?.quota || 0) / 500000).toFixed(2)}</span>
                      </div>
                    </div>
                    {/* 菜单项 */}
                    <div style={{ padding: '4px' }}>
                      {userMenuItems.map(item => (
                        <NavLink key={item.to} to={item.to} onClick={() => setDropdownOpen(false)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none' }}>
                          <item.icon size={15} color="#9ca3af" />{item.label}
                        </NavLink>
                      ))}
                    </div>
                    <div style={{ borderTop: '1px solid #f0f0f0', padding: 4 }}>
                      <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, width: '100%', color: 'var(--danger)', background: 'transparent', fontSize: 13, border: 'none', cursor: 'pointer' }}>
                        <LogOut size={15} />退出登录
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <NavLink to="/login" className="btn btn-ghost" style={{ fontSize: 14, color: isHome ? 'rgba(255,255,255,.6)' : undefined }}>登录</NavLink>
              <NavLink to="/register" className="btn btn-primary" style={{ fontSize: 14 }}>注册</NavLink>
            </div>
          )}
          <button onClick={() => setMenuOpen(!menuOpen)} className="mobile-menu-btn" style={{ display: 'none', background: 'none', padding: 4 }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div style={{ position: 'absolute', top: 'var(--nav-height)', left: 0, right: 0, background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)} style={{ padding: '10px 0', color: 'var(--text-secondary)', fontWeight: 500 }}>{link.label}</NavLink>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </nav>
  )
}
