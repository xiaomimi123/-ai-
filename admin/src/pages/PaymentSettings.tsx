import { useEffect, useState } from 'react'
import { Save, CreditCard, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

export default function PaymentSettingsPage() {
  const [payConfig, setPayConfig] = useState({
    alipay_enabled: false,
    alipay_app_id: '',
    alipay_private_key: '',
    alipay_public_key: '',
    redeem_enabled: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    http.get('/api/admin/lingjing/pay/config').then(r => {
      if (r.data.success) setPayConfig(r.data.data)
    }).catch(() => toast.error('加载配置失败'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await http.put('/api/admin/lingjing/pay/config', {
        alipay_enabled: payConfig.alipay_enabled,
        alipay_app_id: payConfig.alipay_app_id,
        alipay_private_key: payConfig.alipay_private_key || '',
        alipay_public_key: payConfig.alipay_public_key || '',
        redeem_enabled: payConfig.redeem_enabled,
      })
      if (res.data.success) toast.success('支付配置已保存')
      else toast.error(res.data.message || '保存失败')
    } catch { toast.error('网络错误') } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={22} color="var(--primary)" />支付配置
        </h1>
        <p className="page-desc">配置在线支付方式和充值码开关</p>
      </div>

      {/* 状态提示 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderRadius: 10, marginBottom: 24,
        background: payConfig.alipay_enabled ? '#dcfce7' : '#fef3c7',
        border: `1px solid ${payConfig.alipay_enabled ? '#86efac' : '#fcd34d'}`,
      }}>
        {payConfig.alipay_enabled ? <CheckCircle size={18} color="#16a34a" /> : <AlertCircle size={18} color="#d97706" />}
        <span style={{ fontSize: 14, color: payConfig.alipay_enabled ? '#166534' : '#92400e' }}>
          {payConfig.alipay_enabled ? '支付宝已开启，用户可以在线充值' : '支付宝未开启，用户只能使用充值码兑换额度'}
        </span>
      </div>

      <div style={{ maxWidth: 640 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 20, fontSize: 16 }}>支付方式</h3>

          {/* 充值码开关 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>充值码兑换</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>允许用户使用充值码兑换额度</div>
            </div>
            <input type="checkbox" checked={payConfig.redeem_enabled} onChange={e => setPayConfig(p => ({ ...p, redeem_enabled: e.target.checked }))} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
          </div>

          {/* 支付宝开关 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', marginBottom: payConfig.alipay_enabled ? 20 : 0 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>支付宝电脑网站支付</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>用户通过支付宝扫码或登录支付</div>
            </div>
            <input type="checkbox" checked={payConfig.alipay_enabled} onChange={e => setPayConfig(p => ({ ...p, alipay_enabled: e.target.checked }))} style={{ width: 'auto', accentColor: '#1677ff' }} />
          </div>

          {/* 支付宝密钥配置 */}
          {payConfig.alipay_enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">App ID</label>
                <input value={payConfig.alipay_app_id} onChange={e => setPayConfig(p => ({ ...p, alipay_app_id: e.target.value }))} placeholder="2021006146617774" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">应用私钥（RSA2）<span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>已配置则留空不修改</span></label>
                <textarea rows={3} value={payConfig.alipay_private_key} onChange={e => setPayConfig(p => ({ ...p, alipay_private_key: e.target.value }))} placeholder="粘贴应用私钥，留空则不修改已保存的密钥" style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">支付宝公钥 <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>已配置则留空不修改</span></label>
                <textarea rows={3} value={payConfig.alipay_public_key} onChange={e => setPayConfig(p => ({ ...p, alipay_public_key: e.target.value }))} placeholder="粘贴支付宝公钥，留空则不修改" style={{ resize: 'vertical' }} />
              </div>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1e40af' }}>
                回调地址：<code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>https://aitoken.homes/api/lingjing/pay/notify/alipay</code>
                <br />请在支付宝开放平台配置此回调地址
              </div>
            </div>
          )}
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '12px 32px' }}>
          <Save size={16}/>{saving ? '保存中...' : '保存支付配置'}
        </button>
      </div>
    </div>
  )
}
