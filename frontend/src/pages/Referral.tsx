import { useEffect, useState } from 'react'
import { Users, Copy, DollarSign, TrendingUp, ArrowDownToLine, Link2, Share, X } from 'lucide-react'
import { referralApi } from '../api'

interface WithdrawRecord {
  id: number
  amount: number
  alipay_account: string
  real_name: string
  status: number
  reject_reason?: string
  admin_remark?: string
  created_at: number
  processed_at?: number
}

interface WithdrawInfo {
  total_commission: number
  withdrawn: number
  available: number
  min_withdraw: number
  records: WithdrawRecord[]
}

const withdrawStatusLabel: Record<number, { label: string; cls: string }> = {
  0: { label: '待审核', cls: 'badge-yellow' },
  1: { label: '已通过', cls: 'badge-blue' },
  2: { label: '已拒绝', cls: 'badge-red' },
  3: { label: '已打款', cls: 'badge-green' },
}

export default function ReferralPage() {
  const [info, setInfo] = useState<any>(null)
  const [commissions, setCommissions] = useState<any[]>([])
  const [withdrawInfo, setWithdrawInfo] = useState<WithdrawInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'users' | 'commissions' | 'withdrawals'>('users')

  // 提现申请弹窗
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', alipay_account: '', real_name: '' })
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawMsg, setWithdrawMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadInfo = () => {
    referralApi.getInfo().then(r => { if (r.data.success) setInfo(r.data.data) }).catch(() => {})
    referralApi.getCommissions().then(r => { if (r.data.success) setCommissions(r.data.data || []) }).catch(() => {})
    referralApi.getWithdrawInfo().then(r => { if (r.data.success) setWithdrawInfo(r.data.data) }).catch(() => {})
  }

  useEffect(() => { loadInfo() }, [])

  // 生成邀请链接
  const inviteLink = info?.aff_code
    ? `${window.location.origin}/register?ref=${info.aff_code}`
    : ''

  const copyLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const available = withdrawInfo?.available || 0
  const minWithdraw = withdrawInfo?.min_withdraw ?? 10

  const openWithdraw = () => {
    setWithdrawMsg(null)
    setWithdrawForm({ amount: available.toFixed(2), alipay_account: '', real_name: '' })
    setShowWithdraw(true)
  }

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawForm.amount)
    if (!amount || amount < minWithdraw) {
      setWithdrawMsg({ ok: false, text: `最低提现金额 ¥${minWithdraw.toFixed(2)}` })
      return
    }
    if (amount > available) {
      setWithdrawMsg({ ok: false, text: `可提现余额不足（当前 ¥${available.toFixed(2)}）` })
      return
    }
    if (!withdrawForm.alipay_account.trim() || !withdrawForm.real_name.trim()) {
      setWithdrawMsg({ ok: false, text: '支付宝账号和真实姓名都必填' })
      return
    }
    setWithdrawLoading(true); setWithdrawMsg(null)
    try {
      const res = await referralApi.createWithdraw({
        amount,
        alipay_account: withdrawForm.alipay_account.trim(),
        real_name: withdrawForm.real_name.trim(),
      })
      if (res.data.success) {
        setWithdrawMsg({ ok: true, text: res.data.message })
        setTimeout(() => {
          setShowWithdraw(false)
          loadInfo()
          setTab('withdrawals')
        }, 1500)
      } else {
        setWithdrawMsg({ ok: false, text: res.data.message || '申请失败' })
      }
    } catch {
      setWithdrawMsg({ ok: false, text: '网络错误' })
    } finally {
      setWithdrawLoading(false)
    }
  }

  if (!info) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>加载中...</div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Share size={22} color="var(--accent)" />邀请返利
        </h1>
        <p className="page-desc">分享专属链接邀请好友，好友每次充值您都获得 {(info.commission_rate * 100).toFixed(0)}% 佣金</p>
      </div>

      {/* 邀请链接卡片 */}
      <div className="card" style={{ marginBottom: 20, background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Link2 size={18} color="var(--accent)" />
          <h3 style={{ fontWeight: 600, color: 'var(--primary)' }}>您的专属邀请链接</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={inviteLink || '生成中...'} readOnly style={{ flex: 1, background: '#fff', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }} />
          <button className="btn btn-primary" onClick={copyLink} style={{ flexShrink: 0, padding: '10px 18px' }}>
            <Copy size={14} />{copied ? '已复制' : '复制链接'}
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
          好友通过此链接注册后自动绑定邀请关系，无需填写任何邀请码。<br />
          好友每次充值，您将自动获得 <strong style={{ color: 'var(--primary)' }}>{(info.commission_rate * 100).toFixed(0)}%</strong> 佣金。
        </div>
      </div>

      {/* 统计 */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: '邀请人数', value: info.invited_count || 0, icon: Users },
          { label: '累计佣金', value: `¥${info.total_commission?.toFixed(2) || '0.00'}`, icon: DollarSign },
          { label: '待结算', value: `¥${info.pending_commission?.toFixed(2) || '0.00'}`, icon: TrendingUp },
          { label: '已结算', value: `¥${info.settled_commission?.toFixed(2) || '0.00'}`, icon: ArrowDownToLine },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
              <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: 9, display: 'flex' }}>
                <s.icon size={18} color="var(--accent)" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 提现卡片 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>申请提现</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 }}>
              已结算佣金可通过支付宝提现。提现将在 1-3 个工作日内由管理员审核打款。
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                可提现余额
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
                ¥{available.toFixed(2)}
              </div>
            </div>
            <button
              className="btn btn-accent"
              onClick={openWithdraw}
              disabled={available < minWithdraw}
              style={{ padding: '10px 20px' }}
            >
              <ArrowDownToLine size={16} />申请提现
            </button>
          </div>
        </div>
        {available < minWithdraw && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
            最低提现 ¥{minWithdraw.toFixed(2)}，继续邀请好友累积佣金吧
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 3, marginBottom: 18, maxWidth: 420 }}>
        {[
          { key: 'users' as const, label: '邀请的用户' },
          { key: 'commissions' as const, label: '佣金明细' },
          { key: 'withdrawals' as const, label: '提现记录' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, border: 'none',
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? 'var(--text)' : 'var(--muted)',
            boxShadow: tab === t.key ? '0 1px 2px rgba(13,31,20,.06)' : 'none',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>用户名</th><th>注册时间</th></tr></thead>
            <tbody>
              {!info.invited_users || info.invited_users.length === 0
                ? <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>
                    分享您的邀请链接，邀请好友加入
                  </td></tr>
                : info.invited_users.map((u: any) => (
                  <tr key={u.id}>
                    <td><strong>{u.username}</strong></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {u.created_time ? new Date(u.created_time * 1000).toLocaleDateString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'commissions' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>来源用户</th><th>关联订单</th><th>佣金金额</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              {commissions.length === 0
                ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无佣金记录</td></tr>
                : commissions.map((c: any) => (
                  <tr key={c.id}>
                    <td>用户 #{c.from_user_id}</td>
                    <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>#{c.order_id || '-'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>¥{c.amount?.toFixed(2)}</td>
                    <td><span className={`badge ${c.status === 0 ? 'badge-yellow' : 'badge-green'}`}>{c.status === 0 ? '待结算' : '已结算'}</span></td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'withdrawals' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>申请时间</th><th>金额</th><th>支付宝账号</th><th>姓名</th><th>状态</th><th>备注</th></tr></thead>
            <tbody>
              {!withdrawInfo?.records || withdrawInfo.records.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无提现记录</td></tr>
                : withdrawInfo.records.map(r => {
                    const st = withdrawStatusLabel[r.status] || { label: '未知', cls: 'badge-gray' }
                    return (
                      <tr key={r.id}>
                        <td style={{ color: 'var(--muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {r.created_at ? new Date(r.created_at * 1000).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--accent)' }}>¥{r.amount?.toFixed(2)}</td>
                        <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>{r.alipay_account}</td>
                        <td>{r.real_name}</td>
                        <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {r.status === 2 && r.reject_reason ? `拒绝：${r.reject_reason}` : (r.admin_remark || '-')}
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      )}

      {/* 申请提现弹窗 */}
      {showWithdraw && (
        <div
          onClick={() => !withdrawLoading && setShowWithdraw(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(13,31,20,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(4px)', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ width: 440, maxWidth: '100%', padding: 28, position: 'relative' }}
          >
            <button
              onClick={() => !withdrawLoading && setShowWithdraw(false)}
              style={{ position: 'absolute', top: 14, right: 14, padding: 4, color: 'var(--muted)', display: 'flex' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 18 }}>申请提现</h3>

            <div style={{
              background: 'var(--accent-light)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 20, fontSize: 13,
            }}>
              可提现余额 <strong style={{ color: 'var(--primary)' }}>¥{available.toFixed(2)}</strong>
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>· 最低 ¥{minWithdraw.toFixed(2)}</span>
            </div>

            <div className="form-group">
              <label className="form-label">提现金额（元）</label>
              <input
                type="number"
                step="0.01"
                min={minWithdraw}
                max={available}
                placeholder={`最低 ¥${minWithdraw.toFixed(2)}`}
                value={withdrawForm.amount}
                onChange={e => setWithdrawForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">支付宝账号</label>
              <input
                placeholder="请输入收款支付宝账号（手机号或邮箱）"
                value={withdrawForm.alipay_account}
                onChange={e => setWithdrawForm(p => ({ ...p, alipay_account: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">真实姓名</label>
              <input
                placeholder="支付宝实名，用于转账核实"
                value={withdrawForm.real_name}
                onChange={e => setWithdrawForm(p => ({ ...p, real_name: e.target.value }))}
              />
            </div>

            <div style={{
              fontSize: 12, color: 'var(--muted)', margin: '6px 0 16px',
              padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, lineHeight: 1.6,
            }}>
              提现将在 1-3 个工作日内处理。管理员审核通过后通过支付宝转账至您填写的账号，转账失败不影响余额。
            </div>

            {withdrawMsg && (
              <div style={{
                background: withdrawMsg.ok ? 'var(--accent-light)' : 'var(--danger-bg)',
                color: withdrawMsg.ok ? 'var(--primary)' : 'var(--danger)',
                padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
              }}>
                {withdrawMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-outline"
                style={{ flex: 1 }}
                disabled={withdrawLoading}
                onClick={() => setShowWithdraw(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={withdrawLoading}
                onClick={handleWithdraw}
              >
                {withdrawLoading ? '提交中...' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
