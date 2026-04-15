import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Activity, TrendingUp, CreditCard, Key, Zap, ArrowRight } from 'lucide-react'
import { authApi } from '../api'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })
const COLORS = ['#4f6ef7', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      authApi.getSelf(),
      http.get('/api/lingjing/stats/dashboard'),
    ]).then(([userRes, statsRes]) => {
      if (userRes.data.success) setUser(userRes.data.data)
      if (statsRes.data.success) setStats(statsRes.data.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>加载中...</div>

  const balance = ((user?.quota || 0) / 500000).toFixed(2)
  const usedBalance = ((user?.used_quota || 0) / 500000).toFixed(2)
  const pieData = (stats?.model_usage || []).map((m: any) => ({ name: m.model?.length > 18 ? m.model.substring(0, 18) + '..' : m.model, value: m.count, quota: m.quota }))

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>控制台</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>欢迎回来，{user?.display_name || user?.username}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)', color: 'white', border: 'none' }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>账户余额</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>¥{balance}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>已消费 ¥{usedBalance}</div>
          <Link to="/topup" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.2)', color: 'white', padding: '4px 12px', borderRadius: 20, fontSize: 12, marginTop: 12, textDecoration: 'none' }}>充值 <ArrowRight size={12} /></Link>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>今日调用</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{stats?.today?.count || 0}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>消费 ¥{(stats?.today?.cost || 0).toFixed(4)}</div>
            </div>
            <div style={{ background: 'var(--primary-50)', borderRadius: 10, padding: 10, height: 'fit-content' }}><Activity size={20} color="var(--primary)" /></div>
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>本月调用</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>{(stats?.month?.count || 0).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>消费 ¥{(stats?.month?.cost || 0).toFixed(2)}</div>
            </div>
            <div style={{ background: '#dcfce7', borderRadius: 10, padding: 10, height: 'fit-content' }}><TrendingUp size={20} color="#10b981" /></div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>快捷操作</div>
          <Link to="/tokens" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}><Key size={15} color="var(--primary)" /> API 令牌</Link>
          <Link to="/docs" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}><Zap size={15} color="#f59e0b" /> 接入文档</Link>
          <Link to="/topup" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}><CreditCard size={15} color="#10b981" /> 充值额度</Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>近7天调用趋势</h3>
          <Link to="/logs" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>查看日志 →</Link>
        </div>
        {stats?.daily_usage?.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.daily_usage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f6ef7" stopOpacity={0.15}/><stop offset="95%" stopColor="#4f6ef7" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}/><YAxis tick={{ fontSize: 11, fill: '#9ca3af' }}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/><Area type="monotone" dataKey="count" name="调用次数" stroke="#4f6ef7" fill="url(#cg)" strokeWidth={2} dot={{ fill: '#4f6ef7', r: 3 }}/>
            </AreaChart>
          </ResponsiveContainer>
        ) : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无调用记录</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>近7天消费（元）</h3>
          {stats?.daily_usage?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.daily_usage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}/><YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => `¥${(v/500000).toFixed(2)}`}/>
                <Tooltip formatter={(v: any) => [`¥${(Number(v)/500000).toFixed(4)}`, '消费']} contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                <Bar dataKey="quota" name="消费" fill="#8b5cf6" radius={[4, 4, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无数据</div>}
        </div>
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>模型使用分布</h3>
          {pieData.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ResponsiveContainer width="55%" height={200}>
                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                  {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie><Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/></PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>{pieData.slice(0, 5).map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }}/>
                  <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <span style={{ fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}</div>
            </div>
          ) : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无数据</div>}
        </div>
      </div>

      {stats?.daily_usage?.some((d: any) => d.input_token > 0) && (
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>近7天 Token 用量</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.daily_usage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/><XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}/><YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => v > 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/><Legend wrapperStyle={{ fontSize: 12 }}/>
              <Bar dataKey="input_token" name="输入" fill="#4f6ef7" radius={[3, 3, 0, 0]} stackId="a"/>
              <Bar dataKey="output_token" name="输出" fill="#8b5cf6" radius={[3, 3, 0, 0]} stackId="a"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <style>{`@media (max-width: 768px) { div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
