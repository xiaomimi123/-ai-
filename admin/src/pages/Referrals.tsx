import { useEffect, useState } from 'react'
import { Users, DollarSign, TrendingUp, Save } from 'lucide-react'
import { referralAdminApi } from '../api'
import toast from 'react-hot-toast'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'

export default function ReferralsPage() {
  const [stats, setStats] = useState<any>(null)
  const [config, setConfig] = useState({ commission_rate: 0.1, commission_enabled: true, withdraw_min_quota: 500000 })

  useEffect(() => {
    referralAdminApi.getStats().then(r => {
      if (r.data.success) {
        setStats(r.data.data)
        setConfig({
          commission_rate: r.data.data.commission_rate || 0.1,
          commission_enabled: true,
          withdraw_min_quota: 500000,
        })
      }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    try {
      const r = await referralAdminApi.updateConfig(config)
      if (r.data.success) toast.success('配置已保存')
      else toast.error(r.data.message)
    } catch { toast.error('网络错误') }
  }

  return (
    <div>
      <PageHeader
        title="分销管理"
        description="邀请关系与佣金管理"
        icon={TrendingUp}
      />

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard label="总用户"   value={stats?.total_users ?? '--'}                            icon={Users}        color="info"    />
        <StatCard label="邀请用户" value={stats?.users_with_inviter ?? '--'}                     icon={TrendingUp}   color="success" hint={stats?.referral_rate || ''} />
        <StatCard label="总佣金"   value={`$${stats?.total_commission?.toFixed(2) || '0'}`}      icon={DollarSign}   color="warning" />
        <StatCard label="待结算"   value={`$${stats?.pending_commission?.toFixed(2) || '0'}`}    icon={DollarSign}   color="danger"  />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Config */}
        <div className="card">
          <div className="card-header"><span className="card-title">分销配置</span></div>
          <div className="form-group">
            <label className="form-label">佣金比例</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" min="0" max="1" step="0.01" value={config.commission_rate} onChange={e => setConfig(p => ({ ...p, commission_rate: parseFloat(e.target.value) || 0 }))} style={{ width: 120 }} />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>即 {(config.commission_rate * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'var(--bg)' }}>
              <span style={{ fontSize: 14 }}>启用分销</span>
              <input type="checkbox" checked={config.commission_enabled} onChange={e => setConfig(p => ({ ...p, commission_enabled: e.target.checked }))} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
            </label>
          </div>
          <button className="btn btn-primary" onClick={handleSave}><Save size={14}/>保存配置</button>
        </div>

        {/* Rankings */}
        <div className="card">
          <div className="card-header"><span className="card-title">邀请排行榜</span></div>
          {stats?.rankings?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.rankings.map((r: any, i: number) => (
                <div key={r.inviter_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: i < 3 ? 'var(--primary-50)' : 'var(--bg)' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? 'var(--primary)' : 'var(--border)', color: i < 3 ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{r.username}</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{r.invited_count} 人</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>暂无数据</div>
          )}
        </div>
      </div>

      <style>{`@media (max-width: 768px) { div[style*="grid-template-columns: 1fr 1fr"][style*="gap: 20px"] { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
