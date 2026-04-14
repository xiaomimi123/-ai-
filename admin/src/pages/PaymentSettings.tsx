import { useEffect, useState } from 'react'
import { Save, CreditCard, AlertCircle, CheckCircle } from 'lucide-react'
import { optionApi } from '../api'
import toast from 'react-hot-toast'

export default function PaymentSettingsPage() {
  const [form, setForm] = useState({
    EpayAddress: '',
    EpayId: '',
    EpayKey: '',
    EpayPrice: '7.3',
    EpayMinTopUp: '1',
  })
  const [saving, setSaving] = useState(false)
  const [, setLoaded] = useState(false)

  useEffect(() => {
    optionApi.get().then(r => {
      if (r.data.success) {
        const opts = r.data.data as Record<string, string>
        setForm({
          EpayAddress: opts.EpayAddress || '',
          EpayId: opts.EpayId || '',
          EpayKey: opts.EpayKey || '',
          EpayPrice: opts.EpayPrice || '7.3',
          EpayMinTopUp: opts.EpayMinTopUp || '1',
        })
        setLoaded(true)
      }
    }).catch(() => toast.error('加载配置失败'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // 逐个保存（One API 的 option API 每次更新一个 key）
      for (const [key, value] of Object.entries(form)) {
        const r = await optionApi.update({ key, value })
        if (!r.data.success) {
          toast.error(`保存 ${key} 失败: ${r.data.message}`)
          setSaving(false)
          return
        }
      }
      toast.success('支付配置已保存，立即生效')
    } catch { toast.error('网络错误') } finally { setSaving(false) }
  }

  const isConfigured = form.EpayAddress && form.EpayId && form.EpayKey

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={22} color="var(--primary)" />支付配置
        </h1>
        <p className="page-desc">配置在线支付网关，支持易支付（聚合支付宝/微信）</p>
      </div>

      {/* Status Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderRadius: 10, marginBottom: 24,
        background: isConfigured ? '#dcfce7' : '#fef3c7',
        border: `1px solid ${isConfigured ? '#86efac' : '#fcd34d'}`,
      }}>
        {isConfigured ? <CheckCircle size={18} color="#16a34a" /> : <AlertCircle size={18} color="#d97706" />}
        <span style={{ fontSize: 14, color: isConfigured ? '#166534' : '#92400e' }}>
          {isConfigured ? '支付已配置，用户可以在线充值' : '支付未配置，用户只能使用充值码兑换额度'}
        </span>
      </div>

      <div style={{ maxWidth: 640 }}>
        {/* 易支付配置 */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">易支付 (Epay) 配置</span>
          </div>

          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            易支付是聚合支付网关，支持支付宝、微信、QQ钱包等多种支付方式。<br />
            需先在易支付平台注册商户并获取配置信息。
          </div>

          <div className="form-group">
            <label className="form-label">支付网关地址</label>
            <input
              placeholder="https://pay.example.com"
              value={form.EpayAddress}
              onChange={e => setForm(p => ({ ...p, EpayAddress: e.target.value }))}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>易支付服务商提供的 API 地址</div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">商户 ID</label>
              <input
                placeholder="10001"
                value={form.EpayId}
                onChange={e => setForm(p => ({ ...p, EpayId: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">商户密钥</label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.EpayKey}
                onChange={e => setForm(p => ({ ...p, EpayKey: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* 计费设置 */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">计费设置</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">汇率 (1 USD = ? CNY)</label>
              <input
                type="number"
                step="0.1"
                placeholder="7.3"
                value={form.EpayPrice}
                onChange={e => setForm(p => ({ ...p, EpayPrice: e.target.value }))}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                用户充值 $1 需支付 ¥{form.EpayPrice || '7.3'}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">最低充值 (USD)</label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={form.EpayMinTopUp}
                onChange={e => setForm(p => ({ ...p, EpayMinTopUp: e.target.value }))}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                最低 ${form.EpayMinTopUp || '1'}，即 ¥{(parseFloat(form.EpayMinTopUp || '1') * parseFloat(form.EpayPrice || '7.3')).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* 费用预览 */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">充值金额预览</span>
          </div>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead><tr><th>额度 (USD)</th><th>用户支付 (CNY)</th><th>获得额度</th></tr></thead>
              <tbody>
                {[1, 5, 10, 50, 100, 500].map(amount => {
                  const price = parseFloat(form.EpayPrice || '7.3')
                  return (
                    <tr key={amount}>
                      <td style={{ fontWeight: 600 }}>${amount}</td>
                      <td style={{ color: 'var(--primary)', fontWeight: 600 }}>¥{(amount * price).toFixed(2)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{(amount * 500000).toLocaleString()} 额度</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '12px 32px' }}>
          <Save size={16}/>{saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}
