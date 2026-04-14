import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { orderApi } from '../api'
import toast from 'react-hot-toast'

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '待支付', cls: 'badge-yellow' },
  success: { label: '已完成', cls: 'badge-green' },
  failed: { label: '失败', cls: 'badge-red' },
  expired: { label: '过期', cls: 'badge-gray' },
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const load = () => {
    orderApi.list({ page, page_size: 20 }).then(r => {
      if (r.data.success) { setOrders(r.data.data || []); setTotal(r.data.total || 0) }
    }).catch(() => {})
  }
  useEffect(() => { load() }, [page])

  const handleComplete = async (tradeNo: string) => {
    if (!confirm(`确认手动完成订单 ${tradeNo}？`)) return
    try {
      const r = await orderApi.complete(tradeNo)
      if (r.data.success) { toast.success('补单成功'); load() }
      else toast.error(r.data.message || '补单失败')
    } catch { toast.error('网络错误') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">订单管理</h1>
        <p className="page-desc">全平台充值订单记录</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>用户</th><th>订单号</th><th>额度($)</th><th>支付(¥)</th><th>方式</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            {orders.length === 0
              ? <tr><td colSpan={9} className="empty-state">暂无订单</td></tr>
              : orders.map(o => {
                const st = STATUS[o.status] || { label: o.status, cls: 'badge-gray' }
                return (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{o.id}</td>
                    <td>#{o.user_id}</td>
                    <td><code style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>{o.trade_no}</code></td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>${o.amount}</td>
                    <td style={{ fontFamily: 'monospace' }}>¥{o.money?.toFixed(2)}</td>
                    <td><span className="badge badge-gray">{o.payment_method || '-'}</span></td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{o.create_time ? new Date(o.create_time * 1000).toLocaleString('zh-CN') : '-'}</td>
                    <td>
                      {o.status === 'pending' && (
                        <button className="btn btn-success btn-sm" onClick={() => handleComplete(o.trade_no)}>
                          <Check size={12}/>补单
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>共 {total} 条</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={14}/></button>
          <span style={{ padding: '4px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>第 {page} 页</span>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => p + 1)} disabled={orders.length < 20}><ChevronRight size={14}/></button>
        </div>
      </div>
    </div>
  )
}
