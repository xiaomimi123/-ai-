import { useEffect, useState } from 'react'
import { Plus, Trash2, PlayCircle, CheckCircle, XCircle, ToggleLeft, ToggleRight, Loader2, RefreshCw, DollarSign } from 'lucide-react'
import { channelApi } from '../api'
import toast from 'react-hot-toast'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 30000 })

// 注意：编号必须严格匹配后端 backend/relay/channeltype/define.go 的 iota 顺序
// 之前 DeepSeek 错填成 33（实际是 AwsClaude），导致渠道创建后请求路由到错误 adaptor
const TYPES: Record<number, { name: string; color: string }> = {
  1:  { name: 'OpenAI',       color: '#10a37f' },
  3:  { name: 'Azure',        color: '#0078d4' },
  14: { name: 'Anthropic',    color: '#d4a27f' },
  15: { name: 'Baidu',        color: '#2932e1' },
  16: { name: 'Zhipu',        color: '#3366ff' },
  17: { name: 'Ali',          color: '#ff6a00' },
  18: { name: 'Xunfei',       color: '#1a73e8' },
  24: { name: 'Gemini',       color: '#4285f4' },
  25: { name: 'Moonshot',     color: '#000000' },
  28: { name: 'Mistral',      color: '#ff7000' },
  29: { name: 'Groq',         color: '#f55036' },
  33: { name: 'AwsClaude',    color: '#ff9900' },
  36: { name: 'DeepSeek',     color: '#4D6BFE' },
  40: { name: 'Doubao',       color: '#1e40af' },
  44: { name: 'SiliconFlow',  color: '#5e72e4' },
  45: { name: 'xAI',          color: '#000000' },
  50: { name: 'OpenAICompatible', color: '#6b7280' },
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [checkingId, setCheckingId] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; time?: number }>>({})
  const [form, setForm] = useState({ name: '', type: 1, key: '', base_url: '', models: '' })

  const load = async () => { const r = await channelApi.list(); if (r.data.success) setChannels(r.data.data || []) }
  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    await channelApi.create({ ...form, model_mapping: '', groups: ['default'] })
    setShowCreate(false); setForm({ name: '', type: 1, key: '', base_url: '', models: '' }); load()
  }

  const handleTest = async (id: number) => {
    setTestingId(id)
    const start = Date.now()
    try {
      const r = await channelApi.test(id)
      setTestResults(p => ({ ...p, [id]: { ok: r.data.success, time: Date.now() - start } }))
    } catch {
      setTestResults(p => ({ ...p, [id]: { ok: false, time: Date.now() - start } }))
    } finally { setTestingId(null) }
  }

  const handleToggle = async (ch: any) => { await channelApi.update(ch.id, { status: ch.status === 1 ? 2 : 1 }); load() }
  const handleDelete = async (id: number) => { if (!confirm('确定删除此渠道？')) return; await channelApi.delete(id); load() }
  const handleTestAll = async () => { for (const ch of channels) { await handleTest(ch.id) } }

  const checkBalance = async (channelId: number) => {
    setCheckingId(channelId)
    try {
      const res = await http.get(`/api/channel/update_balance/${channelId}`)
      if (res.data.success) { load(); toast.success('余额已更新') }
      else toast.error(res.data.message || '查询失败')
    } catch { toast.error('查询失败') } finally { setCheckingId(null) }
  }

  const refreshAllBalance = async () => {
    setRefreshing(true)
    try {
      await http.get('/api/channel/update_balance/')
      await load()
      toast.success('所有余额已刷新')
    } catch { toast.error('刷新失败') } finally { setRefreshing(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">渠道管理</h1>
          <p className="page-desc">共 {channels.length} 个渠道，{channels.filter(c => c.status === 1).length} 个启用</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={refreshAllBalance} disabled={refreshing}>
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />{refreshing ? '查询中...' : '刷新所有余额'}
          </button>
          <button className="btn btn-outline" onClick={handleTestAll}><PlayCircle size={15}/>全部测试</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15}/>添加渠道</button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>名称</th><th>类型</th><th>状态</th><th>余额</th><th>优先级</th><th>响应时间</th><th>测试</th><th>操作</th></tr></thead>
          <tbody>
            {channels.length === 0
              ? <tr><td colSpan={9} className="empty-state">暂无渠道，点击上方按钮添加</td></tr>
              : channels.map(ch => {
                const type = TYPES[ch.type] || { name: `Type ${ch.type}`, color: '#6b7280' }
                const test = testResults[ch.id]
                return (
                  <tr key={ch.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{ch.id}</td>
                    <td><strong>{ch.name}</strong></td>
                    <td>
                      <span className="badge" style={{ background: `${type.color}15`, color: type.color, border: `1px solid ${type.color}30` }}>
                        {type.name}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => handleToggle(ch)} style={{ padding: '2px 0' }}>
                        {ch.status === 1 ? <ToggleRight size={22} color="var(--success)"/> : <ToggleLeft size={22} color="var(--muted)"/>}
                      </button>
                    </td>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, color: ch.balance > 0 ? 'var(--success)' : 'var(--muted)', fontSize: 13 }}>
                          ${(ch.balance || 0).toFixed(2)}
                        </div>
                        {ch.balance_updated_time > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(ch.balance_updated_time * 1000).toLocaleString('zh-CN')}</div>
                        )}
                        {ch.balance === 0 && ch.balance_updated_time === 0 && (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>未查询</div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{ch.priority || 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ch.response_time ? `${(ch.response_time/1000).toFixed(2)}s` : '-'}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon" onClick={() => handleTest(ch.id)} disabled={testingId === ch.id}>
                        {testingId === ch.id ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> :
                         test?.ok === true ? <CheckCircle size={15} color="var(--success)"/> :
                         test?.ok === false ? <XCircle size={15} color="var(--danger)"/> :
                         <PlayCircle size={15} color="var(--primary)"/>}
                      </button>
                      {test?.time && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{test.time}ms</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" title="查余额" onClick={() => checkBalance(ch.id)} disabled={checkingId === ch.id}>
                          {checkingId === ch.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <DollarSign size={14} color="var(--success)"/>}
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(ch.id)} title="删除">
                          <Trash2 size={14} color="var(--danger)"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">添加渠道</div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">名称</label><input placeholder="Anthropic 主渠道" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}/></div>
              <div className="form-group"><label className="form-label">类型</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: +e.target.value }))}>
                  {Object.entries(TYPES).map(([k,v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">API Key</label><input type="password" placeholder="sk-..." value={form.key} onChange={e => setForm(p => ({ ...p, key: e.target.value }))}/></div>
            <div className="form-group"><label className="form-label">代理地址（可选）</label><input placeholder="https://api.openai.com" value={form.base_url} onChange={e => setForm(p => ({ ...p, base_url: e.target.value }))}/></div>
            <div className="form-group"><label className="form-label">支持模型（逗号分隔）</label><input placeholder="claude-3-5-sonnet-20241022, gpt-4o" value={form.models} onChange={e => setForm(p => ({ ...p, models: e.target.value }))}/></div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate}>添加渠道</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
