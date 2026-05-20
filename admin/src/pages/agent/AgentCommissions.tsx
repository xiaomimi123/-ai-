import { useEffect, useState } from 'react'
import { TrendingUp, DollarSign, Clock, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { FilterTabs } from '../../components/FilterTabs'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface Commission {
  id: number
  from_user_id: number
  from_username: string
  order_id: number
  amount: number
  status: number
  settled_via: string
  created_at: string
}

interface Stats {
  total: number
  pending: number
  settled: number
}

// Commission.status: 0=pending, 1=settled, 99=disabled-snapshot
const STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '待结算', value: '0' },
  { label: '已结算', value: '1' },
]

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  0:  { label: '待结算', cls: 'badge-yellow' },
  1:  { label: '已结算', cls: 'badge-green' },
  99: { label: '快照',   cls: 'badge-gray' },
}

const PAGE_SIZE = 15

export default function AgentCommissionsPage() {
  const [list, setList] = useState<Commission[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  useEffect(() => {
    agentApi.myCommissions({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
        if (r.data.stats) setStats(r.data.stats)
      }
    }).catch(() => toast.error('加载失败'))
  }, [page, status])

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`

  return (
    <div>
      <PageHeader
        title="我的佣金"
        description="您作为邀请人收到的所有佣金记录"
        icon={TrendingUp}
      />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="累计佣金"
          value={stats ? fmtUsd(stats.total) : '—'}
          icon={DollarSign}
          color="accent"
          hint="待结算 + 已结算"
        />
        <StatCard
          label="待结算"
          value={stats ? fmtUsd(stats.pending) : '—'}
          icon={Clock}
          color="warning"
          hint="即将到账"
        />
        <StatCard
          label="已结算"
          value={stats ? fmtUsd(stats.settled) : '—'}
          icon={CheckCircle}
          color="success"
          hint="可提现"
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <FilterTabs
          value={status}
          onChange={v => { setStatus(v); setPage(1) }}
          options={STATUS_TABS}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>来源用户</th>
              <th>订单</th>
              <th style={{ textAlign: 'right' }}>金额 ($)</th>
              <th>状态</th>
              <th>结算方式</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 0 }}>
                <EmptyCard
                  icon={TrendingUp}
                  title={status ? '该状态下暂无佣金' : '暂无佣金记录'}
                  description={status ? '试试别的状态' : '团队成员充值时您会自动获得佣金'}
                />
              </td></tr>
            ) : list.map(c => {
              const st = STATUS_MAP[c.status] || { label: '未知', cls: 'badge-gray' }
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.from_username || `#${c.from_user_id}`}</strong>
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>#{c.order_id}</code>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>
                    ${c.amount.toFixed(2)}
                  </td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.settled_via || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleString('zh-CN') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <div className="card" style={{ padding: 16, marginTop: 16, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)', fontSize: 13 }}>结算说明</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li><strong>待结算</strong>：佣金已计算完成，等待管理员审核结算</li>
          <li><strong>已结算</strong>：已可提现；提现请联系管理员</li>
          <li><strong>结算方式</strong>：quota = 转账到账户余额；withdraw = 走支付宝打款</li>
        </ul>
      </div>
    </div>
  )
}
