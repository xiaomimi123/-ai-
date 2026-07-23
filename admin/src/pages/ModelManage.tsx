import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Save, Eye, EyeOff, Radio, Sliders, Trash2, ExternalLink, CheckCircle, Globe } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { SearchInput } from '../components/SearchInput'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyCard } from '../components/EmptyCard'
import { runtimeConfig } from '../runtimeConfig'

const http = axios.create({ baseURL: runtimeConfig.apiBaseUrl, withCredentials: true, timeout: 15000 })

// 图像模型识别：与 ModelPrices.tsx / frontend modelPricing.ts 保持一致
// 优先按 tags 判断；若该模型未在「模型价格」页配置 tags（空字符串），用模型名兜底
const IMAGE_TAGS = new Set(['生图', '画图', '图像', 'image', 'images', '图片', '文生图'])
function isImageModel(tags?: string | null, modelName?: string): boolean {
  if (tags) {
    const hit = tags.split(',').map(t => t.trim()).some(t => IMAGE_TAGS.has(t))
    if (hit) return true
  }
  if (!modelName) return false
  const lower = modelName.toLowerCase()
  return lower.includes('image')
      || lower.includes('imagen')
      || lower.includes('dall-e')
      || lower.includes('nano-banana')
      || lower.includes('flux')
}

interface ModelInfo {
  model_name: string
  input_ratio: number
  completion_ratio: number
  input_price: number
  output_price: number
  provider: string
  category: string
  description: string
  tags?: string
  is_visible: number
  price_id: number
  channel_count: number
}

