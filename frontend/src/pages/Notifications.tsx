import { useState, useEffect } from 'react'
import { Bell, CheckCheck, Megaphone, CreditCard, TrendingDown, CheckCircle, XCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { notificationApi } from '../api'

interface PersonalNotification {
  id: number
  user_id: number
  title: string
  content: string
  type: string
  is_read: boolean
  created_at: number // Unix seconds
}

interface SystemNotice {
  id: number
  title: string
  content: string
  is_active: number
  created_at: string | number // Notice 模型用 time.Time 序列化为 ISO 字符串
}

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  withdraw_approved: { label: '提现审核通过', icon: CheckCircle,   color: '#16a34a', bg: '#dcfce7' },
  withdraw_rejected: { label: '提现被拒绝',   icon: XCircle,       color: '#dc2626', bg: '#fee2e2' },
  withdraw_paid:     { label: '提现已打款',   icon: TrendingDown,  color: '#0D1F14', bg: 'var(--accent-light)' },
  topup_success:     { label: '充值成功',     icon: CreditCard,    color: '#16a34a', bg: '#dcfce7' },
  quota_low:         { label: '余额不足',     icon: AlertTriangle, color: '#ca8a04', bg: '#fef9c3' },
  quota_exhausted:   { label: '余额已用尽',   icon: AlertCircle,   color: '#dc2626', bg: '#fee2e2' },
  system:            { label: '系统消息',     icon: Bell,          color: '#7A8A7E', bg: '#f3f4f6' },
}

// 兼容两种时间格式：personal 用 Unix 秒（number），notice 用 ISO 字符串
function fmtTime(v: string | number): string {
  if (v === undefined || v === null || v === '') return ''
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function NotificationsPage() {
  const [personal, setPersonal] = useState<PersonalNotification[]>([])
  const [notices, setNotices] = useState<SystemNotice[]>([])
  const [unread, setUnread] = useState<number>(0)
  const [activeTab, setActiveTab] = useState<'all' | 'system'>('all')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await notificationApi.list()
      if (res.data.success) {
        setPersonal(res.data.data.personal || [])
        setNotices(res.data.data.notices || [])
        setUnread(res.data.data.unread_count || 0)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const markAllRead = async () => {
    await notificationApi.markRead('all')
    loadData()
  }

  const markRead = async (id: number) => {
    await notificationApi.markRead(id)
    loadData()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* 标题栏 */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bell size={22} color="var(--accent)" />
            通知中心
            {unread > 0 && (
              <span style={{
                background: 'var(--accent)', color: 'var(--primary)',
                fontSize: 11, fontWeight: 700, padding: '2px 8px',
                borderRadius: 20, lineHeight: 1.5,
              }}>
                {unread} 未读
              </span>
            )}
          </h1>
          <p className="page-desc">查看系统公告和个人消息</p>
        </div>
        {unread > 0 && (
          <button
            className="btn btn-outline btn-sm"
            onClick={markAllRead}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <CheckCheck size={14} /> 全部已读
          </button>
        )}
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 3, marginBottom: 18, maxWidth: 280 }}>
        {[
          { key: 'all' as const, label: '全部消息' },
          { key: 'system' as const, label: '系统公告' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, border: 'none',
              background: activeTab === t.key ? '#fff' : 'transparent',
              color: activeTab === t.key ? 'var(--text)' : 'var(--muted)',
              boxShadow: activeTab === t.key ? '0 1px 2px rgba(13,31,20,.06)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 系统公告 */}
          {(activeTab === 'all' || activeTab === 'system') && notices.map(n => (
            <div
              key={`notice-${n.id}`}
              className="card"
              style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16 }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: '#fef3c7', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                <Megaphone size={16} color="#d97706" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>📢 {n.title || '系统公告'}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {fmtTime(n.created_at)}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
                  {n.content}
                </p>
              </div>
            </div>
          ))}

          {/* 个人通知 */}
          {activeTab === 'all' && personal.map(n => {
            const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system
            const Icon = cfg.icon
            return (
              <div
                key={`notif-${n.id}`}
                className="card"
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16,
                  opacity: n.is_read ? 0.75 : 1,
                  borderLeft: n.is_read ? undefined : '3px solid var(--accent)',
                  cursor: n.is_read ? 'default' : 'pointer',
                  transition: 'opacity .15s',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: cfg.bg, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={16} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: 'var(--accent)', flexShrink: 0,
                        }} />
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {fmtTime(n.created_at)}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>
                    {n.content}
                  </p>
                </div>
              </div>
            )
          })}

          {/* 空状态 */}
          {!loading && personal.length === 0 && notices.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <Bell size={40} color="var(--muted)" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--text)' }}>暂无通知</div>
              <div style={{ fontSize: 13 }}>系统消息和个人通知将在这里显示</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
