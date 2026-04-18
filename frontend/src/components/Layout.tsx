import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Key, CreditCard, Receipt, ScrollText,
  Cpu, BookOpen, Gift, Settings, LogOut, User, Bell,
} from 'lucide-react'
import { authApi, notificationApi } from '../api'
import Avatar from './Avatar'

const navItems = [
  { icon: LayoutDashboard, label: '控制台',   to: '/dashboard' },
  { icon: Bell,            label: '通知中心', to: '/notifications' },
  { icon: Key,             label: 'API 令牌', to: '/tokens' },
  { icon: CreditCard,      label: '充值',     to: '/topup' },
  { icon: Receipt,         label: '订单记录', to: '/orders' },
  { icon: ScrollText,      label: '用量日志', to: '/logs' },
  { icon: Cpu,             label: '模型广场', to: '/models' },
  { icon: BookOpen,        label: '接入文档', to: '/docs' },
  { icon: Gift,            label: '邀请返利', to: '/referral' },
  { icon: Settings,        label: '个人设置', to: '/settings' },
]

// 移动端底部 TabBar 5 项（日志移到"我的"页里，TabBar 留位给更常用的模型广场）
const mobileTabs = [
  { icon: LayoutDashboard, label: '控制台', to: '/dashboard' },
  { icon: Key,             label: '令牌',   to: '/tokens' },
  { icon: CreditCard,      label: '充值',   to: '/topup' },
  { icon: Cpu,             label: '模型',   to: '/models' },
  { icon: User,            label: '我的',   to: '/settings' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [unread, setUnread] = useState<number>(0)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) }).catch(() => {})
  }, [])

  // 路由变化时刷新未读数（登录后、从通知页返回等场景都能更新）
  useEffect(() => {
    if (!user) return
    notificationApi.unreadCount().then(r => {
      if (r.data.success) setUnread(r.data.data || 0)
    }).catch(() => {})
  }, [user, location.pathname])

  const handleLogout = async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
    navigate('/login')
  }

  const toDollar = (q: number) => (q / 500000).toFixed(2)
  const balance = user ? toDollar((user.quota || 0) - (user.used_quota || 0)) : '--'

  return (
    <div className="app-shell">
      {/* 侧边栏（桌面） */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <NavLink to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-logo" style={{ fontSize: 14 }}>境</div>
            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>灵镜 AI</span>
          </NavLink>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => {
            const active = location.pathname === item.to
            const showBadge = item.to === '/notifications' && unread > 0
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`sidebar-item ${active ? 'active' : ''}`}
              >
                <item.icon size={16} className="sb-icon" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {showBadge && (
                  <span style={{
                    background: 'var(--accent)', color: 'var(--primary)',
                    fontSize: 10, fontWeight: 700, padding: '1px 6px',
                    borderRadius: 10, lineHeight: 1.4, minWidth: 16, textAlign: 'center',
                  }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* 底部：用户 */}
        <div className="sidebar-footer">
          {user ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Avatar name={user.username || 'user'} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.username}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                    余额 ${balance}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="退出登录"
                  style={{ padding: 6, color: 'var(--muted)', display: 'flex', alignItems: 'center', borderRadius: 6 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-bg)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <NavLink to="/login" className="btn btn-outline btn-sm" style={{ flex: 1 }}>登录</NavLink>
              <NavLink to="/register" className="btn btn-accent btn-sm" style={{ flex: 1 }}>注册</NavLink>
            </div>
          )}
        </div>
      </aside>

      {/* 主内容 */}
      <main className="main-content">{children}</main>

      {/* 移动端 TabBar */}
      <nav className="mobile-tabbar">
        {mobileTabs.map(tab => {
          const active = location.pathname === tab.to
          return (
            <NavLink key={tab.to} to={tab.to} className={`mobile-tab ${active ? 'active' : ''}`}>
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
