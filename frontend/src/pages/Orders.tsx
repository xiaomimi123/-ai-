import { useEffect, useState } from 'react'
import { Receipt, ChevronLeft, ChevronRight } from 'lucide-react'
import axios from 'axios'
const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

interface Order {
  id: number
  order_no: string
  amount: number
  quota: number
  status: number
  payment_method: string
  trade_no: string
  remark: string
  // 后端 Order.CreatedAt/PaidAt 是 int64 Unix 秒（不是 ISO 字符串）
  created_at: number
  paid_at: number
}

const statusMap: Record<number, { label: string; cls: string }> = {
  0: { label: '待支付', cls: 'badge-yellow' },
  1: { label: '已完成', cls: 'badge-green' },
  2: { label: '已取消', cls: 'badge-gray' },
  3: { label: '已退款', cls: 'badge-red' },
}

const methodMap: Record<string, string> = {
  alipay: '支付宝', manual: '管理员补单', wxpay: '微信支付',
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
          <Receipt size={22} color="var(--accent)" />充值记录
        </h1>
        <p className="page-desc">您的充值订单历史</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>订单号</th><th>支付金额</th><th>获得额度</th><th>支付方式</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>
            {orders.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无充值记录</td></tr>
              : orders.map(o => {
                const st = statusMap[o.status] || { label: `状态${o.status}`, cls: 'badge-gray' }
                return (
                  <tr key={o.id}>
                    <td><code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: 'var(--text)' }}>{o.order_no}</code></td>
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>¥{o.amount?.toFixed(2)}</td>
                    <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{o.quota ? (o.quota / 500000).toFixed(2) : '-'} 元</td>
                    <td>{methodMap[o.payment_method] || o.payment_method || '-'}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {o.created_at ? new Date(o.created_at * 1000).toLocaleString('zh-CN') : '-'}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>第 {page} / {totalPages} 页</span>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={14}/></button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}><ChevronRight size={14}/></button>
        </div>
      )}
    </div>
  )
}
