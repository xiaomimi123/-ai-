import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Menu, X, ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { authApi } from '../api'
import Avatar from './Avatar'

export default function Navbar() {
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) }).catch(() => {})
    }
  }, [])

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    localStorage.removeItem('access_token')
    setUser(null)
    navigate('/login')
  }

  const isLoggedIn = !!localStorage.getItem('access_token')

  const navLinks = [
    { to: '/', label: '首页' },
    ...(isLoggedIn ? [{ to: '/dashboard', label: '控制台' }] : []),
    { to: '/models', label: '模型广场' },
    { to: '/docs', label: '文档' },
    ...(isLoggedIn ? [{ to: '/referral', label: '邀请返利' }] : []),
  ]

  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    color: isActive ? (isHome ? '#a5b4fc' : 'var(--primary)') : (isHome ? 'rgba(255,255,255,.5)' : 'var(--text-secondary)'),
    fontWeight: isActive ? 600 : 500,
    fontSize: 14,
    padding: '8px 16px',
    borderRadius: 8,
    transition: 'all .15s',
  })

  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--nav-height)', background: isHome ? 'rgba(10,10,20,.85)' : 'rgba(255,255,255,.85)', backdropFilter: 'blur(12px)', borderBottom: isHome ? '1px solid rgba(255,255,255,.06)' : '1px solid var(--border)', zIndex: 100, display: 'flex', alignItems: 'center' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* Logo */}
        <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>
            AI
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, color: isHome ? '#fff' : 'var(--text)' }}>灵镜AI</span>
        </NavLink>

        {/* Desktop Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="desktop-nav">
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to} style={linkStyle} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* Right Side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isLoggedIn ? (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: isHome ? 'rgba(255,255,255,.08)' : 'var(--bg)', border: isHome ? '1px solid rgba(255,255,255,.12)' : '1px solid var(--border)', color: isHome ? '#fff' : 'var(--text)', fontSize: 14, fontWeight: 500 }}
              >
                <Avatar name={user?.username || 'user'} size={28} />
                {user?.username || '...'}
                <ChevronDown size={14} />
              </button>
              {dropdownOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setDropdownOpen(false)} />
                  <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 200, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', zIndex: 51, overflow: 'hidden', padding: 4 }}>
                    <NavLink to="/dashboard" onClick={() => setDropdownOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                      <User size={16} />控制台
                    </NavLink>
                    <NavLink to="/orders" onClick={() => setDropdownOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                      <User size={16} />充值记录
                    </NavLink>
                    <NavLink to="/settings" onClick={() => setDropdownOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                      <Settings size={16} />个人设置
                    </NavLink>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, width: '100%', color: 'var(--danger)', background: 'transparent', fontSize: 14 }}>
                      <LogOut size={16} />退出登录
                    </button>
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

          {/* Mobile menu toggle */}
          <button onClick={() => setMenuOpen(!menuOpen)} className="mobile-menu-btn" style={{ display: 'none', background: 'none', padding: 4 }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {menuOpen && (
        <div style={{ position: 'absolute', top: 'var(--nav-height)', left: 0, right: 0, background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 4 }} className="mobile-nav">
          {navLinks.map(link => (
            <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)} style={{ padding: '10px 0', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {link.label}
            </NavLink>
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
