import { ListTodo } from 'lucide-react'

// Task H1：异步任务管理脚手架。
// 完整的列表 / 筛选 / 重试 / 退款 UI 由 Task H2 实现。
// 这里只占位，并确认路由 + 侧边栏 + API 客户端三件套已经通了。
export default function TasksPage() {
  return (
    <div>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title">异步任务管理</h1>
        <p className="page-desc">查看所有平台异步任务（gpt-image / jimeng 等），重试失败任务、手动退款</p>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 32 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--primary-50)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ListTodo size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>即将上线</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            列表 / 多维度筛选（平台、状态、用户、任务号）/ 重试失败任务 / 手动退款 — 由 Task H2 接入。
          </div>
        </div>
      </div>
    </div>
  )
}
