import { useEffect, useState } from 'react'

export interface LedgerForm {
  occur_date: string
  upstream: string
  type: 'expense' | 'refund'
  amount_usd: string // string state per feedback_react_number_input_string_state
  remark: string
}

const COMMON_UPSTREAMS = ['OpenAI', 'Anthropic', 'ApiMart', 'Jimeng', 'SiliconFlow', 'DeepSeek', 'Doubao', 'Cloudflare']

interface Props {
  open: boolean
  editing: { id: number; data: LedgerForm } | null // null = create mode
  onClose: () => void
  onSubmit: (form: LedgerForm) => Promise<void>
}

export function FinanceRecordModal({ open, editing, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<LedgerForm>({
    occur_date: new Date().toISOString().slice(0, 10),
    upstream: '',
    type: 'expense',
    amount_usd: '',
    remark: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm(editing.data)
      } else {
        setForm({
          occur_date: new Date().toISOString().slice(0, 10),
          upstream: '',
          type: 'expense',
          amount_usd: '',
          remark: '',
        })
      }
    }
  }, [open, editing])

  if (!open) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSubmit(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{editing ? `编辑记账 #${editing.id}` : '新增记账'}</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">发生日期 *</label>
            <input
              type="date"
              value={form.occur_date}
              onChange={e => setForm(p => ({ ...p, occur_date: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">类型 *</label>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value as 'expense' | 'refund' }))}
            >
              <option value="expense">支出 / 充值给上游</option>
              <option value="refund">退款 / 上游退给我</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">上游 *</label>
          <input
            list="finance-upstream-list"
            placeholder="OpenAI / Anthropic / ApiMart / ..."
            value={form.upstream}
            onChange={e => setForm(p => ({ ...p, upstream: e.target.value }))}
            autoFocus={!editing}
          />
          <datalist id="finance-upstream-list">
            {COMMON_UPSTREAMS.map(u => <option key={u} value={u}/>)}
          </datalist>
          <div className="form-hint">自由文本，常见上游已自动补全提示</div>
        </div>

        <div className="form-group">
          <label className="form-label">金额 ($) *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="例：50.00"
            value={form.amount_usd}
            onChange={e => setForm(p => ({ ...p, amount_usd: e.target.value }))}
          />
          <div className="form-hint">USD 金额，正数（type=退款时也填正数，后端自动反号）</div>
        </div>

        <div className="form-group">
          <label className="form-label">备注</label>
          <textarea
            rows={2}
            placeholder="可选，例：5/15 月度充值"
            value={form.remark}
            onChange={e => setForm(p => ({ ...p, remark: e.target.value }))}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : (editing ? '保存' : '新增')}
          </button>
        </div>
      </div>
    </div>
  )
}
