import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, TrendingDown, Wallet, Plus, Edit2, Trash2 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import toast from 'react-hot-toast'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { FilterTabs } from '../components/FilterTabs'
import { SearchInput } from '../components/SearchInput'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyCard } from '../components/EmptyCard'
import Pagination from '../components/Pagination'
import { FinanceRecordModal, type LedgerForm } from '../components/FinanceRecordModal'
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

interface LedgerRow {
  id: number
  occur_date: string
  upstream: string
  type: 'expense' | 'refund'
  amount_usd: number
  remark: string
  created_at: number
  created_by: number
}

const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: '本日', value: 'day' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
]

const PAGE_SIZE = 15

export default function FinancePage() {
  const [range, setRange] = useState<RangeKey>('month')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])

  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerUpstream, setLedgerUpstream] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ id: number; data: LedgerForm } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LedgerRow | null>(null)

  const loadSummary = () => {
    financeApi.summary({ range }).then(r => {
      if (r.data.success) setSummary(r.data.data)
    }).catch(() => toast.error('加载摘要失败'))
  }

  const loadTrend = () => {
    financeApi.trend(30).then(r => {
      if (r.data.success) setTrend(r.data.data || [])
    }).catch(() => {})
  }

  const loadLedger = () => {
    financeApi.listLedger({
      page: ledgerPage,
      page_size: PAGE_SIZE,
      upstream: ledgerUpstream || undefined,
    }).then(r => {
      if (r.data.success) {
        setLedger(r.data.data || [])
        setLedgerTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载记账失败'))
  }

  useEffect(() => { loadSummary(); loadTrend() /* eslint-disable-next-line */ }, [range])
  useEffect(() => { loadLedger() /* eslint-disable-next-line */ }, [ledgerPage, ledgerUpstream])

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (row: LedgerRow) => {
    setEditing({
      id: row.id,
      data: {
        occur_date: row.occur_date,
        upstream: row.upstream,
        type: row.type,
        amount_usd: String(row.amount_usd),
        remark: row.remark,
      },
    })
    setModalOpen(true)
  }

  const handleSubmit = async (form: LedgerForm) => {
    const amount = parseFloat(form.amount_usd) || 0
    if (amount <= 0) { toast.error('金额必须 > 0'); return }
    if (!form.upstream.trim()) { toast.error('请填写上游'); return }
    const payload = {
      occur_date: form.occur_date,
      upstream: form.upstream.trim(),
      type: form.type,
      amount_usd: amount,
      remark: form.remark,
    }
    try {
      const r = editing
        ? await financeApi.updateLedger(editing.id, payload)
        : await financeApi.createLedger(payload)
      if (r.data.success) {
        toast.success(editing ? '已保存' : '已新增')
        setModalOpen(false)
        loadLedger()
        loadSummary()
        loadTrend()
      } else {
        toast.error(r.data.message || '保存失败')
      }
    } catch { toast.error('网络错误') }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    try {
      const r = await financeApi.deleteLedger(deleteTarget.id)
      if (r.data.success) {
        toast.success('已删除')
        loadLedger()
        loadSummary()
        loadTrend()
      } else toast.error(r.data.message || '删除失败')
    } catch { toast.error('删除失败') } finally { setDeleteTarget(null) }
  }

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`
  const fmtCny = (n: number) => `¥${(n || 0).toFixed(2)}`
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
            暂无数据
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

      {/* 上游记账 */}
      <PageHeader
        title="上游记账"
        description={`共 ${ledgerTotal} 条`}
        actions={
          <>
            <SearchInput
              value={ledgerUpstream}
              onChange={v => { setLedgerUpstream(v); setLedgerPage(1) }}
              placeholder="按上游过滤"
              width={200}
              debounce={300}
            />
            <button className="btn btn-primary" onClick={openCreate}><Plus size={14}/>新增记账</button>
          </>
        }
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>上游</th>
              <th>类型</th>
              <th style={{ textAlign: 'right' }}>金额 ($)</th>
              <th>备注</th>
              <th style={{ width: 120 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 0 }}>
                <EmptyCard
                  icon={DollarSign}
                  title={ledgerUpstream ? '没有匹配的记账' : '暂无记账'}
                  description={ledgerUpstream ? '试试别的上游名' : '点击右上角「新增记账」记录第一笔上游成本'}
                />
              </td></tr>
            ) : ledger.map(row => (
              <tr key={row.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.occur_date}</td>
                <td><strong>{row.upstream}</strong></td>
                <td>
                  <span className={`badge ${row.type === 'expense' ? 'badge-orange' : 'badge-info'}`} style={{ fontSize: 11 }}>
                    {row.type === 'expense' ? '支出' : '退款'}
                  </span>
                </td>
                <td style={{
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: row.type === 'expense' ? 'var(--warning)' : 'var(--info)',
                }}>
                  {row.type === 'expense' ? '+' : '-'}${row.amount_usd.toFixed(2)}
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.remark || '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon" title="编辑" onClick={() => openEdit(row)}>
                      <Edit2 size={14} color="var(--primary)"/>
                    </button>
                    <button className="btn btn-ghost btn-icon" title="删除" onClick={() => setDeleteTarget(row)}>
                      <Trash2 size={14} color="var(--danger)"/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={ledgerPage} pageSize={PAGE_SIZE} total={ledgerTotal} onChange={setLedgerPage} />

      <FinanceRecordModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除记账"
        description={<>
          {deleteTarget?.occur_date} 的「<strong>{deleteTarget?.upstream}</strong>」
          {deleteTarget?.type === 'expense' ? '支出' : '退款'} ${deleteTarget?.amount_usd.toFixed(2)} 将被删除。<br/>
          删除后 summary 会立刻刷新。
        </>}
        confirmLabel="删除"
        confirmVariant="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
