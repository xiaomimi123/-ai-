import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '../../components/PageHeader'
import { SearchInput } from '../../components/SearchInput'
import { EmptyCard } from '../../components/EmptyCard'
import Pagination from '../../components/Pagination'
import { agentApi } from '../../api'

interface Member {
  id: number
  username: string
  display_name: string
  email: string
  group: string
  quota: number
  used_quota: number
  request_count: number
  status: number
  created_time: number
}

const PAGE_SIZE = 15

export default function AgentTeamMembersPage() {
  const [list, setList] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    agentApi.teamMembers({
      page,
      page_size: PAGE_SIZE,
      keyword: keyword || undefined,
    }).then(r => {
      if (r.data?.success) {
        setList(r.data.data || [])
        setTotal(r.data.total || 0)
      }
    }).catch(() => toast.error('加载失败'))
  }, [page, keyword])

  const toUsd = (q: number) => (q / 500000).toFixed(2)

  return (
    <div>
      <PageHeader
        title="团队成员"
        description={`共 ${total} 位成员（您直接邀请的下线）`}
        icon={Users}
        actions={
          <SearchInput
            value={keyword}
            onChange={v => { setKeyword(v); setPage(1) }}
            placeholder="搜索用户名/邮箱"
            width={240}
            debounce={300}
          />
        }
      />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>显示名 / 邮箱</th>
              <th>分组</th>
              <th style={{ textAlign: 'right' }}>剩余额度</th>
              <th style={{ textAlign: 'right' }}>累计消费</th>
              <th style={{ textAlign: 'right' }}>调用次数</th>
              <th>加入时间</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 0 }}>
                <EmptyCard
                  icon={Users}
                  title={keyword ? '未找到匹配成员' : '暂无团队成员'}
                  description={keyword ? '试试别的关键字' : '把您的邀请链接发给朋友，他们注册后会出现在这里'}
                />
              </td></tr>
            ) : list.map(u => (
              <tr key={u.id}>
                <td>
                  <strong>{u.username}</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: 2 }}>
                    #{u.id}
                  </div>
                </td>
                <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  <div>{u.display_name || '—'}</div>
                  {u.email && <div style={{ fontSize: 11, marginTop: 2 }}>{u.email}</div>}
                </td>
                <td>
                  <span className="badge badge-gray" style={{ fontSize: 11 }}>{u.group || 'default'}</span>
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: u.quota < 0 ? 'var(--danger)' : 'var(--primary)' }}>
                  ${toUsd(u.quota)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                  ${toUsd(u.used_quota)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                  {(u.request_count || 0).toLocaleString()}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {u.created_time ? new Date(u.created_time * 1000).toLocaleDateString('zh-CN') : '—'}
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
