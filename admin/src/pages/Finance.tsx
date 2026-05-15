import { DollarSign } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { EmptyCard } from '../components/EmptyCard'

export default function FinancePage() {
  return (
    <div>
      <PageHeader
        title="财务统计"
        description="营收 / 上游成本 / 净利润 一览"
        icon={DollarSign}
      />

      <EmptyCard
        icon={DollarSign}
        title="财务面板加载中..."
        description="F2.2 集成 summary + trend 数据，F2.3 集成记账"
      />
    </div>
  )
}
