import { useEffect, useState } from 'react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Users, Activity, TrendingUp, DollarSign, Server, Zap } from 'lucide-react'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

export default function OverviewPage() {
  const [stats, setStats] = useState<any>(null)
  const [realtime, setRealtime] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<7 | 30>(30)

  useEffect(() => {
    Promise.all([
      http.get('/api/admin/stats/dashboard'),
      http.get('/api/admin/stats/realtime'),
    ]).then(([statsRes, rtRes]) => {
      if (statsRes.data.success) setStats(statsRes.data.data)
      if (rtRes.data.success) setRealtime(rtRes.data.data)
    }).catch(() => {}).finally(() => setLoading(false))

    const timer = setInterval(() => {
      http.get('/api/admin/stats/realtime').then(r => { if (r.data.success) setRealtime(r.data.data) }).catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>加载中...</div>

  const summary = stats?.summary || {}
  const chartData = timeRange === 7 ? (stats?.daily_revenue || []).slice(-7) : (stats?.daily_revenue || [])
  const channelStats = stats?.channel_stats || []
  const activeChannels = channelStats.find((s: any) => s.status === 1)?.count || 0
  const totalChannels = channelStats.reduce((acc: number, s: any) => acc + Number(s.count), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>数据概览</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
          实时 · 过去1小时 {realtime?.hour_calls || 0} 次调用
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: '总用户', value: summary.total_users?.toLocaleString() || '0', sub: `今日 +${summary.today_new_users || 0}`, icon: Users, color: '#4f6ef7', bg: 'var(--primary-50)' },
          { label: '今日调用', value: (summary.today_calls || 0).toLocaleString(), sub: `¥${(summary.today_revenue || 0).toFixed(2)}`, icon: Activity, color: '#10b981', bg: '#dcfce7' },
          { label: '本月调用', value: (summary.month_calls || 0).toLocaleString(), sub: `¥${(summary.month_revenue || 0).toFixed(2)}`, icon: TrendingUp, color: '#8b5cf6', bg: '#ede9fe' },
          { label: '累计收入', value: `¥${(summary.total_revenue || 0).toFixed(0)}`, sub: `${(summary.total_calls || 0).toLocaleString()} 次`, icon: DollarSign, color: '#f59e0b', bg: '#fef3c7' },
          { label: '活跃渠道', value: `${activeChannels}/${totalChannels}`, sub: '运行中', icon: Server, color: '#10b981', bg: '#dcfce7' },
          { label: '过去1小时', value: `${realtime?.hour_calls || 0}`, sub: '实时调用', icon: Zap, color: '#ef4444', bg: '#fee2e2' },
        ].map(c => (
          <div className="card" key={c.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{c.sub}</div>
              </div>
              <div style={{ background: c.bg, borderRadius: 10, padding: 8 }}><c.icon size={18} color={c.color}/></div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>收入与调用趋势</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {([7, 30] as const).map(d => (
              <button key={d} onClick={() => setTimeRange(d)} className={`btn btn-sm ${timeRange === d ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: 12, padding: '4px 12px' }}>近{d}天</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f6ef7" stopOpacity={0.15}/><stop offset="95%" stopColor="#4f6ef7" stopOpacity={0}/></linearGradient>
              <linearGradient id="clg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={timeRange === 30 ? 4 : 0}/>
            <YAxis yAxisId="rev" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => `¥${v.toFixed(0)}`}/>
            <YAxis yAxisId="cnt" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }}/>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any, name: any) => [String(name).includes('收入') ? `¥${Number(v).toFixed(2)}` : v, name]}/>
            <Legend wrapperStyle={{ fontSize: 12 }}/>
            <Area yAxisId="rev" type="monotone" dataKey="revenue" name="收入(元)" stroke="#4f6ef7" fill="url(#rg)" strokeWidth={2}/>
            <Area yAxisId="cnt" type="monotone" dataKey="count" name="调用次数" stroke="#10b981" fill="url(#clg)" strokeWidth={2}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>模型调用排行（近7天）</h3>
          {(stats?.model_rank || []).length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={(stats.model_rank || []).slice(0, 6).map((m: any) => ({ ...m, model: m.model?.length > 14 ? m.model.substring(0, 14) + '..' : m.model }))} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/><XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }}/><YAxis type="category" dataKey="model" tick={{ fontSize: 10, fill: '#6b7280' }} width={100}/>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/><Bar dataKey="count" name="调用次数" fill="#4f6ef7" radius={[0, 4, 4, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无数据</div>}
        </div>
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>用户消费排行（本月）</h3>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table style={{ fontSize: 12 }}>
              <thead><tr><th style={{ width: 30 }}>#</th><th>用户</th><th style={{ textAlign: 'right' }}>消费</th><th style={{ textAlign: 'right' }}>调用</th></tr></thead>
              <tbody>
                {(stats?.user_rank || []).length ? (stats.user_rank || []).map((u: any, i: number) => (
                  <tr key={u.user_id}><td style={{ color: i < 3 ? '#f59e0b' : 'var(--muted)', fontWeight: i < 3 ? 700 : 400 }}>{i + 1}</td>
                  <td>{u.username}</td><td style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>¥{(u.quota / 500000).toFixed(2)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{u.count}</td></tr>
                )) : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>暂无数据</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>活跃用户趋势</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={timeRange === 30 ? 4 : 0}/><YAxis tick={{ fontSize: 11, fill: '#9ca3af' }}/>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/><Line type="monotone" dataKey="users" name="活跃用户" stroke="#8b5cf6" strokeWidth={2} dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <style>{`@media (max-width: 768px) { div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
