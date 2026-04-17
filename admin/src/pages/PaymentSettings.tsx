import { useEffect, useState } from 'react'
import { Save, CreditCard, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

export default function PaymentSettingsPage() {
  const [payConfig, setPayConfig] = useState({
    epay_enabled: false,
    epay_url: '',
    epay_pid: '',
    epay_key: '',
    epay_key_configured: false,
    redeem_enabled: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    http.get('/api/admin/lingjing/pay/config').then(r => {
      if (r.data.success) setPayConfig(p => ({ ...p, ...r.data.data }))
    }).catch(() => toast.error('加载配置失败'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await http.put('/api/admin/lingjing/pay/config', {
        epay_enabled: payConfig.epay_enabled,
        epay_url: payConfig.epay_url,
        epay_pid: payConfig.epay_pid,
        epay_key: payConfig.epay_key || '', // 空字符串 = 不修改
        redeem_enabled: payConfig.redeem_enabled,
      })
      if (res.data.success) {
        toast.success('支付配置已保存')
        // 保存成功后清空 key 输入框，重拉一次状态
        setPayConfig(p => ({ ...p, epay_key: '' }))
        http.get('/api/admin/lingjing/pay/config').then(r => {
          if (r.data.success) setPayConfig(p => ({ ...p, ...r.data.data }))
        })
      } else toast.error(res.data.message || '保存失败')
    } catch { toast.error('网络错误') } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={22} color="var(--primary)" />支付配置
        </h1>
        <p className="page-desc">配置虎皮椒支付网关与充值码开关</p>
      </div>

      {/* 状态提示 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderRadius: 10, marginBottom: 24,
        background: payConfig.epay_enabled ? '#dcfce7' : '#fef3c7',
        border: `1px solid ${payConfig.epay_enabled ? '#86efac' : '#fcd34d'}`,
      }}>
        {payConfig.epay_enabled ? <CheckCircle size={18} color="#16a34a" /> : <AlertCircle size={18} color="#d97706" />}
        <span style={{ fontSize: 14, color: payConfig.epay_enabled ? '#166534' : '#92400e' }}>
          {payConfig.epay_enabled ? '虎皮椒已开启，用户可在线充值' : '虎皮椒未开启，用户只能使用充值码兑换额度'}
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

          {/* 虎皮椒开关 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', marginBottom: payConfig.epay_enabled ? 20 : 0 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>虎皮椒支付</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>一个 AppID 对应一种渠道（微信 或 支付宝），以虎皮椒后台应用为准</div>
            </div>
            <input type="checkbox" checked={payConfig.epay_enabled} onChange={e => setPayConfig(p => ({ ...p, epay_enabled: e.target.checked }))} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
          </div>

          {/* 虎皮椒配置 */}
          {payConfig.epay_enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">下单接口地址</label>
                <input value={payConfig.epay_url} onChange={e => setPayConfig(p => ({ ...p, epay_url: e.target.value }))} placeholder="https://api.xunhupay.com" />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  官方网关：<code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>https://api.xunhupay.com</code>
                  （留空自动使用）。后端会自动拼接 <code>/payment/do.html</code>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">AppID</label>
                <input value={payConfig.epay_pid} onChange={e => setPayConfig(p => ({ ...p, epay_pid: e.target.value }))} placeholder="虎皮椒应用的 AppID" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  AppSecret
                  {payConfig.epay_key_configured && <span style={{ color: 'var(--accent, #2ECC71)', marginLeft: 8, fontWeight: 400 }}>已配置 ✓</span>}
                </label>
                <input
                  type="password"
                  value={payConfig.epay_key}
                  onChange={e => setPayConfig(p => ({ ...p, epay_key: e.target.value }))}
                  placeholder={payConfig.epay_key_configured ? '留空则保持原值' : '虎皮椒应用的 AppSecret'}
                />
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
                <div style={{ marginBottom: 4 }}>
                  <strong>异步回调地址</strong>（填到虎皮椒后台）：
                </div>
                <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: 4, display: 'inline-block', wordBreak: 'break-all' }}>
                  https://aitoken.homes/api/lingjing/pay/notify/hupijiao
                </code>
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
