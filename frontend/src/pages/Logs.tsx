import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { logApi } from '../api'
import ModelIcon from '../components/ModelIcon'

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([])

  useEffect(() => {
    logApi.list({ page: 1, page_size: 50 }).then(r => { if (r.data.success) setLogs(r.data.data || []) })
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ScrollText size={22} color="var(--primary)" />用量日志
        </h1>
        <p className="page-desc">每次 API 调用的详细记录</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>时间</th><th>令牌</th><th>模型</th><th>输入</th><th>输出</th><th>费用</th></tr></thead>
          <tbody>
            {logs.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>暂无日志</td></tr>
              : logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{new Date(log.created_at * 1000).toLocaleString('zh-CN')}</td>
                  <td><span className="badge badge-gray">{log.token_name}</span></td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ModelIcon modelName={log.model_name} size={20} /><code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>{log.model_name}</code></div></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{log.prompt_tokens?.toLocaleString()}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{log.completion_tokens?.toLocaleString()}</td>
                  <td style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13 }}>${(log.quota / 500000).toFixed(5)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
