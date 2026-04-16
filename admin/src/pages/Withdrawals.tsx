import { useEffect, useState } from 'react'
import { Check, X, DollarSign, ChevronLeft, ChevronRight, Wallet, CheckCircle2 } from 'lucide-react'
import { withdrawApi } from '../api'
import toast from 'react-hot-toast'

interface Withdraw {
  id: number
  user_id: number
  username?: string
  email?: string
  amount: number
  alipay_account: string
  real_name: string
  status: number
  reject_reason?: string
  admin_remark?: string
  created_at: number
  processed_at?: number
  processed_by?: number
}

interface StatsItem {
  status: number
  count: number
  amount: number
}

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  0: { label: '待审核', cls: 'badge-yellow' },
  1: { label: '已通过', cls: 'badge-blue' },
  2: { label: '已拒绝', cls: 'badge-red' },
  3: { label: '已打款', cls: 'badge-green' },
}

const FILTER_TABS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: '0', label: '待审核' },
  { key: '1', label: '已通过' },
  { key: '3', label: '已打款' },
  { key: '2', label: '已拒绝' },
]

export default function WithdrawalsPage() {
  const [records, setRecords] = useState<Withdraw[]>([])
  const [stats, setStats] = useState<StatsItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  // 审核弹窗
  const [dialog, setDialog] = useState<{ type: 'approve' | 'reject' | 'paid'; row: Withdraw } | null>(null)
  const [dialogForm, setDialogForm] = useState({ reject_reason: '', admin_remark: '' })
  const [dialogLoading, setDialogLoading] = useState(false)

  const load = () => {
    withdrawApi.list({ status: statusFilter || undefined, page }).then(r => {
      if (r.data.success) {
        setRecords(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => {})
    withdrawApi.stats().then(r => {
      if (r.data.success) setStats(r.data.data || [])
    }).catch(() => {})
  }
  useEffect(() => { load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page, statusFilter])

  // 统计摘要
  const stat = (status: number) => stats.find(s => s.status === status) || { status, count: 0, amount: 0 }
  const pendingCount = stat(0).count
  const approvedCount = stat(1).count
  const paidAmount = stat(3).amount

  const openDialog = (type: 'approve' | 'reject' | 'paid', row: Withdraw) => {
    setDialog({ type, row })
    setDialogForm({ reject_reason: '', admin_remark: '' })
  }

  const submitDialog = async () => {
    if (!dialog) return
    if (dialog.type === 'reject' && !dialogForm.reject_reason.trim()) {
      toast.error('请填写拒绝原因')
      return
    }
    setDialogLoading(true)
    try {
      const r = await withdrawApi.process(dialog.row.id, {
        action: dialog.type,
        reject_reason: dialogForm.reject_reason.trim() || undefined,
        admin_remark: dialogForm.admin_remark.trim() || undefined,
      })
      if (r.data.success) {
        toast.success(r.data.message || '操作成功')
        setDialog(null)
        load()
      } else {
        toast.error(r.data.message || '操作失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setDialogLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">提现审核</h1>
        <p className="page-desc">分销佣金提现申请 — 审核、打款、拒绝</p>
      </div>

      {/* 统计摘要 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: '待审核', value: pendingCount, unit: '笔', icon: Wallet, color: 'var(--warning)', bg: '#fef3c7' },
          { label: '已通过待打款', value: approvedCount, unit: '笔', icon: CheckCircle2, color: 'var(--info)', bg: '#dbeafe' },
          { label: '累计已打款', value: `¥${paidAmount.toFixed(2)}`, unit: '', icon: DollarSign, color: 'var(--success)', bg: '#dcfce7' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>
                  {s.value}<span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>{s.unit}</span>
                </div>
              </div>
              <div style={{ background: s.bg, borderRadius: 10, padding: 10 }}>
                <s.icon size={18} color={s.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setStatusFilter(t.key); setPage(1) }}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              border: statusFilter === t.key ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: statusFilter === t.key ? 'var(--primary-50)' : '#fff',
              color: statusFilter === t.key ? 'var(--primary)' : 'var(--text)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>用户</th>
              <th>金额</th>
              <th>支付宝账号</th>
              <th>姓名</th>
              <th>状态</th>
              <th>申请时间</th>
              <th>备注</th>
              <th style={{ width: 200 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0
              ? <tr><td colSpan={9} className="empty-state" style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无数据</td></tr>
              : records.map(r => {
                  const st = STATUS_MAP[r.status] || { label: '未知', cls: 'badge-gray' }
                  return (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{r.id}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.username || `#${r.user_id}`}</div>
                        {r.email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.email}</div>}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>¥{r.amount?.toFixed(2)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.alipay_account}</td>
                      <td>{r.real_name}</td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {r.created_at ? new Date(r.created_at * 1000).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 200 }}>
                        {r.status === 2 && r.reject_reason ? `拒绝：${r.reject_reason}` : (r.admin_remark || '-')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {r.status === 0 && (
                            <>
                              <button
                                onClick={() => openDialog('approve', r)}
                                className="btn btn-primary btn-sm"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                              >
                                <Check size={12} />通过
                              </button>
                              <button
                                onClick={() => openDialog('reject', r)}
                                className="btn btn-outline btn-sm"
                                style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              >
                                <X size={12} />拒绝
                              </button>
                            </>
                          )}
                          {r.status === 1 && (
                            <button
                              onClick={() => openDialog('paid', r)}
                              className="btn btn-primary btn-sm"
                              style={{ padding: '4px 10px', fontSize: 12, background: 'var(--success)' }}
                            >
                              <DollarSign size={12} />已打款
                            </button>
                          )}
                          {(r.status === 2 || r.status === 3) && (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>第 {page} / {totalPages} 页，共 {total} 条</span>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft size={14} />
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* 审核弹窗 */}
      {dialog && (
        <div
          onClick={() => !dialogLoading && setDialog(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20, backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ width: 480, maxWidth: '100%', padding: 28 }}
          >
            <h3 style={{ fontWeight: 600, marginBottom: 6, fontSize: 16 }}>
              {dialog.type === 'approve' && '审核通过'}
              {dialog.type === 'reject' && '拒绝申请'}
              {dialog.type === 'paid' && '标记已打款'}
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
              {dialog.type === 'approve' && '审核通过后，请尽快通过支付宝打款，再回来点「已打款」。'}
              {dialog.type === 'reject' && '请填写拒绝原因，用户能在自己的提现记录里看到。'}
              {dialog.type === 'paid' && '确认已通过支付宝转账成功？此操作不可撤销。'}
            </p>

            {/* 申请摘要 */}
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginBottom: 18, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>用户</span>
                <strong>{dialog.row.username || `#${dialog.row.user_id}`}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>金额</span>
                <strong style={{ color: 'var(--primary)' }}>¥{dialog.row.amount?.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--muted)' }}>支付宝</span>
                <span style={{ fontFamily: 'monospace' }}>{dialog.row.alipay_account}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>真实姓名</span>
                <span>{dialog.row.real_name}</span>
              </div>
            </div>

            {dialog.type === 'reject' && (
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  拒绝原因 <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="例如：账号信息错误、佣金已撤销、违反平台规则…"
                  value={dialogForm.reject_reason}
                  onChange={e => setDialogForm(p => ({ ...p, reject_reason: e.target.value }))}
                  style={{ resize: 'vertical', width: '100%' }}
                />
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                管理员备注（可选）
              </label>
              <input
                placeholder="内部备注，用户也会看到"
                value={dialogForm.admin_remark}
                onChange={e => setDialogForm(p => ({ ...p, admin_remark: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline"
                disabled={dialogLoading}
                onClick={() => setDialog(null)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={dialogLoading}
                onClick={submitDialog}
                style={dialog.type === 'reject' ? { background: 'var(--danger)' } : undefined}
              >
                {dialogLoading ? '提交中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