export default function ModelManagePage() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [search, setSearch] = useState('')
  const [editModel, setEditModel] = useState<ModelInfo | null>(null)
  // 倍率输入框用 string 保存编辑中文本，避免 `value={x.input_ratio || ''}` 把 "0." 渲染成 ""
  // 也避免 onChange 里 parseFloat("0.") = 0 让用户没法连续敲小数
  const [ratioStr, setRatioStr] = useState({ input: '', completion: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const [removeTarget, setRemoveTarget] = useState<ModelInfo | null>(null)

  const load = () => {
    setLoading(true)
    http.get('/api/admin/lingjing/models').then(r => {
      if (r.data.success) setModels(r.data.data || [])
    }).catch(() => toast.error('加载失败')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // 从模型价格页跳转过来：?model=xxx 高亮目标行并滚动过去
  useEffect(() => {
    const target = searchParams.get('model')
    if (!target || models.length === 0) return
    const el = rowRefs.current[target]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.background = 'var(--accent-light, #dbeafe)'
    el.style.transition = 'background 1.5s ease'
    const t = setTimeout(() => { if (el) el.style.background = '' }, 1500)
    return () => clearTimeout(t)
  }, [models, searchParams])

  // 打开编辑时把当前倍率"转字符串"，作为输入框初始值
  const openEdit = (m: ModelInfo) => {
    setRatioStr({
      input: m.input_ratio ? String(m.input_ratio) : '',
      completion: m.completion_ratio ? String(m.completion_ratio) : '',
    })
    setEditModel({ ...m })
  }

  const closeEdit = () => { setEditModel(null); setRatioStr({ input: '', completion: '' }) }

  const handleSave = async () => {
    if (!editModel) return
    setSaving(true)
    try {
      // 后端 AdminUpdateModel 是全量覆盖 —— 必须把 editModel 里的完整字段透传回去
      // （包括 input_price/output_price/provider/description/is_visible 这些展示字段的"原值"）
      // 否则后端会把没传的字段当成零值写回，把模型广场数据清空
      // 倍率从 ratioStr 解析（用户编辑时存的是 string，保存时一次性转 number）
      const payload = {
        ...editModel,
        input_ratio: parseFloat(ratioStr.input) || 0,
        completion_ratio: parseFloat(ratioStr.completion) || 0,
      }
      const r = await http.put('/api/admin/lingjing/models', payload)
      if (r.data.success) {
        toast.success(`${editModel.model_name} 倍率已更新`)
        closeEdit()
        load()
      } else toast.error(r.data.message)
    } catch { toast.error('保存失败') } finally { setSaving(false) }
  }

  const handleRemove = (m: ModelInfo) => {
    setRemoveTarget(m)
  }

  const doRemove = async () => {
    if (!removeTarget) return
    try {
      const r = await http.delete(`/api/admin/lingjing/models?model_name=${encodeURIComponent(removeTarget.model_name)}`)
      if (r.data.success) {
        toast.success(r.data.message || '已移除')
        load()
      } else {
        toast.error(r.data.message || '移除失败')
      }
    } catch { toast.error('移除失败') } finally { setRemoveTarget(null) }
  }

  const gotoPriceEditor = (modelName: string) => {
    navigate(`/model-prices?model=${encodeURIComponent(modelName)}`)
  }

  const filtered = search
    ? models.filter(m => m.model_name.toLowerCase().includes(search.toLowerCase()) || m.provider?.toLowerCase().includes(search.toLowerCase()))
    : models

  const activeModels = useMemo(() => models.filter(m => m.channel_count > 0), [models])
  const visibleModels = useMemo(() => models.filter(m => m.is_visible === 1), [models])
  const topProviders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of models) {
      if (!m.provider) continue
      counts.set(m.provider, (counts.get(m.provider) || 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [models])

  return (
    <div>
      <PageHeader
        title="模型管理"
        description="专注计费倍率和渠道关联 · 展示相关（图标/描述/标签）请去「模型价格」页"
        icon={Sliders}
      />

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatCard label="全部模型" value={models.length}        icon={Sliders}      color="info"    />
        <StatCard label="有渠道"   value={activeModels.length}  icon={CheckCircle}  color="success" />
        <StatCard label="前台可见" value={visibleModels.length} icon={Eye}          color="warning" />
        {topProviders.map(([provider, count]) => (
          <StatCard key={provider} label={provider} value={count} icon={Globe} color="accent" />
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="搜索模型名称或供应商..."
          width={360}
        />
      </div>

      {/* Info */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#0369a1' }}>
        <strong>职责分工：</strong>本页只管<strong>计费倍率</strong>（实际扣费）。模型的图标、描述、标签、可见性等<strong>展示字段</strong>请在右侧「调展示」按钮跳转的「模型价格」页管理。
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
        <table>
          <thead>
            <tr>
              <th>模型名称</th>
              <th>渠道数</th>
              <th>输入倍率</th>
              <th>补全倍率</th>
              <th>展示价格</th>
              <th>供应商</th>
              <th>前台可见</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 0 }}>
                <EmptyCard
                  icon={Sliders}
                  title={loading ? '加载中...' : search ? '未找到匹配模型' : '暂无模型'}
                  description={search ? '试试别的关键字' : (!loading ? '请先在渠道管理中添加渠道' : '')}
                />
              </td></tr>
            ) : filtered.map(m => {
              return (
                <tr key={m.model_name} ref={el => { rowRefs.current[m.model_name] = el }} style={{ background: m.channel_count === 0 ? 'var(--warning-bg)' : undefined }}>
                  <td>
                    <strong style={{ fontSize: 13 }}>{m.model_name}</strong>
                    {m.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.description}</div>}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Radio size={12} color={m.channel_count > 0 ? 'var(--success)' : 'var(--muted)'} />
                      <span style={{ fontWeight: 600, color: m.channel_count > 0 ? 'var(--success)' : 'var(--muted)' }}>{m.channel_count}</span>
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{m.input_ratio || <span style={{ color: 'var(--muted)' }}>未设</span>}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {isImageModel(m.tags, m.model_name)
                      ? <span style={{ color: 'var(--muted)' }}>—</span>
                      : (m.completion_ratio || <span style={{ color: 'var(--muted)' }}>1x</span>)}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {m.input_price > 0 ? (
                      isImageModel(m.tags, m.model_name)
                        ? <span style={{ color: 'var(--success)' }}>${m.input_price.toFixed(4)}/张</span>
                        : <span><span style={{ color: 'var(--success)' }}>${m.input_price}</span> / <span style={{ color: 'var(--primary)' }}>${m.output_price}</span> <span style={{ color: 'var(--muted)', fontSize: 11 }}>/M</span></span>
                    ) : <span style={{ color: 'var(--muted)' }}>未设</span>}
                  </td>
                  <td>{m.provider ? <span className="badge badge-blue">{m.provider}</span> : <span style={{ color: 'var(--muted)' }}>-</span>}</td>
                  <td>
                    {m.is_visible ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}><Eye size={14}/>可见</span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}><EyeOff size={14}/>隐藏</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => openEdit(m)} title="调整计费倍率">
                        调倍率
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => gotoPriceEditor(m.model_name)}
                        title="跳转到模型价格页修改图标/描述/展示价等"
                        style={{ padding: '4px 10px' }}
                      >
                        <ExternalLink size={12} style={{ marginRight: 2 }}/>调展示
                      </button>
                      {m.channel_count === 0 && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleRemove(m)}
                          title="无渠道的僵尸条目，点击清除残留配置"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '4px 10px' }}
                        >
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        title="确认移除僵尸模型"
        description={
          <>
            将清除「<strong>{removeTarget?.model_name}</strong>」的定价配置和残留 ability 记录。
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              此操作仅对渠道数=0 的「僵尸模型」有效，不影响正在使用的渠道。
            </div>
          </>
        }
        confirmLabel="移除"
        confirmVariant="danger"
        onConfirm={doRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Edit Modal — 只改倍率 */}
      {editModel && (() => {
        const isImg = isImageModel(editModel.tags, editModel.model_name)
        // 倍率换算预览实时跟随输入框 string；空串当 0 处理
        const inputRatioNum = parseFloat(ratioStr.input) || 0
        const completionRatioNum = parseFloat(ratioStr.completion) || 0
        return (
          <div className="modal-overlay" onClick={closeEdit}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
              <div className="modal-title">调整倍率 — {editModel.model_name}</div>

              {/* 计费倍率（可编辑） */}
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  计费倍率（真实扣费）{isImg && <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>· 图像模型按张计费</span>}
                </h4>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{isImg ? '计费倍率' : '输入倍率'}</label>
                    <input
                      type="number" step="0.001" placeholder="例：0.14"
                      value={ratioStr.input}
                      onChange={e => setRatioStr(s => ({ ...s, input: e.target.value }))}
                    />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      {isImg ? (
                        <>倍率 × input_price ($/张) → 当前: <strong>${(inputRatioNum * (editModel.input_price || 0)).toFixed(4)}/张</strong></>
                      ) : (
                        <>倍率 × 2 = $/M input → 当前: <strong>${(inputRatioNum * 2).toFixed(3)}/M</strong></>
                      )}
                    </div>
                  </div>
                  {!isImg && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">补全倍率</label>
                      <input
                        type="number" step="0.01" placeholder="例：1.5"
                        value={ratioStr.completion}
                        onChange={e => setRatioStr(s => ({ ...s, completion: e.target.value }))}
                      />
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        输出 / 输入 比 → 输出: <strong>${(inputRatioNum * (completionRatioNum || 1) * 2).toFixed(3)}/M</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 前台展示（只读+跳转） */}
              <div style={{ background: '#fafafa', border: '1px dashed var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>前台展示（只读）</h4>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { closeEdit(); gotoPriceEditor(editModel.model_name) }}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    <ExternalLink size={12} style={{ marginRight: 4 }}/>去「模型价格」页修改
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{isImg ? '展示单价' : '展示输入价'}</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {editModel.input_price
                        ? (isImg ? `$${editModel.input_price.toFixed(4)}/张` : `$${editModel.input_price}/M`)
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>展示输出价</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {isImg
                        ? <span style={{ color: 'var(--muted)' }}>—</span>
                        : (editModel.output_price ? `$${editModel.output_price}/M` : '—')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>供应商</div>
                    <div>{editModel.provider || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>前台可见</div>
                    <div>{editModel.is_visible ? '是' : '否'}</div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn btn-outline" onClick={closeEdit}>取消</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  <Save size={14}/>{saving ? '保存中...' : '保存倍率'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
