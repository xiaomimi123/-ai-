import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { orderApi } from '../api'
import toast from 'react-hot-toast'

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

  const load = () => {
    const params: { page?: number; page_size?: number; status?: string; username?: string } = {
      page,
      page_size: 20,
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

  const handleComplete = async (o: Order) => {
    if (!confirm(`确认手动补单？\n\n订单号: ${o.order_no}\n用户: ${o.username || `#${o.user_id}`}\n金额: ¥${o.amount?.toFixed(2)}\n额度: ${(o.quota / 500000).toFixed(2)} 元\n\n执行后将：\n• 订单状态改为「已完成」\n• 用户账户余额增加 ${(o.quota / 500000).toFixed(2)} 元\n• 给用户发送「充值成功」通知`)) return
    try {
      const r = await orderApi.complete(o.order_no)
      if (r.data.success) { toast.success(r.data.message || '补单成功'); load() }
      else toast.error(r.data.message || '补单失败')
    } catch { toast.error('网络错误') }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">订单管理</h1>
        <p className="page-desc">全平台充值订单记录 · 可手动补单</p>
      </div>

      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setStatus(t.key); setPage(1) }}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                border: status === t.key ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: status === t.key ? 'var(--primary-50)' : '#fff',
                color: status === t.key ? 'var(--primary)' : 'var(--text)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: 220, marginLeft: 'auto' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            placeholder="按用户名精确筛选"
            value={usernameInput}
            onChange={e => setUsernameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setUsername(usernameInput.trim()); setPage(1) } }}
            style={{ paddingLeft: 34 }}
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
              <th>额度 (元)</th>
              <th>支付方式</th>
              <th>状态</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0
              ? <tr><td colSpan={9} className="empty-state" style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无订单</td></tr>
              : orders.map(o => {
                  const st = STATUS[o.status] || { label: `状态${o.status}`, cls: 'badge-gray' }
                  return (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{o.id}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{o.username || `#${o.user_id}`}</div>
                        {o.email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.email}</div>}
                      </td>
                      <td><code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>{o.order_no}</code></td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>¥{o.amount?.toFixed(2)}</td>
                      <td style={{ fontFamily: 'monospace' }}>{(o.quota / 500000).toFixed(2)}</td>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>共 {total} 条，第 {page} / {totalPages} 页</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={14}/></button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={14}/></button>
        </div>
      </div>
    </div>
  )
}
