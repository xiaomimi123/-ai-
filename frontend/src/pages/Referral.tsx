import { useEffect, useState } from 'react'
import { Users, Copy, DollarSign, TrendingUp, ArrowDownToLine, Link2, Share } from 'lucide-react'
import { referralApi } from '../api'

export default function ReferralPage() {
  const [info, setInfo] = useState<any>(null)
  const [commissions, setCommissions] = useState<any[]>([])
  const [copied, setCopied] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawResult, setWithdrawResult] = useState<string | null>(null)
  const [tab, setTab] = useState<'users' | 'commissions'>('users')

  useEffect(() => {
    referralApi.getInfo().then(r => { if (r.data.success) setInfo(r.data.data) }).catch(() => {})
    referralApi.getCommissions().then(r => { if (r.data.success) setCommissions(r.data.data || []) }).catch(() => {})
  }, [])

  // 生成邀请链接（使用 ?ref= 而不是 ?aff=）
  const inviteLink = info?.aff_code
    ? `${window.location.origin}/register?ref=${info.aff_code}`
    : ''

  const copyLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleWithdraw = async () => {
    setWithdrawing(true); setWithdrawResult(null)
    try {
      const res = await referralApi.withdraw()
      setWithdrawResult(res.data.message)
      if (res.data.success) {
        referralApi.getInfo().then(r => { if (r.data.success) setInfo(r.data.data) })
      }
    } catch { setWithdrawResult('网络错误') } finally { setWithdrawing(false) }
  }

  if (!info) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>加载中...</div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Share size={22} color="var(--primary)" />邀请返利
        </h1>
        <p className="page-desc">分享专属链接邀请好友，好友每次充值您都获得 {(info.commission_rate * 100).toFixed(0)}% 佣金</p>
      </div>

      {/* Invite Link Card */}
      <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, var(--primary-50), #faf5ff)', border: '1px solid var(--primary-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Link2 size={18} color="var(--primary)" />
          <h3 style={{ fontWeight: 600 }}>您的专属邀请链接</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={inviteLink || '生成中...'} readOnly style={{ flex: 1, background: '#fff', fontFamily: 'monospace', fontSize: 13 }} />
          <button className="btn btn-primary" onClick={copyLink} style={{ flexShrink: 0, padding: '10px 20px' }}>
            <Copy size={14} />{copied ? '已复制' : '复制链接'}
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          好友通过此链接注册后自动绑定邀请关系，无需填写任何邀请码。<br />
          好友每次充值，您将自动获得 <strong style={{ color: 'var(--primary)' }}>{(info.commission_rate * 100).toFixed(0)}%</strong> 佣金。
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: '邀请人数', value: info.invited_count || 0, icon: Users, color: 'var(--primary)', bg: 'var(--primary-50)' },
          { label: '总佣金', value: `$${info.total_commission?.toFixed(2) || '0.00'}`, icon: DollarSign, color: 'var(--success)', bg: '#dcfce7' },
          { label: '待提现', value: `$${info.pending_commission?.toFixed(2) || '0.00'}`, icon: TrendingUp, color: 'var(--warning)', bg: '#fef3c7' },
          { label: '已提现', value: `$${info.settled_commission?.toFixed(2) || '0.00'}`, icon: ArrowDownToLine, color: 'var(--text-secondary)', bg: '#f3f4f6' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color, fontSize: 24 }}>{s.value}</div>
              </div>
              <div style={{ background: s.bg, borderRadius: 10, padding: 10 }}>
                <s.icon size={18} color={s.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Withdraw */}
      {info.pending_commission > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontWeight: 600 }}>佣金提现</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>将待结算佣金转为平台额度，可直接用于 API 调用</p>
            </div>
            <button className="btn btn-primary" onClick={handleWithdraw} disabled={withdrawing}>
              <ArrowDownToLine size={16} />{withdrawing ? '处理中...' : `提现 $${info.pending_commission?.toFixed(2)}`}
            </button>
          </div>
          {withdrawResult && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#dcfce7', color: '#166534', fontSize: 13 }}>
              {withdrawResult}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 20, maxWidth: 300 }}>
        {[
          { key: 'users' as const, label: '邀请的用户' },
          { key: 'commissions' as const, label: '佣金明细' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: 'none',
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? 'var(--text)' : 'var(--text-secondary)',
            boxShadow: tab === t.key ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' ? (
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
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {u.created_time ? new Date(u.created_time * 1000).toLocaleDateString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>来源用户</th><th>关联订单</th><th>佣金金额</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              {commissions.length === 0
                ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无佣金记录</td></tr>
                : commissions.map((c: any) => (
                  <tr key={c.id}>
                    <td>用户 #{c.from_user_id}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>#{c.order_id || '-'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>${c.amount?.toFixed(2)}</td>
                    <td><span className={`badge ${c.status === 0 ? 'badge-yellow' : 'badge-green'}`}>{c.status === 0 ? '待结算' : '已结算'}</span></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
