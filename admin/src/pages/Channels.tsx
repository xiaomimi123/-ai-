import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Trash2, PlayCircle, CheckCircle, XCircle, ToggleLeft, ToggleRight,
  Loader2, RefreshCw, DollarSign, Search, Edit2, Copy, ChevronLeft, ChevronRight,
  AlertTriangle, Settings,
} from 'lucide-react'
import { channelApi } from '../api'
import toast from 'react-hot-toast'

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

// ---- 表单类型 ----
type ChannelForm = {
  id?: number
  name: string
  type: number
  key: string            // 新建时可多行；编辑时留空 = 不修改
  base_url: string
  models: string
  model_mapping: string
  priority: number
  weight: number
  group: string          // 逗号分隔
  system_prompt: string
  config: string         // JSON 文本（AWS/Vertex 等高阶厂商）
}

const emptyForm: ChannelForm = {
  name: '', type: 1, key: '', base_url: '', models: '',
  model_mapping: '', priority: 0, weight: 0, group: 'default',
  system_prompt: '', config: '',
}

// ---- 工具函数 ----
function timeAgo(ts: number): string {
  if (!ts) return '未测试'
  const sec = Math.floor(Date.now() / 1000) - ts
  if (sec < 60) return `${sec} 秒前`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
  return `${Math.floor(sec / 86400)} 天前`
}

