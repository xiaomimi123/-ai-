import { useState, useEffect } from 'react'
import { ScrollText, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { SearchInput } from '../../components/SearchInput'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface LogRow {
  id: number
  created_at: number
  username: string
  token_name: string
  model_name: string
  prompt_tokens: number
  completion_tokens: number
  channel_id: number
  elapsed_time: number
  quota: number
}

const PAGE_SIZE = 15

export default function AgentTeamLogsPage() {
  const [list, setList] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState({ username: '', model_name: '' })

  const load = () => {
    agentApi.teamLogs({
      page,
      page_size: PAGE_SIZE,
      username: filter.username || undefined,
      model_name: filter.model_name || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载失败'))
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [page])

  const handleSearch = () => { if (page !== 1) setPage(1); else load() }

  return (
    <div>
      <PageHeader
        title="团队调用日志"
        description={`共 ${total} 条记录`}
        icon={ScrollText}
        actions={
          <>
            <SearchInput
              value={filter.username}
              onChange={v => setFilter(p => ({ ...p, username: v }))}
              onSubmit={handleSearch}
              placeholder="用户名"
              width={160}
            />
            <SearchInput
              value={filter.model_name}
              onChange={v => setFilter(p => ({ ...p, model_name: v }))}
              onSubmit={handleSearch}
              placeholder="模型"
              width={180}
            />
            <button className="btn btn-outline" onClick={handleSearch}><RefreshCw size={14}/>查询</button>
          </>
        }
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>令牌</th>
              <th>模型</th>
              <th style={{ textAlign: 'right' }}>输入</th>
              <th style={{ textAlign: 'right' }}>输出</th>
              <th>渠道</th>
              <th style={{ textAlign: 'right' }}>耗时</th>
              <th style={{ textAlign: 'right' }}>费用</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 0 }}>
                <EmptyCard
                  icon={ScrollText}
                  title="暂无日志"
                  description={(filter.username || filter.model_name) ? '试试别的筛选条件' : ''}
                />
              </td></tr>
            ) : list.map(log => (
              <tr key={log.id}>
                <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {new Date(log.created_at * 1000).toLocaleString('zh-CN')}
                </td>
                <td><strong style={{ fontSize: 13 }}>{log.username}</strong></td>
                <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{log.token_name}</span></td>
                <td><code style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>{log.model_name}</code></td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{log.prompt_tokens?.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>{log.completion_tokens?.toLocaleString()}</td>
                <td><span className="badge badge-blue">#{log.channel_id}</span></td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {log.elapsed_time ? `${log.elapsed_time}ms` : '-'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  ${(log.quota / 500000).toFixed(5)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  )
}
