import { useEffect, useState } from 'react'
import { Receipt, ChevronLeft, ChevronRight } from 'lucide-react'
import axios from 'axios'
const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

interface Order {
  id: number; user_id: number; amount: number; money: number; trade_no: string
  payment_method: string; create_time: number; complete_time: number; status: string
}

const statusMap: Record<string, { label: string; cls: string }> = {
  pending: { label: '待支付', cls: 'badge-yellow' },
  success: { label: '已完成', cls: 'badge-green' },
  failed:  { label: '失败', cls: 'badge-red' },
  expired: { label: '已过期', cls: 'badge-gray' },
}

const methodMap: Record<string, string> = {
  alipay: '支付宝', wxpay: '微信支付', wechat: '微信支付', stripe: 'Stripe',
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 15

  useEffect(() => {
    http.get('/api/lingjing/pay/orders', { params: { page, page_size: pageSize } }).then((r: any) => {
      if (r.data.success) {
        setOrders(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => {})
  }, [page])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Receipt size={22} color="var(--primary)" />充值记录
        </h1>
        <p className="page-desc">您的充值订单历史</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>订单号</th><th>充值额度</th><th>支付金额</th><th>支付方式</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>
            {orders.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无充值记录</td></tr>
              : orders.map(o => {
                const st = statusMap[o.status] || { label: o.status, cls: 'badge-gray' }
                return (
                  <tr key={o.id}>
                    <td><code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>{o.order_no}</code></td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>¥{o.amount?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{(o.quota / 500000).toFixed(2)} 元额度</td>
                    <td>{methodMap[o.payment_method] || o.payment_method || '-'}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {o.created_at ? new Date(o.created_at).toLocaleString('zh-CN') : '-'}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>第 {page} / {totalPages} 页</span>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={14}/></button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}><ChevronRight size={14}/></button>
        </div>
      )}
    </div>
  )
}
