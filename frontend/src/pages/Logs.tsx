import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { logApi } from '../api'
import ModelIcon from '../components/ModelIcon'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 15

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1) // 前端 1-indexed，调后端时转 p = page - 1
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    logApi.list({ p: page - 1, page_size: PAGE_SIZE }).then(r => {
      if (r.data.success) {
        setLogs(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).finally(() => setLoading(false))
  }, [page])

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
                {loading ? '加载中...' : '暂无日志'}
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

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
