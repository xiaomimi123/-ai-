import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Activity, TrendingUp, CreditCard, Key, Zap, ArrowRight, AlertTriangle, AlertCircle } from 'lucide-react'
import { authApi } from '../api'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })
// 森林绿系调色板
const COLORS = ['#2ECC71', '#0D1F14', '#16a34a', '#84cc16', '#14b8a6', '#10b981', '#65a30d', '#059669']

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

  const balanceNum = (user?.quota || 0) / 500000
  const balance = balanceNum.toFixed(2)
  const usedBalance = ((user?.used_quota || 0) / 500000).toFixed(2)
  // 低余额阈值：<=0 红色（已耗尽）/ <10 黄色（不足提醒）
  const balanceExhausted = user && balanceNum <= 0
  const balanceLow       = user && balanceNum > 0 && balanceNum < 10
  const pieData = (stats?.model_usage || []).map((m: any) => ({
    name: m.model?.length > 18 ? m.model.substring(0, 18) + '..' : m.model,
    value: m.count,
    quota: m.quota,
  }))

  const tooltipStyle = {
    fontSize: 12,
    borderRadius: 8,
    border: '0.5px solid #E4EBE5',
    boxShadow: '0 4px 16px rgba(13,31,20,.08)',
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">控制台</h1>
        <p className="page-desc">欢迎回来，{user?.display_name || user?.username}</p>
      </div>

      {/* 低余额提醒 Banner */}
      {balanceExhausted && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: 'var(--danger-bg)', color: 'var(--danger)',
          borderLeft: '3px solid var(--danger)', borderRadius: 8,
          padding: '14px 18px', marginBottom: 20,
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>账户余额已用尽</div>
            <div style={{ fontSize: 13, opacity: .85 }}>
              API 调用将被拒绝，请尽快充值恢复服务
            </div>
          </div>
          <Link to="/topup" className="btn btn-primary" style={{ flexShrink: 0, padding: '8px 16px', fontSize: 13 }}>
            立即充值 <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {balanceLow && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: '#fef9c3', color: '#854d0e',
          borderLeft: '3px solid #ca8a04', borderRadius: 8,
          padding: '14px 18px', marginBottom: 20,
        }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>余额不足 ¥10</div>
            <div style={{ fontSize: 13, opacity: .85 }}>
              当前余额 ¥{balance}，建议及时充值避免中断服务
            </div>
          </div>
          <Link to="/topup" className="btn btn-accent" style={{ flexShrink: 0, padding: '8px 16px', fontSize: 13 }}>
            充值 <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* 顶部统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* 余额卡 - 深绿色 */}
        <div className="card" style={{ background: 'var(--primary)', color: '#fff', border: 'none', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute',
            top: -30, right: -30,
            width: 120, height: 120,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(46,204,113,.25) 0%, transparent 70%)',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 12, opacity: .75, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>账户余额</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>¥{balance}</div>
            <div style={{ fontSize: 12, opacity: .7, marginTop: 4 }}>已消费 ¥{usedBalance}</div>
            <Link to="/topup" style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--accent)', color: 'var(--primary)',
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              marginTop: 12, textDecoration: 'none',
            }}>
              充值 <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* 今日调用 */}
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">今日调用</div>
              <div className="stat-value">{stats?.today?.count || 0}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>消费 ¥{(stats?.today?.cost || 0).toFixed(4)}</div>
            </div>
            <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: 9, display: 'flex' }}>
              <Activity size={18} color="var(--accent)" />
            </div>
          </div>
        </div>

        {/* 本月调用 */}
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">本月调用</div>
              <div className="stat-value">{(stats?.month?.count || 0).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>消费 ¥{(stats?.month?.cost || 0).toFixed(2)}</div>
            </div>
            <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: 9, display: 'flex' }}>
              <TrendingUp size={18} color="var(--accent)" />
            </div>
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="stat-label">快捷操作</div>
          <Link to="/tokens" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}>
            <Key size={15} color="var(--accent)" /> API 令牌
          </Link>
          <Link to="/docs" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}>
            <Zap size={15} color="var(--accent)" /> 接入文档
          </Link>
          <Link to="/topup" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}>
            <CreditCard size={15} color="var(--accent)" /> 充值额度
          </Link>
        </div>
      </div>

      {/* 近 7 天调用趋势 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 600, fontSize: 15 }}>近 7 天调用趋势</h3>
          <Link to="/logs" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            查看日志 →
          </Link>
        </div>
        {stats?.daily_usage?.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.daily_usage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2ECC71" stopOpacity={0.28}/>
                  <stop offset="100%" stopColor="#2ECC71" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EBE5"/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7A8A7E' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#7A8A7E' }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Area type="monotone" dataKey="count" name="调用次数" stroke="#2ECC71" fill="url(#cg)" strokeWidth={2} dot={{ fill: '#2ECC71', r: 3 }}/>
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无调用记录</div>
        )}
      </div>

      {/* 消费 + 模型分布 */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>近 7 天消费（元）</h3>
          {stats?.daily_usage?.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.daily_usage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4EBE5"/>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7A8A7E' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: '#7A8A7E' }} tickFormatter={(v: number) => `¥${(v / 500000).toFixed(2)}`} axisLine={false} tickLine={false}/>
                <Tooltip formatter={(v: any) => [`¥${(Number(v) / 500000).toFixed(4)}`, '消费']} contentStyle={tooltipStyle}/>
                <Bar dataKey="quota" name="消费" fill="#0D1F14" radius={[4, 4, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无数据</div>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>模型使用分布</h3>
          {pieData.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {pieData.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }}/>
                    <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    <span style={{ fontWeight: 600 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>暂无数据</div>
          )}
        </div>
      </div>

      {stats?.daily_usage?.some((d: any) => d.input_token > 0) && (
        <div className="card">
          <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>近 7 天 Token 用量</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.daily_usage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4EBE5"/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7A8A7E' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#7A8A7E' }} tickFormatter={(v: number) => v > 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tooltipStyle}/>
              <Legend wrapperStyle={{ fontSize: 12 }}/>
              <Bar dataKey="input_token" name="输入" fill="#2ECC71" radius={[3, 3, 0, 0]} stackId="a"/>
              <Bar dataKey="output_token" name="输出" fill="#0D1F14" radius={[3, 3, 0, 0]} stackId="a"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
