import { useEffect, useState } from 'react'
import { Users, Radio, Zap, TrendingUp, CreditCard, Activity } from 'lucide-react'
import { userApi, channelApi, logApi, orderApi, referralAdminApi } from '../api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

export default function OverviewPage() {
  const [totalUsers, setTotalUsers] = useState(0)
  const [channels, setChannels] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [refStats, setRefStats] = useState<any>(null)

  useEffect(() => {
    userApi.list({ p: 0, page_size: 1000 }).then(r => { if (r.data.success) setTotalUsers(r.data.data?.length || 0) }).catch(() => {})
    channelApi.list().then(r => { if (r.data.success) setChannels(r.data.data || []) }).catch(() => {})
    logApi.list({ p: 0, page_size: 20 }).then(r => { if (r.data.success) setLogs(r.data.data || []) }).catch(() => {})
    orderApi.list({ page: 1, page_size: 10 }).then(r => { if (r.data.success) setOrders(r.data.data || []) }).catch(() => {})
    referralAdminApi.getStats().then(r => { if (r.data.success) setRefStats(r.data.data) }).catch(() => {})
  }, [])

  const activeChannels = channels.filter(c => c.status === 1).length
  const paidOrders = orders.filter(o => o.status === 'success')
  const revenue = paidOrders.reduce((s, o) => s + (o.money || 0), 0)

  // Model usage pie
  const modelUsage: Record<string, number> = {}
  logs.forEach(l => { modelUsage[l.model_name] = (modelUsage[l.model_name] || 0) + 1 })
  const pieData = Object.entries(modelUsage).slice(0, 6).map(([name, value]) => ({ name: name?.slice(0, 16), value }))

  // Request bar chart
  const barData = logs.slice().reverse().slice(0, 10).map((l, i) => ({
    idx: `${i + 1}`,
    tokens: (l.prompt_tokens || 0) + (l.completion_tokens || 0),
  }))

  const stats = [
    { label: '注册用户', value: totalUsers, icon: Users, color: '#6366f1', bg: '#eef2ff' },
    { label: '渠道', value: `${activeChannels}/${channels.length}`, icon: Radio, color: '#10b981', bg: '#dcfce7' },
    { label: '近期收入', value: `¥${revenue.toFixed(0)}`, icon: CreditCard, color: '#f59e0b', bg: '#fef3c7' },
    { label: '近期请求', value: logs.length, icon: Zap, color: '#ef4444', bg: '#fee2e2' },
    { label: '分销用户', value: refStats?.users_with_inviter ?? 0, icon: TrendingUp, color: '#8b5cf6', bg: '#ede9fe' },
    { label: '待结算佣金', value: `$${refStats?.pending_commission?.toFixed(2) || '0'}`, icon: Activity, color: '#ec4899', bg: '#fce7f3' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">数据面板</h1>
        <p className="page-desc">平台运营数据总览</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {stats.map(s => (
          <div className="stat-card" key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
              </div>
              <div style={{ background: s.bg, borderRadius: 10, padding: 10 }}><s.icon size={18} color={s.color}/></div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Token 用量趋势</span></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="idx" tick={{ fontSize: 11 }}/>
              <YAxis tick={{ fontSize: 11 }}/>
              <Tooltip/>
              <Bar dataKey="tokens" fill="#6366f1" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">模型使用分布</span></div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" label={({ name }) => name}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无数据</div>}
        </div>
      </div>

      {/* Recent logs */}
      <div className="card">
        <div className="card-header"><span className="card-title">最近调用</span></div>
        <div className="table-wrap" style={{ border: 'none' }}>
          <table>
            <thead><tr><th>时间</th><th>用户</th><th>模型</th><th>Token</th><th>渠道</th></tr></thead>
            <tbody>
              {logs.slice(0, 8).map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(l.created_at * 1000).toLocaleString('zh-CN')}</td>
                  <td><strong style={{ fontSize: 13 }}>{l.username}</strong></td>
                  <td><code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{l.model_name}</code></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{((l.prompt_tokens || 0) + (l.completion_tokens || 0)).toLocaleString()}</td>
                  <td><span className="badge badge-gray">#{l.channel_id}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`@media (max-width: 768px) { div[style*="grid-template-columns: 3fr 2fr"] { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
