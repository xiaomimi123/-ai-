import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { FilterTabs } from '../../components/FilterTabs'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface Order {
  id: number
  user_id: number
  username: string
  email: string
  order_no: string
  amount: number
  quota: number
  status: number
  payment_method: string
  created_at: number
  paid_at: number
}

const STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '待支付', value: '0' },
  { label: '已完成', value: '1' },
  { label: '已取消', value: '2' },
]

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  0: { label: '待支付', cls: 'badge-yellow' },
  1: { label: '已完成', cls: 'badge-green' },
  2: { label: '已取消', cls: 'badge-gray' },
}

const PAGE_SIZE = 15

export default function AgentTeamOrdersPage() {
  const [list, setList] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')

  useEffect(() => {
    agentApi.teamOrders({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载失败'))
  }, [page, status])

  return (
    <div>
      <PageHeader
        title="团队订单"
        description={`共 ${total} 笔订单`}
        icon={CreditCard}
      />

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
              <th>下单用户</th>
              <th>订单号</th>
              <th style={{ textAlign: 'right' }}>金额 (¥)</th>
              <th style={{ textAlign: 'right' }}>额度 ($)</th>
              <th>支付方式</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 0 }}>
                <EmptyCard
                  icon={CreditCard}
                  title={status ? '该状态下暂无订单' : '暂无订单'}
                  description={status ? '试试别的状态' : '团队成员充值后会出现在这里'}
                />
              </td></tr>
            ) : list.map(o => {
              const st = STATUS_MAP[o.status] || { label: '未知', cls: 'badge-gray' }
              return (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{o.username || `#${o.user_id}`}</div>
                    {o.email && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{o.email}</div>}
                  </td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>{o.order_no}</code>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>¥{o.amount?.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>${(o.quota / 500000).toFixed(2)}</td>
                  <td><span className="badge badge-gray">{o.payment_method || '-'}</span></td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {o.created_at ? new Date(o.created_at * 1000).toLocaleString('zh-CN') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
