import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ListTodo, RefreshCw, RotateCcw, DollarSign, X, CheckCircle, Loader2, AlertCircle, Clock } from 'lucide-react'
import Pagination from '../../components/Pagination'
import { adminTaskApi, type AdminTaskRow } from './api/taskApi'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { FilterTabs } from '../../components/FilterTabs'
import { SearchInput } from '../../components/SearchInput'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyCard } from '../../components/EmptyCard'

// 与 Logs.tsx 对齐：1-indexed 页码 + 共享 Pagination 组件
// 后端 list 接口期望 p 从 0 开始，因此请求时 page-1
const PAGE_SIZE = 15

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部平台' },
  { value: 'apimart', label: 'ApiMart' },
  { value: 'jimeng', label: '即梦' },
]

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'SUBMITTED', label: 'SUBMITTED' },
  { value: 'QUEUED', label: 'QUEUED' },
  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
  { value: 'SUCCESS', label: 'SUCCESS' },
  { value: 'FAILURE', label: 'FAILURE' },
  { value: 'TIMEOUT', label: 'TIMEOUT' },
]

// 状态 → badge 配色，与全站 badge 体系一致（badge-green/red/gray/blue/yellow/purple）
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'SUCCESS': return 'badge badge-green'
    case 'FAILURE':
    case 'TIMEOUT': return 'badge badge-red'
    case 'IN_PROGRESS': return 'badge badge-blue'
    case 'QUEUED': return 'badge badge-yellow'
    case 'SUBMITTED': return 'badge badge-purple'
    default: return 'badge badge-gray'
  }
}

// quota → USD（与 Logs / Plans 一致，1 USD = 500000 quota）
const QUOTA_PER_USD = 500000
const quotaToUsd = (q: number) => q / QUOTA_PER_USD

