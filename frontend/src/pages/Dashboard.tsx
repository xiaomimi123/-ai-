import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Wallet, Zap, Key, TrendingUp, CreditCard, ScrollText, Settings, Gift, Receipt } from 'lucide-react'
import { authApi, tokenApi, logApi } from '../api'
import Avatar from '../components/Avatar'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [tokenCount, setTokenCount] = useState(0)
  const [recentLogs, setRecentLogs] = useState<any[]>([])

  useEffect(() => {
    authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) })
    tokenApi.list().then(r => { if (r.data.success) setTokenCount(r.data.data?.length || 0) })
    logApi.list({ page: 1, page_size: 7 }).then(r => { if (r.data.success) setRecentLogs(r.data.data || []) })
  }, [])

  const toYuan = (q: number) => (q / 500000).toFixed(2)

  const chartData = recentLogs.length > 0
    ? recentLogs.slice().reverse().map((log, i) => ({
        idx: `${i + 1}`,
        tokens: (log.prompt_tokens || 0) + (log.completion_tokens || 0),
      }))
    : [{ idx: '1', tokens: 0 }, { idx: '2', tokens: 0 }, { idx: '3', tokens: 0 }]

  const quickLinks = [
    { to: '/tokens', icon: Key, label: 'API 令牌', desc: '管理密钥' },
    { to: '/topup', icon: CreditCard, label: '充值', desc: '添加额度' },
    { to: '/referral', icon: Gift, label: '邀请返利', desc: '邀请好友赚佣金' },
    { to: '/orders', icon: Receipt, label: '充值记录', desc: '查看订单' },
    { to: '/logs', icon: ScrollText, label: '用量日志', desc: '调用记录' },
    { to: '/settings', icon: Settings, label: '个人设置', desc: '修改密码' },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar name={user?.username || 'user'} size={48} />
        <div>
          <h1 className="page-title">你好，{user?.username || '...'}</h1>
          <p className="page-desc">API 使用概览</p>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 28 }}>
        {[
          { label: '剩余额度', value: user ? `$${toYuan(user.quota - user.used_quota)}` : '--', icon: Wallet, color: 'var(--primary)', bg: 'var(--primary-50)' },
          { label: '已消耗', value: user ? `$${toYuan(user.used_quota)}` : '--', icon: Zap, color: 'var(--warning)', bg: '#fef3c7' },
          { label: 'API 令牌', value: `${tokenCount} 个`, icon: Key, color: 'var(--success)', bg: '#dcfce7' },
          { label: '请求次数', value: user?.request_count?.toLocaleString() || '0', icon: TrendingUp, color: '#7c3aed', bg: '#ede9fe' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
              <div style={{ background: s.bg, borderRadius: 10, padding: 10 }}>
                <s.icon size={20} color={s.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* Chart */}
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: 20, fontSize: 15 }}>近期 Token 用量</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="idx" tick={{ fontSize: 12 }}/>
              <YAxis tick={{ fontSize: 12 }}/>
              <Tooltip/>
              <Area type="monotone" dataKey="tokens" stroke="#3b82f6" strokeWidth={2} fill="url(#grad)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Links */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>快捷入口</h3>
          {quickLinks.map(link => (
            <NavLink key={link.to} to={link.to} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', transition: 'all .15s' }}>
              <div style={{ background: 'var(--primary-50)', borderRadius: 8, padding: 8 }}>
                <link.icon size={18} color="var(--primary)" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{link.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{link.desc}</div>
              </div>
            </NavLink>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
