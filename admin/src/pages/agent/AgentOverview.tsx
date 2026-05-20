import { useEffect, useState } from 'react'
import { Briefcase, Users, DollarSign, TrendingUp, ListTodo } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { agentApi } from '../../api'

interface Overview {
  team_size: number
  month_revenue: number
  my_commission: number
  month_calls: number
}

export default function AgentOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)

  useEffect(() => {
    agentApi.overview().then(r => {
      if (r.data?.success) setData(r.data.data)
    }).catch(() => toast.error('加载失败'))
  }, [])

  const fmtUsd = (n: number) => `$${(n || 0).toFixed(2)}`
  const fmtCny = (n: number) => `¥${(n || 0).toFixed(2)}` // 1:1 USD 假设

  return (
    <div>
      <PageHeader
        title="团队概览"
        description="您团队（您直接邀请的下线）的实时数据"
        icon={Briefcase}
      />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="团队人数"
          value={data?.team_size ?? '—'}
          icon={Users}
          color="info"
          hint="您直接邀请的下线"
        />
        <StatCard
          label="团队本月营收"
          value={data ? fmtCny(data.month_revenue) : '—'}
          icon={DollarSign}
          color="success"
          hint="团队成员本月充值总额"
        />
        <StatCard
          label="我的佣金累计"
          value={data ? fmtUsd(data.my_commission) : '—'}
          icon={TrendingUp}
          color="accent"
          hint="待结算 + 已结算"
        />
        <StatCard
          label="团队本月调用"
          value={data?.month_calls ?? '—'}
          icon={ListTodo}
          color="warning"
          hint="团队成员 API 调用次数"
        />
      </div>

      <div className="card" style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)', fontSize: 14 }}>说明</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>佣金按管理员为您设的"专属返利比例"自动计算，每次团队成员充值成功时入账</li>
          <li>佣金状态：待结算 → 已结算（可提现）</li>
          <li>需要提现请联系管理员或在「我的佣金」页申请</li>
        </ul>
      </div>
    </div>
  )
}
