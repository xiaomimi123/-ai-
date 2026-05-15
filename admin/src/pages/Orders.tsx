import { useEffect, useState } from 'react'
import { Check, ShoppingBag } from 'lucide-react'
import Pagination from '../components/Pagination'
import { orderApi } from '../api'
import toast from 'react-hot-toast'
import { PageHeader } from '../components/PageHeader'
import { FilterTabs } from '../components/FilterTabs'
import { SearchInput } from '../components/SearchInput'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyCard } from '../components/EmptyCard'

// 后端 Order.status: 0=待支付 1=已支付 2=已取消
const STATUS: Record<number, { label: string; cls: string }> = {
  0: { label: '待支付', cls: 'badge-yellow' },
  1: { label: '已完成', cls: 'badge-green' },
  2: { label: '已取消', cls: 'badge-gray' },
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: '',   label: '全部' },
  { key: '0',  label: '待支付' },
  { key: '1',  label: '已完成' },
  { key: '2',  label: '已取消' },
]

interface Order {
  id: number
  user_id: number
  username?: string
  email?: string
  order_no: string
  trade_no: string
  amount: number
  quota: number
  status: number
  payment_method: string
  remark?: string
  created_at: number
  paid_at: number
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [username, setUsername] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [completeTarget, setCompleteTarget] = useState<Order | null>(null)

  const PAGE_SIZE = 15
  const load = () => {
    const params: { page?: number; page_size?: number; status?: string; username?: string } = {
      page,
      page_size: PAGE_SIZE,
    }
    if (status) params.status = status
    if (username) params.username = username
    orderApi.list(params).then(r => {
      if (r.data.success) {
        setOrders(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => {})
  }
  useEffect(() => { load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page, status, username])

  const handleComplete = (o: Order) => {
    setCompleteTarget(o)
  }

  const doComplete = async () => {
    if (!completeTarget) return
    try {
      const r = await orderApi.complete(completeTarget.order_no)
      if (r.data.success) { toast.success(r.data.message || '补单成功'); load() }
      else toast.error(r.data.message || '补单失败')
    } catch { toast.error('网络错误') } finally { setCompleteTarget(null) }
  }


  return (
    <div>
      <PageHeader
        title="订单管理"
        description="全平台充值订单记录 · 可手动补单"
        icon={ShoppingBag}
      />

      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterTabs
          value={status}
          onChange={v => { setStatus(v); setPage(1) }}
          options={STATUS_TABS.map(t => ({ label: t.label, value: t.key }))}
        />
        <div style={{ marginLeft: 'auto' }}>
          <SearchInput
            value={usernameInput}
            onChange={setUsernameInput}
            onSubmit={() => { setUsername(usernameInput.trim()); setPage(1) }}
            placeholder="按用户名精确筛选"
            width={240}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>用户</th>
              <th>订单号</th>
              <th>金额 (¥)</th>
              <th>额度 ($)</th>
              <th>支付方式</th>
              <th>状态</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0
              ? <tr><td colSpan={9} style={{ padding: 0 }}>
                  <EmptyCard
                    icon={ShoppingBag}
                    title="暂无订单"
                    description={(status || username) ? '试试别的筛选条件' : ''}
                  />
                </td></tr>
              : orders.map(o => {
                  const st = STATUS[o.status] || { label: `状态${o.status}`, cls: 'badge-gray' }
                  return (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{o.id}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{o.username || `#${o.user_id}`}</div>
                        {o.email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.email}</div>}
                      </td>
                      <td><code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>{o.order_no}</code></td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>¥{o.amount?.toFixed(2)}</td>
                      <td style={{ fontFamily: 'monospace' }}>${(o.quota / 500000).toFixed(2)}</td>
                      <td><span className="badge badge-gray">{o.payment_method || '-'}</span></td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {o.created_at ? new Date(o.created_at * 1000).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td>
                        {o.status === 0 && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleComplete(o)}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                          >
                            <Check size={12}/>补单
                          </button>
                        )}
                        {o.status === 1 && o.trade_no && (
                          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }} title={o.trade_no}>
                            {o.trade_no.slice(0, 12)}...
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <ConfirmDialog
        open={!!completeTarget}
        title="确认手动补单"
        description={
          <>
            订单号: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>{completeTarget?.order_no}</code><br />
            用户: <strong>{completeTarget?.username || `#${completeTarget?.user_id}`}</strong><br />
            金额: <strong>¥{completeTarget?.amount?.toFixed(2)}</strong> · 额度: <strong>${((completeTarget?.quota || 0) / 500000).toFixed(2)}</strong>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              执行后将：订单状态改为「已完成」 · 用户账户余额增加 · 给用户发送「充值成功」通知
            </div>
          </>
        }
        confirmLabel="补单"
        confirmVariant="primary"
        onConfirm={doComplete}
        onCancel={() => setCompleteTarget(null)}
      />
    </div>
  )
}
