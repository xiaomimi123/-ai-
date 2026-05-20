import { useEffect, useState } from 'react'
import { Copy, CheckCircle2, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { agentApi } from '../api'

interface InviteInfo {
  aff_code: string
  invite_link: string
  commission_rate: number          // 0~1
  commission_rate_source: 'personal' | 'global'
}

interface Props {
  data?: InviteInfo  // 如果父组件已经拿到 overview 数据，传进来避免重复请求
}

// AgentInviteCard 给代理用户展示邀请码 + 邀请链接 + 当前生效佣金率。
// 两个页面用：/agent/overview（已 fetch 时父组件传 data），/agent/my-commissions（自己 fetch）
export function AgentInviteCard({ data: dataProp }: Props) {
  const [data, setData] = useState<InviteInfo | null>(dataProp ?? null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  useEffect(() => {
    if (dataProp) {
      setData(dataProp)
      return
    }
    // 父组件没传 → 自己拉一次
    agentApi.overview().then(r => {
      if (r.data?.success) setData(r.data.data)
    }).catch(() => {})
  }, [dataProp])

  const copyTo = async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      toast.success(kind === 'code' ? '邀请码已复制' : '邀请链接已复制')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('复制失败')
    }
  }

  if (!data) {
    return (
      <div className="card" style={{ padding: 16, marginBottom: 20, color: 'var(--text-secondary)', fontSize: 13 }}>
        加载邀请信息中...
      </div>
    )
  }

  const ratePct = (data.commission_rate * 100).toFixed(1).replace(/\.0$/, '')
  const rateSourceLabel = data.commission_rate_source === 'personal'
    ? '专属比例（管理员为您单独设置）'
    : '全局默认比例'
  const rateColor = data.commission_rate_source === 'personal' ? 'var(--accent)' : 'var(--text-secondary)'

  return (
    <div className="card" style={{ padding: 18, marginBottom: 20, background: 'linear-gradient(135deg, #f0f9f3 0%, #ffffff 100%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Share2 size={16} color="var(--accent)" />
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text)' }}>我的邀请</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {/* 邀请码 */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            邀请码
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'white',
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              letterSpacing: '.1em',
            }}>
              {data.aff_code || '—'}
            </code>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => copyTo(data.aff_code, 'code')}
              disabled={!data.aff_code}
              style={{ padding: '4px 10px' }}
            >
              {copied === 'code' ? <CheckCircle2 size={14} color="var(--success)"/> : <Copy size={14}/>}
              {copied === 'code' ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* 邀请链接 */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            邀请链接
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              flex: 1,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              color: 'var(--text)',
              background: 'white',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }} title={data.invite_link}>
              {data.invite_link || '—'}
            </code>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => copyTo(data.invite_link, 'link')}
              disabled={!data.invite_link}
              style={{ padding: '4px 10px', flexShrink: 0 }}
            >
              {copied === 'link' ? <CheckCircle2 size={14} color="var(--success)"/> : <Copy size={14}/>}
              {copied === 'link' ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* 佣金比例 */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            当前佣金比例
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: rateColor, fontFamily: 'ui-monospace, monospace' }}>
              {ratePct}%
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {rateSourceLabel}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            团队成员每充值 ¥100，您获得 ¥{(data.commission_rate * 100).toFixed(2).replace(/\.?0+$/, '')} 佣金
          </div>
        </div>
      </div>
    </div>
  )
}