export default function TasksPage() {
  const [list, setList] = useState<AdminTaskRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1) // 1-indexed，与 Pagination 组件约定一致
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({ platform: '', status: '', user_id: '', keyword: '' })

  const [detail, setDetail] = useState<AdminTaskRow | null>(null)
  const [refundTarget, setRefundTarget] = useState<AdminTaskRow | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retryTarget, setRetryTarget] = useState<AdminTaskRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminTaskApi.list({
        p: page - 1,
        page_size: PAGE_SIZE,
        platform: filter.platform || undefined,
        status: filter.status || undefined,
        user_id: filter.user_id ? filter.user_id : undefined,
        keyword: filter.keyword || undefined,
      })
      setList(r?.data || [])
      setTotal(r?.total || 0)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载失败'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => { load() /* eslint-disable-next-line */ }, [page])

  const handleSearch = () => { if (page !== 1) setPage(1); else load() }

  const onRetry = (row: AdminTaskRow) => {
    setRetryTarget(row)
  }

  const doRetry = async () => {
    if (!retryTarget) return
    setRetrying(retryTarget.task_id)
    try {
      await adminTaskApi.retry(retryTarget.task_id)
      toast.success('已加入重试')
      load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '重试失败'
      toast.error(msg)
    } finally {
      setRetrying(null)
      setRetryTarget(null)
    }
  }

  const openRefund = (row: AdminTaskRow) => {
    setRefundTarget(row)
    setRefundReason('')
  }

  const closeRefund = () => {
    if (refunding) return
    setRefundTarget(null)
    setRefundReason('')
  }

  const confirmRefund = async () => {
    if (!refundTarget) return
    const reason = refundReason.trim()
    if (!reason) { toast.error('请填写退款原因'); return }
    setRefunding(true)
    try {
      await adminTaskApi.refund(refundTarget.task_id, reason)
      toast.success('已退款')
      setRefundTarget(null)
      setRefundReason('')
      load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '退款失败'
      toast.error(msg)
    } finally {
      setRefunding(false)
    }
  }

  // 本页统计（list endpoint 是分页的，所以这是当前页范围内的计数）
  const stats = useMemo(() => {
    const s = { success: 0, inProgress: 0, queued: 0, failed: 0 }
    for (const t of list) {
      switch (t.status) {
        case 'SUCCESS': s.success++; break
        case 'IN_PROGRESS': s.inProgress++; break
        case 'QUEUED':
        case 'SUBMITTED': s.queued++; break
        case 'FAILURE':
        case 'TIMEOUT': s.failed++; break
      }
    }
    return s
  }, [list])

  return (
    <div>
      <PageHeader
        title="异步任务管理"
        description="查看所有平台异步任务（gpt-image / jimeng 等），重试失败任务、手动退款"
        icon={ListTodo}
      />

      {/* 本页统计 */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard label="成功"      value={stats.success}    icon={CheckCircle}  color="success" />
        <StatCard label="进行中"    value={stats.inProgress} icon={Loader2}      color="info"    />
        <StatCard label="排队中"    value={stats.queued}     icon={Clock}        color="warning" />
        <StatCard label="失败/超时" value={stats.failed}     icon={AlertCircle}  color="danger"  />
      </div>

      {/* 筛选区 */}
      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FilterTabs
          value={filter.status}
          onChange={v => setFilter(p => ({ ...p, status: v }))}
          options={STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filter.platform} onChange={e => setFilter(p => ({ ...p, platform: e.target.value }))} style={{ minWidth: 130 }}>
            {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <SearchInput
            value={filter.user_id}
            onChange={v => setFilter(p => ({ ...p, user_id: v.replace(/\D/g, '') }))}
            onSubmit={handleSearch}
            placeholder="用户 ID"
            width={140}
          />
          <SearchInput
            value={filter.keyword}
            onChange={v => setFilter(p => ({ ...p, keyword: v }))}
            onSubmit={handleSearch}
            placeholder="task_id 关键字"
            width={220}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>查询</button>
          <button className="btn btn-outline" onClick={() => load()} disabled={loading}>
            <RefreshCw size={14}/>刷新
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
        <table>
          <thead>
            <tr>
              <th>task_id</th>
              <th>用户</th>
              <th>平台</th>
              <th>模型 / Action</th>
              <th>状态</th>
              <th>耗时</th>
              <th>额度</th>
              <th>提交时间</th>
              <th style={{ minWidth: 180 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0
              ? <tr><td colSpan={9} style={{ padding: 0 }}>
                  <EmptyCard
                    icon={ListTodo}
                    title={loading ? '加载中...' : '暂无任务'}
                    description={(filter.platform || filter.status || filter.user_id || filter.keyword) && !loading ? '试试别的筛选条件' : ''}
                  />
                </td></tr>
              : list.map(t => {
                const elapsed = (t.finish_time && t.submit_time && t.finish_time > 0)
                  ? `${(t.finish_time - t.submit_time)}s`
                  : '-'
                const canRetry = t.status === 'FAILURE' || t.status === 'TIMEOUT'
                const canRefund = t.status === 'SUCCESS'
                return (
                  <tr key={t.id}>
                    <td>
                      <code title={t.task_id} style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>
                        {t.task_id.length > 16 ? `${t.task_id.slice(0, 16)}…` : t.task_id}
                      </code>
                    </td>
                    <td><strong style={{ fontSize: 13 }}>#{t.user_id}</strong></td>
                    <td>{t.platform || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {t.model || '-'}{t.action ? ` / ${t.action}` : ''}
                    </td>
                    <td><span className={statusBadgeClass(t.status)}>{t.status}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{elapsed}</td>
                    <td style={{ color: 'var(--success)', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>${quotaToUsd(t.quota).toFixed(5)}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{new Date(t.created_at * 1000).toLocaleString('zh-CN')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => setDetail(t)}>详情</button>
                        {canRetry && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => onRetry(t)}
                            disabled={retrying === t.task_id}
                            style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}
                          >
                            <RotateCcw size={12}/>{retrying === t.task_id ? '...' : '重试'}
                          </button>
                        )}
                        {canRefund && (
                          <button
                            className="btn btn-sm"
                            onClick={() => openRefund(t)}
                            style={{ background: '#fee2e2', color: '#ef4444', border: 'none' }}
                          >
                            <DollarSign size={12}/>退款
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      {/* 详情弹窗 */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '95vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="modal-title" style={{ margin: 0 }}>任务详情</div>
              <button className="btn btn-sm btn-outline" onClick={() => setDetail(null)} style={{ padding: 6 }}>
                <X size={14}/>
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', fontSize: 13, marginBottom: 16 }}>
              <div style={{ color: 'var(--muted)' }}>task_id</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{detail.task_id}</div>
              <div style={{ color: 'var(--muted)' }}>状态</div>
              <div><span className={statusBadgeClass(detail.status)}>{detail.status}</span></div>
              <div style={{ color: 'var(--muted)' }}>平台 / 模型</div>
              <div>{detail.platform || '-'} / {detail.model || '-'}{detail.action ? ` / ${detail.action}` : ''}</div>
              <div style={{ color: 'var(--muted)' }}>用户 / 渠道</div>
              <div>#{detail.user_id} / #{detail.channel_id}</div>
              <div style={{ color: 'var(--muted)' }}>额度</div>
              <div style={{ color: 'var(--success)', fontWeight: 600, fontFamily: 'monospace' }}>${quotaToUsd(detail.quota).toFixed(5)}</div>
              {detail.fail_reason && <>
                <div style={{ color: 'var(--muted)' }}>失败原因</div>
                <div style={{ color: '#ef4444', fontSize: 12, wordBreak: 'break-all' }}>{detail.fail_reason}</div>
              </>}
              {detail.progress && <>
                <div style={{ color: 'var(--muted)' }}>进度</div>
                <div>{detail.progress}</div>
              </>}
            </div>
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>原始 JSON</summary>
              <pre style={{
                background: '#f8fafc', padding: 12, fontSize: 11, lineHeight: 1.5,
                overflow: 'auto', maxHeight: '40vh', borderRadius: 6, margin: 0,
                fontFamily: 'monospace', border: '1px solid var(--border)',
              }}>{JSON.stringify(detail, null, 2)}</pre>
            </details>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 退款弹窗 */}
      {refundTarget && (
        <div className="modal-overlay" onClick={closeRefund}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
            <div className="modal-title">手动退款</div>
            <div style={{ background: '#fef3c7', color: '#92400e', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
              退款将把 ${quotaToUsd(refundTarget.quota).toFixed(5)} 额度退回到用户 #{refundTarget.user_id} 的账户，
              并写入审计日志（reason 字段会透传）。<strong>不可撤销。</strong>
            </div>
            <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.8 }}>
              <div>任务：<code style={{ fontFamily: 'monospace', fontSize: 12 }}>{refundTarget.task_id}</code></div>
              <div>用户：#{refundTarget.user_id} · 平台：{refundTarget.platform}</div>
            </div>
            <div className="form-group">
              <label className="form-label">退款原因 *</label>
              <textarea
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                rows={3}
                placeholder="如：用户投诉无图、生成内容违规但已扣费等"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                }}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={closeRefund} disabled={refunding}>取消</button>
              <button className="btn btn-danger" onClick={confirmRefund} disabled={refunding || !refundReason.trim()}>
                {refunding ? '处理中...' : '确认退款'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!retryTarget}
        title="确认重试任务"
        description={
          <>
            任务: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>{retryTarget?.task_id}</code><br />
            仅 FAILURE / TIMEOUT 状态可重试。任务会重新提交到上游，<strong>新一轮调用会产生费用。</strong>
          </>
        }
        confirmLabel="重试"
        confirmVariant="primary"
        onConfirm={doRetry}
        onCancel={() => setRetryTarget(null)}
      />
    </div>
  )
}
