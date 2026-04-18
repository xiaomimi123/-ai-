import { useEffect, useState } from 'react'
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { logApi } from '../api'
import ModelIcon from '../components/ModelIcon'

const PAGE_SIZE = 10

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [page, setPage] = useState(0) // 后端 p 从 0 开始
  const [loading, setLoading] = useState(false)

  const load = async (targetPage: number) => {
    setLoading(true)
    try {
      const r = await logApi.list({ p: targetPage, page_size: PAGE_SIZE })
      if (r.data.success) setLogs(r.data.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(page) }, [page])

  // 是否还有下一页：当前返回条数 === 每页条数（无法精确判断最后一页，但足够）
  const hasMore = logs.length === PAGE_SIZE

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ScrollText size={22} color="var(--accent)" />用量日志
        </h1>
        <p className="page-desc">每次 API 调用的详细记录</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>时间</th><th>令牌</th><th>模型</th><th>输入</th><th>输出</th><th>费用</th></tr></thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>
                {loading ? '加载中...' : (page === 0 ? '暂无日志' : '没有更多了')}
              </td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(log.created_at * 1000).toLocaleString('zh-CN')}</td>
                <td><span className="badge badge-gray">{log.token_name}</span></td>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ModelIcon modelName={log.model_name} size={20} /><code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: 'var(--text)' }}>{log.model_name}</code></div></td>
                <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}>{log.prompt_tokens?.toLocaleString()}</td>
                <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}>{log.completion_tokens?.toLocaleString()}</td>
                <td style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>${(log.quota / 500000).toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页：首页 + 有数据时显示 */}
      {(page > 0 || hasMore) && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
          >
            <ChevronLeft size={14} />上一页
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>第 {page + 1} 页</span>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore || loading}
          >
            下一页<ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
