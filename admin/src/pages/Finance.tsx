import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import toast from 'react-hot-toast'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { FilterTabs } from '../components/FilterTabs'
import { financeApi } from '../api'

type RangeKey = 'day' | 'week' | 'month' | 'year' | 'custom'

interface Summary {
  range: string
  from: string
  to: string
  revenue_usd: number
  order_count: number
  avg_order_usd: number
  cost_usd: number
  cost_by_upstream: { upstream: string; amount: number }[]
  profit_usd: number
  profit_margin: number
  prev_period: { revenue_usd: number; cost_usd: number; profit_usd: number }
}

interface TrendPoint {
  date: string
  revenue: number
  cost: number
  profit: number
}

const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: '本日', value: 'day' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
]

export default function FinancePage() {
  const [range, setRange] = useState<RangeKey>('month')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      financeApi.summary({ range }),
      financeApi.trend(30),
    ]).then(([sumRes, trendRes]) => {
      if (sumRes.data.success) setSummary(sumRes.data.data)
      if (trendRes.data.success) setTrend(trendRes.data.data || [])
    }).catch(() => toast.error('加载失败')).finally(() => setLoading(false))
  }, [range])

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`
  const fmtCny = (n: number) => `¥${(n || 0).toFixed(2)}` // 1:1 USD 假设：数字 = USD 值，按充值规则显 ¥

  const deltaPct = (cur: number, prev: number): { text: string; up: boolean | null } => {
    if (!prev) return { text: '—', up: null }
    const diff = ((cur - prev) / prev) * 100
    return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, up: diff >= 0 }
  }

  const revDelta = summary ? deltaPct(summary.revenue_usd, summary.prev_period.revenue_usd) : { text: '—', up: null }
  const costDelta = summary ? deltaPct(summary.cost_usd, summary.prev_period.cost_usd) : { text: '—', up: null }
  const profitDelta = summary ? deltaPct(summary.profit_usd, summary.prev_period.profit_usd) : { text: '—', up: null }

  const costByUpstreamLine = (summary?.cost_by_upstream || [])
    .slice(0, 3)
    .map(c => `${c.upstream} $${c.amount.toFixed(0)}`)
    .join(' / ')

  return (
    <div>
      <PageHeader
        title="财务统计"
        description={summary ? `${summary.from} → ${summary.to}` : '加载中...'}
        icon={DollarSign}
        actions={
          <FilterTabs
            value={range}
            onChange={v => setRange(v as RangeKey)}
            options={RANGE_OPTIONS}
          />
        }
      />

      {/* 3 卡片 */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="营收 · 充值流水"
          value={summary ? fmtCny(summary.revenue_usd) : '—'}
          icon={TrendingUp}
          color="success"
          hint={summary ? `${revDelta.text} · ${summary.order_count} 单 · 客单 ${fmtCny(summary.avg_order_usd)}` : ''}
        />
        <StatCard
          label="上游成本"
          value={summary ? fmtUsd(summary.cost_usd) : '—'}
          icon={TrendingDown}
          color="warning"
          hint={summary ? (costByUpstreamLine || costDelta.text) : ''}
        />
        <StatCard
          label="净利润"
          value={summary ? fmtUsd(summary.profit_usd) : '—'}
          icon={Wallet}
          color={summary && summary.profit_usd < 0 ? 'danger' : 'accent'}
          hint={summary ? `毛利率 ${summary.profit_margin.toFixed(1)}% · ${profitDelta.text}` : ''}
        />
      </div>

      {/* 趋势图 */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
          30 天趋势 — 营收 · 成本 · 利润
        </div>
        {trend.length === 0 ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            {loading ? '加载中...' : '暂无数据'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2ECC71" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#2ECC71" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="costG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="profG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1a2e1f" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1a2e1f" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => `$${v.toFixed(0)}`}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => `$${Number(v).toFixed(2)}`}/>
              <Legend wrapperStyle={{ fontSize: 12 }}/>
              <Area type="monotone" dataKey="revenue" name="营收" stroke="#2ECC71" fill="url(#revG)" strokeWidth={2}/>
              <Area type="monotone" dataKey="cost" name="成本" stroke="#F59E0B" fill="url(#costG)" strokeWidth={2}/>
              <Area type="monotone" dataKey="profit" name="利润" stroke="#1a2e1f" fill="url(#profG)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 上游记账 — F2.3 接入 */}
      <div className="card" style={{ padding: 16, color: 'var(--text-secondary)', textAlign: 'center' }}>
        上游记账表 — F2.3 接入
      </div>
    </div>
  )
}
