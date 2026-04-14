import { useEffect, useState } from 'react'
import { Save, Search, Plus, Trash2, Sliders } from 'lucide-react'
import { optionApi } from '../api'
import toast from 'react-hot-toast'

export default function ModelRatiosPage() {
  const [modelRatio, setModelRatio] = useState<Record<string, number>>({})
  const [completionRatio, setCompletionRatio] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newModel, setNewModel] = useState({ name: '', input: '', output: '' })
  const [tab, setTab] = useState<'input' | 'output'>('input')

  useEffect(() => {
    optionApi.get().then(r => {
      if (r.data.success) {
        const opts = r.data.data as Record<string, string>
        try { setModelRatio(JSON.parse(opts.ModelRatio || '{}')) } catch {}
        try { setCompletionRatio(JSON.parse(opts.CompletionRatio || '{}')) } catch {}
      }
    }).catch(() => toast.error('加载失败'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const r = await optionApi.update({
        ModelRatio: JSON.stringify(modelRatio),
        CompletionRatio: JSON.stringify(completionRatio),
      })
      if (r.data.success) toast.success('倍率已保存，立即生效')
      else toast.error(r.data.message || '保存失败')
    } catch { toast.error('网络错误') } finally { setSaving(false) }
  }

  const handleUpdateRatio = (model: string, value: string) => {
    const num = parseFloat(value)
    if (isNaN(num)) return
    setModelRatio(prev => ({ ...prev, [model]: num }))
  }

  const handleUpdateCompletion = (model: string, value: string) => {
    const num = parseFloat(value)
    if (isNaN(num)) return
    setCompletionRatio(prev => ({ ...prev, [model]: num }))
  }

  const handleDelete = (model: string) => {
    setModelRatio(prev => {
      const next = { ...prev }
      delete next[model]
      return next
    })
    setCompletionRatio(prev => {
      const next = { ...prev }
      delete next[model]
      return next
    })
  }

  const handleAdd = () => {
    if (!newModel.name.trim()) { toast.error('请输入模型名称'); return }
    const inputVal = parseFloat(newModel.input) || 1
    setModelRatio(prev => ({ ...prev, [newModel.name]: inputVal }))
    if (newModel.output) {
      const outputVal = parseFloat(newModel.output) || 1
      setCompletionRatio(prev => ({ ...prev, [newModel.name]: outputVal }))
    }
    setNewModel({ name: '', input: '', output: '' })
    setShowAdd(false)
    toast.success(`已添加 ${newModel.name}`)
  }

  const allModels = Array.from(new Set([...Object.keys(modelRatio), ...Object.keys(completionRatio)])).sort()
  const filtered = search ? allModels.filter(m => m.toLowerCase().includes(search.toLowerCase())) : allModels

  // 按前缀分组
  const groups: Record<string, string[]> = {}
  filtered.forEach(m => {
    const prefix = m.split('-')[0] || 'other'
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(m)
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sliders size={22} color="var(--primary)" />模型倍率
          </h1>
          <p className="page-desc">调整模型计费倍率（1 = $0.002/1K tokens）</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowAdd(true)}><Plus size={14}/>添加模型</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={14}/>{saving ? '保存中...' : '保存全部'}
          </button>
        </div>
      </div>

      {/* Search + tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
          <input placeholder="搜索模型名称..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
        </div>
        <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
          <button onClick={() => setTab('input')} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: tab === 'input' ? '#fff' : 'transparent', color: tab === 'input' ? 'var(--text)' : 'var(--muted)', border: 'none', boxShadow: tab === 'input' ? '0 1px 2px rgba(0,0,0,.05)' : 'none' }}>
            输入倍率
          </button>
          <button onClick={() => setTab('output')} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, background: tab === 'output' ? '#fff' : 'transparent', color: tab === 'output' ? 'var(--text)' : 'var(--muted)', border: 'none', boxShadow: tab === 'output' ? '0 1px 2px rgba(0,0,0,.05)' : 'none' }}>
            补全倍率
          </button>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>共 {allModels.length} 个模型</span>
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ maxHeight: 600, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '50%' }}>模型名称</th>
              <th>{tab === 'input' ? '输入倍率' : '补全倍率'}</th>
              <th>{tab === 'input' ? '换算价格' : '倍数'}</th>
              <th style={{ width: 60 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">未找到匹配模型</td></tr>
            ) : (
              Object.entries(groups).map(([prefix, models]) => (
                models.map((model, i) => (
                  <tr key={model}>
                    {i === 0 && (
                      <td rowSpan={models.length} style={{ verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{prefix}</div>
                        {models.map(m => (
                          <div key={m} style={{ fontSize: 13, padding: '4px 0', fontFamily: 'monospace', color: 'var(--text)' }}>{m}</div>
                        ))}
                      </td>
                    )}
                    <td>
                      {tab === 'input' ? (
                        <input
                          type="number"
                          step="0.001"
                          value={modelRatio[model] ?? ''}
                          onChange={e => handleUpdateRatio(model, e.target.value)}
                          style={{ width: 120, padding: '6px 10px', fontSize: 13, fontFamily: 'monospace' }}
                        />
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={completionRatio[model] ?? ''}
                          onChange={e => handleUpdateCompletion(model, e.target.value)}
                          placeholder="默认1"
                          style={{ width: 120, padding: '6px 10px', fontSize: 13, fontFamily: 'monospace' }}
                        />
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {tab === 'input'
                        ? `$${((modelRatio[model] || 0) * 0.002).toFixed(4)}/1K`
                        : completionRatio[model] ? `${completionRatio[model].toFixed(2)}x` : '1x (默认)'}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-icon" onClick={() => handleDelete(model)} title="删除">
                        <Trash2 size={13} color="var(--danger)"/>
                      </button>
                    </td>
                  </tr>
                ))
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        <strong>计费说明：</strong>输入倍率 1 = $0.002/1K tokens。例如 GPT-4o 的倍率 2.5 表示 $0.005/1K tokens。
        补全倍率是输出相对于输入的价格倍数，留空默认为 1（输出价格=输入价格）。
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">添加模型倍率</div>
            <div className="form-group">
              <label className="form-label">模型名称</label>
              <input placeholder="gpt-4o-mini" value={newModel.name} onChange={e => setNewModel(p => ({ ...p, name: e.target.value }))} autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">输入倍率</label>
                <input type="number" step="0.001" placeholder="1" value={newModel.input} onChange={e => setNewModel(p => ({ ...p, input: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">补全倍率（选填）</label>
                <input type="number" step="0.01" placeholder="默认1" value={newModel.output} onChange={e => setNewModel(p => ({ ...p, output: e.target.value }))} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAdd(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleAdd}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