// 状态展示：1=启用 2=手动禁用 3=自动禁用
function StatusCell({ status, onToggle }: { status: number; onToggle: () => void }) {
  if (status === 1) {
    return (
      <button onClick={onToggle} title="点击手动禁用" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <ToggleRight size={22} color="var(--success)" />
        <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>启用</span>
      </button>
    )
  }
  if (status === 3) {
    return (
      <button onClick={onToggle} title="自动禁用（连续失败）点击重新启用" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <AlertTriangle size={16} color="var(--danger)" />
        <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>自动禁用</span>
      </button>
    )
  }
  // 2 或其它 = 手动禁用
  return (
    <button onClick={onToggle} title="点击启用" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <ToggleLeft size={22} color="var(--muted)" />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>已禁用</span>
    </button>
  )
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<any[]>([])
  const [page, setPage] = useState(0)
  const [pageSize] = useState(20) // 后端 ItemsPerPage 默认 20
  const [keyword, setKeyword] = useState('')
  const [searchMode, setSearchMode] = useState(false) // 是否处于搜索结果状态
  const [refreshing, setRefreshing] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testingAll, setTestingAll] = useState(false)
  const [checkingId, setCheckingId] = useState<number | null>(null)
  const [modal, setModal] = useState<ChannelForm | null>(null) // null = 关闭；有值 = 打开（新建或编辑，靠 id 区分）
  const [modalLoading, setModalLoading] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- 加载 ----
  const load = async () => {
    try {
      const r = await channelApi.list({ p: page })
      if (r.data.success) setChannels(r.data.data || [])
    } catch { toast.error('加载失败') }
  }
  const search = async (kw: string) => {
    if (!kw.trim()) { setSearchMode(false); load(); return }
    try {
      const r = await channelApi.search(kw.trim())
      if (r.data.success) {
        setChannels(r.data.data || [])
        setSearchMode(true)
      }
    } catch { toast.error('搜索失败') }
  }

  useEffect(() => { if (!searchMode) load() /* eslint-disable-next-line */ }, [page])
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  // 搜索防抖
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => search(keyword), 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
    // eslint-disable-next-line
  }, [keyword])

  // ---- 新建 / 编辑 ----
  const openCreate = () => { setModal({ ...emptyForm }); setShowAdvanced(false) }
  const openEdit = async (id: number) => {
    try {
      const r = await channelApi.get(id)
      if (r.data.success) {
        const c = r.data.data
        setModal({
          id: c.id,
          name: c.name || '',
          type: c.type || 1,
          key: '', // 编辑时默认不修改 key
          base_url: c.base_url || '',
          models: c.models || '',
          model_mapping: c.model_mapping || '',
          priority: c.priority || 0,
          weight: c.weight || 0,
          group: c.group || 'default',
          system_prompt: c.system_prompt || '',
          config: c.config || '',
        })
        setShowAdvanced(Boolean(c.model_mapping || c.config || c.system_prompt || c.priority || c.weight))
      } else toast.error(r.data.message || '加载失败')
    } catch { toast.error('加载失败') }
  }
  const openClone = (ch: any) => {
    setModal({
      name: `${ch.name} (副本)`,
      type: ch.type,
      key: '',
      base_url: ch.base_url || '',
      models: ch.models || '',
      model_mapping: ch.model_mapping || '',
      priority: ch.priority || 0,
      weight: ch.weight || 0,
      group: ch.group || 'default',
      system_prompt: ch.system_prompt || '',
      config: ch.config || '',
    })
    setShowAdvanced(Boolean(ch.model_mapping || ch.config))
    toast.success(`已复制「${ch.name}」的配置，请粘贴新的 API Key`)
  }

  const handleSubmit = async () => {
    if (!modal) return
    if (!modal.name.trim()) { toast.error('请填写名称'); return }
    if (!modal.id && !modal.key.trim()) { toast.error('请填写 API Key'); return }
    // JSON 字段简单预校验
    if (modal.model_mapping && modal.model_mapping.trim()) {
      try { JSON.parse(modal.model_mapping) } catch { toast.error('模型映射 JSON 格式错误'); return }
    }
    if (modal.config && modal.config.trim()) {
      try { JSON.parse(modal.config) } catch { toast.error('Config JSON 格式错误'); return }
    }
    setModalLoading(true)
    try {
      const payload: any = {
        name: modal.name.trim(),
        type: modal.type,
        base_url: modal.base_url.trim(),
        models: modal.models.trim(),
        model_mapping: modal.model_mapping.trim(),
        priority: modal.priority,
        weight: modal.weight,
        group: modal.group.trim() || 'default',
        system_prompt: modal.system_prompt,
        config: modal.config.trim(),
      }
      if (modal.id) {
        payload.id = modal.id
        // 编辑时 key 留空 = 不修改（GORM Updates 不写入零值）
        if (modal.key.trim()) payload.key = modal.key.trim()
        const r = await channelApi.update(modal.id, payload)
        if (r.data.success) { toast.success('已保存'); setModal(null); load() }
        else toast.error(r.data.message || '保存失败')
      } else {
        // 新建：key 可多行，后端按 \n 分隔批量创建
        payload.key = modal.key.trim()
        const r = await channelApi.create(payload)
        if (r.data.success) { toast.success('已创建'); setModal(null); load() }
        else toast.error(r.data.message || '创建失败')
      }
    } catch { toast.error('网络错误') } finally { setModalLoading(false) }
  }

  // ---- 操作 ----
  const handleToggle = async (ch: any) => {
    // 当前启用 → 手动禁用；当前禁用（含自动禁用）→ 启用
    const next = ch.status === 1 ? 2 : 1
    try {
      const r = await channelApi.update(ch.id, { status: next })
      if (r.data.success) load()
      else toast.error(r.data.message || '切换失败')
    } catch { toast.error('切换失败') }
  }

  const handleDelete = async (ch: any) => {
    if (!confirm(`删除「${ch.name}」？\n此操作不可恢复，已用额度历史将丢失。`)) return
    try {
      const r = await channelApi.delete(ch.id)
      if (r.data.success) { toast.success('已删除'); load() }
      else toast.error(r.data.message || '删除失败')
    } catch { toast.error('删除失败') }
  }

  const handleDeleteDisabled = async () => {
    if (!confirm('删除所有禁用的渠道（手动禁用 + 自动禁用）？\n此操作不可恢复。')) return
    try {
      const r = await channelApi.deleteDisabled()
      if (r.data.success) { toast.success(`已删除 ${r.data.data || 0} 个禁用渠道`); load() }
      else toast.error(r.data.message || '删除失败')
    } catch { toast.error('删除失败') }
  }

  const handleTest = async (id: number) => {
    setTestingId(id)
    try {
      const r = await channelApi.test(id)
      if (r.data.success) toast.success(`测试通过 (${(r.data.time || 0).toFixed(2)}s)`)
      else toast.error(`测试失败：${r.data.message || ''}`)
      await load() // 刷新列表拉回最新的 test_time / response_time
    } catch { toast.error('测试失败') } finally { setTestingId(null) }
  }

  const handleTestAll = async (scope: 'all' | 'disabled') => {
    setTestingAll(true)
    try {
      const r = await channelApi.testAll(scope)
      if (r.data.success) toast.success(scope === 'disabled' ? '已启动：测试已禁用渠道（后台异步进行）' : '已启动：测试所有渠道（后台异步进行）')
      else toast.error(r.data.message || '启动失败')
      // 后端是 goroutine 异步跑，不阻塞；5s 后刷一次列表
      setTimeout(load, 5000)
    } catch { toast.error('启动失败') } finally { setTestingAll(false) }
  }

  const checkBalance = async (id: number) => {
    setCheckingId(id)
    try {
      const r = await channelApi.updateBalance(id)
      if (r.data.success) { load(); toast.success('余额已更新') }
      else toast.error(r.data.message || '查询失败')
    } catch { toast.error('查询失败') } finally { setCheckingId(null) }
  }

  const refreshAllBalance = async () => {
    setRefreshing(true)
    try {
      await channelApi.updateAllBalance()
      await load()
      toast.success('所有余额已刷新')
    } catch { toast.error('刷新失败') } finally { setRefreshing(false) }
  }

  // ---- 派生 ----
  const stats = useMemo(() => {
    const enabled = channels.filter(c => c.status === 1).length
    const manualOff = channels.filter(c => c.status === 2).length
    const autoOff = channels.filter(c => c.status === 3).length
    return { total: channels.length, enabled, manualOff, autoOff }
  }, [channels])

  const hasMore = !searchMode && channels.length === pageSize

  return (
    <div>
      {/* 标题区 + 统计 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">渠道管理</h1>
          <p className="page-desc">
            共 <strong>{stats.total}</strong>{searchMode ? ' 个匹配' : ' 个'} · 启用 <span style={{ color: 'var(--success)' }}>{stats.enabled}</span>
            {stats.manualOff > 0 && <> · 手动禁用 <span style={{ color: 'var(--muted)' }}>{stats.manualOff}</span></>}
            {stats.autoOff > 0 && <> · <span style={{ color: 'var(--danger)' }}>自动禁用 {stats.autoOff}</span></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={refreshAllBalance} disabled={refreshing}>
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            {refreshing ? '查询中' : '刷新余额'}
          </button>
          <button className="btn btn-outline" onClick={() => handleTestAll('all')} disabled={testingAll}>
            <PlayCircle size={14} />{testingAll ? '测试中' : '测试全部'}
          </button>
          {stats.autoOff > 0 && (
            <button className="btn btn-outline" onClick={() => handleTestAll('disabled')} disabled={testingAll} title="仅测试已禁用的渠道，自动恢复可用的">
              <PlayCircle size={14} />测禁用渠道
            </button>
          )}
          <button className="btn btn-primary" onClick={openCreate}><Plus size={14} />添加渠道</button>
        </div>
      </div>

      {/* 搜索 + 清理按钮 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 420 }}>
          <Search size={14} color="var(--muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="按 ID 或名称搜索..."
            style={{ paddingLeft: 34, paddingRight: keyword ? 34 : 14 }}
          />
          {keyword && (
            <button onClick={() => setKeyword('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
              <XCircle size={14} />
            </button>
          )}
        </div>
        {(stats.manualOff + stats.autoOff) > 0 && (
          <button className="btn btn-ghost" onClick={handleDeleteDisabled} style={{ color: 'var(--danger)', fontSize: 13 }}>
            <Trash2 size={13} />清理禁用渠道 ({stats.manualOff + stats.autoOff})
          </button>
        )}
      </div>

      {/* 表格 */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>名称</th><th>类型</th><th>状态</th>
              <th>优先级</th><th>余额</th><th>已用</th><th>响应</th><th>上次测试</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 ? (
              <tr><td colSpan={10} className="empty-state">{searchMode ? '未找到匹配渠道' : '暂无渠道，点击上方按钮添加'}</td></tr>
            ) : channels.map(ch => {
              const type = TYPES[ch.type] || { name: `Type ${ch.type}`, color: '#6b7280' }
              const tested = ch.test_time > 0
              const testOk = tested && ch.response_time > 0
              return (
                <tr key={ch.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{ch.id}</td>
                  <td><strong>{ch.name}</strong></td>
                  <td>
                    <span className="badge" style={{ background: `${type.color}15`, color: type.color, border: `1px solid ${type.color}30` }}>
                      {type.name}
                    </span>
                  </td>
                  <td><StatusCell status={ch.status} onToggle={() => handleToggle(ch)} /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{ch.priority || 0}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: ch.balance > 0 ? 'var(--success)' : 'var(--muted)', fontSize: 13 }}>
                      ${(ch.balance || 0).toFixed(2)}
                    </div>
                    {ch.balance_updated_time > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{timeAgo(ch.balance_updated_time)}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--muted)' }}>
                    ${((ch.used_quota || 0) / 500000).toFixed(2)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {ch.response_time ? `${(ch.response_time / 1000).toFixed(2)}s` : '-'}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {tested ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {testOk ? <CheckCircle size={12} color="var(--success)" /> : <XCircle size={12} color="var(--danger)" />}
                        <span style={{ color: 'var(--muted)' }}>{timeAgo(ch.test_time)}</span>
                      </div>
                    ) : <span style={{ color: 'var(--muted)' }}>未测试</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn btn-ghost btn-icon" title="测试" onClick={() => handleTest(ch.id)} disabled={testingId === ch.id}>
                        {testingId === ch.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <PlayCircle size={14} color="var(--primary)" />}
                      </button>
                      <button className="btn btn-ghost btn-icon" title="查余额" onClick={() => checkBalance(ch.id)} disabled={checkingId === ch.id}>
                        {checkingId === ch.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <DollarSign size={14} color="var(--success)" />}
                      </button>
                      <button className="btn btn-ghost btn-icon" title="编辑" onClick={() => openEdit(ch.id)}>
                        <Edit2 size={14} color="var(--accent)" />
                      </button>
                      <button className="btn btn-ghost btn-icon" title="克隆配置" onClick={() => openClone(ch)}>
                        <Copy size={14} color="var(--muted)" />
                      </button>
                      <button className="btn btn-ghost btn-icon" title="删除" onClick={() => handleDelete(ch)}>
                        <Trash2 size={14} color="var(--danger)" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 分页（搜索模式隐藏） */}
      {!searchMode && (page > 0 || hasMore) && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
            <ChevronLeft size={14} />上一页
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>第 {page + 1} 页</span>
          <button className="btn btn-outline btn-sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
            下一页<ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* 新建 / 编辑 弹窗 */}
      {modal && (
        <div className="modal-overlay" onClick={() => !modalLoading && setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">{modal.id ? `编辑渠道 #${modal.id}` : '添加渠道'}</div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">名称</label>
                <input placeholder="Anthropic 主渠道" value={modal.name} onChange={e => setModal(m => m && ({ ...m, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">类型</label>
                <select value={modal.type} onChange={e => setModal(m => m && ({ ...m, type: +e.target.value }))}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                API Key
                {modal.id && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>留空则保持原 Key</span>}
                {!modal.id && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>多个 Key 请用换行分隔，会创建多个同配置渠道</span>}
              </label>
              <textarea
                rows={modal.id ? 2 : 4}
                placeholder={modal.id ? '如需轮换请粘贴新 Key；不改请留空' : 'sk-xxx\nsk-yyy\n...'}
                value={modal.key}
                onChange={e => setModal(m => m && ({ ...m, key: e.target.value }))}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">代理地址（可选）</label>
              <input placeholder="https://api.openai.com" value={modal.base_url} onChange={e => setModal(m => m && ({ ...m, base_url: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">支持模型（逗号分隔）</label>
              <textarea
                rows={2}
                placeholder="claude-sonnet-4-6,claude-haiku-4-5,gpt-4o"
                value={modal.models}
                onChange={e => setModal(m => m && ({ ...m, models: e.target.value }))}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}
              />
            </div>

            {/* 高级选项折叠 */}
            <div style={{ marginTop: 6, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <Settings size={13} />{showAdvanced ? '收起高级选项' : '展开高级选项（优先级 / 权重 / 分组 / 映射 / Config）'}
              </button>
            </div>

            {showAdvanced && (
              <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 8, marginBottom: 16 }}>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">优先级（越大越优先）</label>
                    <input type="number" value={modal.priority} onChange={e => setModal(m => m && ({ ...m, priority: +e.target.value || 0 }))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">权重（同优先级内加权轮询）</label>
                    <input type="number" value={modal.weight} onChange={e => setModal(m => m && ({ ...m, weight: +e.target.value || 0 }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">分组（逗号分隔）</label>
                  <input placeholder="default,vip" value={modal.group} onChange={e => setModal(m => m && ({ ...m, group: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">模型映射（JSON，请求模型名 → 实际模型名）</label>
                  <textarea
                    rows={3}
                    placeholder='{"claude-sonnet-4-6": "anthropic.claude-sonnet-4-20250522"}'
                    value={modal.model_mapping}
                    onChange={e => setModal(m => m && ({ ...m, model_mapping: e.target.value }))}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Config JSON
                    <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>AWS / Vertex / Azure 等厂商特定字段</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder='{"region":"us-east-1","ak":"xxx","sk":"xxx"}（AWS Claude 示例）'
                    value={modal.config}
                    onChange={e => setModal(m => m && ({ ...m, config: e.target.value }))}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">System Prompt（可选，该渠道的预设系统提示）</label>
                  <textarea rows={2} value={modal.system_prompt} onChange={e => setModal(m => m && ({ ...m, system_prompt: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setModal(null)} disabled={modalLoading}>取消</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={modalLoading}>
                {modalLoading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />保存中</> : (modal.id ? '保存修改' : '创建渠道')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
