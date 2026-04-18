import { useEffect, useState } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { logApi } from '../api'
import ModelIcon from '../components/ModelIcon'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 15

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1) // 1-indexed
  const [filter, setFilter] = useState({ username: '', model_name: '' })
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await logApi.list({ p: page - 1, page_size: PAGE_SIZE, ...filter })
      if (r.data.success) {
        setLogs(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [page])

  const handleSearch = () => { if (page !== 1) setPage(1); else load() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">调用日志</h1>
          <p className="page-desc">所有用户的 API 调用记录</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
            <input placeholder="用户名" value={filter.username} onChange={e => setFilter(p => ({ ...p, username: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ paddingLeft: 32, width: 140 }}/>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
            <input placeholder="模型" value={filter.model_name} onChange={e => setFilter(p => ({ ...p, model_name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ paddingLeft: 32, width: 160 }}/>
          </div>
          <button className="btn btn-outline" onClick={handleSearch}><RefreshCw size={14}/>查询</button>
        </div>
      </div>

      <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
        <table>
          <thead><tr><th>时间</th><th>用户</th><th>令牌</th><th>模型</th><th>输入</th><th>输出</th><th>渠道</th><th>耗时</th><th>费用</th></tr></thead>
          <tbody>
            {logs.length === 0
              ? <tr><td colSpan={9} className="empty-state">暂无日志</td></tr>
              : logs.map(log => (
                <tr key={log.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{new Date(log.created_at * 1000).toLocaleString('zh-CN')}</td>
                  <td><strong style={{ fontSize: 13 }}>{log.username}</strong></td>
                  <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{log.token_name}</span></td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ModelIcon modelName={log.model_name} size={18} /><code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>{log.model_name}</code></div></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{log.prompt_tokens?.toLocaleString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{log.completion_tokens?.toLocaleString()}</td>
                  <td><span className="badge badge-blue">#{log.channel_id}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{log.elapsed_time ? `${log.elapsed_time}ms` : '-'}</td>
                  <td style={{ color: 'var(--success)', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>${(log.quota / 500000).toFixed(5)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
