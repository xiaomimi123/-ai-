import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, Sliders } from 'lucide-react'
import { optionApi } from '../api'
import toast from 'react-hot-toast'
import { PageHeader } from '../components/PageHeader'
import { SearchInput } from '../components/SearchInput'
import { FilterTabs } from '../components/FilterTabs'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyCard } from '../components/EmptyCard'

// 这个页面只有模型名（ratio map 的 key），没有 tags 数据。
// 按名字推断是否图像模型，避免显示误导的 "$X/1K tokens"。
// 命中规则与 frontend isImageModel 互补：tags 优先；这里仅靠 model_id 关键词兜底。
function isLikelyImageModel(modelName: string): boolean {
  const lower = modelName.toLowerCase()
  return lower.includes('image')
      || lower.includes('imagen')
      || lower.includes('dall-e')
      || lower.includes('nano-banana')
      || lower.includes('flux')
}

export default function ModelRatiosPage() {
  const [modelRatio, setModelRatio] = useState<Record<string, number>>({})
  const [completionRatio, setCompletionRatio] = useState<Record<string, number>>({})
  // draft = 输入框正在编辑的文本（string），允许 "0." / "" 这种中间态；
  // 没在 draft 里的字段就 fallback 到 modelRatio/completionRatio 的数字
  // 老版本 onChange 直接 parseFloat 写回 number，导致 "0." 立即被清成 0，无法输入小数
  const [inputDraft, setInputDraft] = useState<Record<string, string>>({})
  const [completionDraft, setCompletionDraft] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newModel, setNewModel] = useState({ name: '', input: '', output: '' })
  const [tab, setTab] = useState<'input' | 'output'>('input')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

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
    // 先记下原文本（允许 "0." / "" 等中间态）
    setInputDraft(prev => ({ ...prev, [model]: value }))
    // 同步合法的 number 进 modelRatio，保存逻辑无需改变
    const num = parseFloat(value)
    if (value === '') {
      setModelRatio(prev => { const n = { ...prev }; delete n[model]; return n })
      return
    }
    if (isNaN(num)) return
    setModelRatio(prev => ({ ...prev, [model]: num }))
  }

  const handleUpdateCompletion = (model: string, value: string) => {
    setCompletionDraft(prev => ({ ...prev, [model]: value }))
    const num = parseFloat(value)
    if (value === '') {
      setCompletionRatio(prev => { const n = { ...prev }; delete n[model]; return n })
      return
    }
    if (isNaN(num)) return
    setCompletionRatio(prev => ({ ...prev, [model]: num }))
  }

  const handleDelete = (model: string) => {
    setDeleteTarget(model)
  }

  const doDelete = () => {
    if (!deleteTarget) return
    const model = deleteTarget
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
    setInputDraft(prev => { const n = { ...prev }; delete n[model]; return n })
    setCompletionDraft(prev => { const n = { ...prev }; delete n[model]; return n })
    setDeleteTarget(null)
    toast.success(`已从列表移除 ${model}（点击「保存全部」生效）`)
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
      <PageHeader
        title="模型倍率"
        description="调整模型计费倍率（1 = $0.002/1K tokens）"
        icon={Sliders}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setShowAdd(true)}><Plus size={14}/>添加模型</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={14}/>{saving ? '保存中...' : '保存全部'}
            </button>
          </>
        }
      />

      {/* Search + tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="搜索模型名称..."
          width={320}
        />
        <FilterTabs
          value={tab}
          onChange={v => setTab(v as 'input' | 'output')}
          options={[
            { label: '输入倍率', value: 'input' },
            { label: '补全倍率', value: 'output' },
          ]}
        />
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>共 {allModels.length} 个模型</span>
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
              <tr><td colSpan={4} style={{ padding: 0 }}>
                <EmptyCard
                  icon={Sliders}
                  title={search ? '未找到匹配模型' : '暂无模型倍率配置'}
                  description={search ? '试试别的关键字' : '点击右上角「添加模型」开始'}
                />
              </td></tr>
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
                          // 优先 draft（用户输入中的原文本），否则用已保存的数字
                          value={inputDraft[model] ?? (modelRatio[model] ?? '')}
                          onChange={e => handleUpdateRatio(model, e.target.value)}
                          style={{ width: 120, padding: '6px 10px', fontSize: 13, fontFamily: 'monospace' }}
                        />
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={completionDraft[model] ?? (completionRatio[model] ?? '')}
                          onChange={e => handleUpdateCompletion(model, e.target.value)}
                          placeholder="默认1"
                          style={{ width: 120, padding: '6px 10px', fontSize: 13, fontFamily: 'monospace' }}
                        />
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {tab === 'input'
                        ? (isLikelyImageModel(model)
                            ? <span style={{ color: 'var(--muted)' }}>× 倍率（按张计费模型）</span>
                            : `$${((modelRatio[model] || 0) * 0.002).toFixed(4)}/1K tokens`)
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

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认从列表移除"
        description={
          <>
            将从倍率配置中移除「<strong>{deleteTarget}</strong>」（输入 + 补全）。
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              移除后需点击「保存全部」才会写入后端。在此之前可重新「添加模型」恢复。
            </div>
          </>
        }
        confirmLabel="移除"
        confirmVariant="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
