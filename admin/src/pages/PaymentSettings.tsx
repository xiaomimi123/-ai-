import { useEffect, useState } from 'react'
import { Save, CreditCard, AlertCircle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

interface PayConfig {
  // 支付宝
  epay_enabled: boolean
  epay_url: string
  epay_pid: string
  epay_key: string
  epay_key_configured: boolean
  // 微信
  wx_enabled: boolean
  wx_url: string
  wx_pid: string
  wx_key: string
  wx_key_configured: boolean
  // 其它
  redeem_enabled: boolean
}

const defaultConfig: PayConfig = {
  epay_enabled: false, epay_url: '', epay_pid: '', epay_key: '', epay_key_configured: false,
  wx_enabled: false, wx_url: '', wx_pid: '', wx_key: '', wx_key_configured: false,
  redeem_enabled: true,
}

export default function PaymentSettingsPage() {
  const [payConfig, setPayConfig] = useState<PayConfig>(defaultConfig)
  const [saving, setSaving] = useState(false)

  const loadConfig = () => {
    http.get('/api/admin/lingjing/pay/config').then(r => {
      if (r.data.success) setPayConfig(p => ({ ...p, ...r.data.data }))
    }).catch(() => toast.error('加载配置失败'))
  }

  useEffect(loadConfig, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await http.put('/api/admin/lingjing/pay/config', {
        epay_enabled: payConfig.epay_enabled,
        epay_url: payConfig.epay_url,
        epay_pid: payConfig.epay_pid,
        epay_key: payConfig.epay_key || '',
        wx_enabled: payConfig.wx_enabled,
        wx_url: payConfig.wx_url,
        wx_pid: payConfig.wx_pid,
        wx_key: payConfig.wx_key || '',
        redeem_enabled: payConfig.redeem_enabled,
      })
      if (res.data.success) {
        toast.success('支付配置已保存')
        setPayConfig(p => ({ ...p, epay_key: '', wx_key: '' }))
        loadConfig()
      } else toast.error(res.data.message || '保存失败')
    } catch { toast.error('网络错误') } finally { setSaving(false) }
  }

  const anyEnabled = payConfig.epay_enabled || payConfig.wx_enabled

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={22} color="var(--primary)" />支付配置
        </h1>
        <p className="page-desc">虎皮椒协议：支付宝、微信两个渠道独立配置，各自的 AppID / AppSecret 互不影响</p>
      </div>

      {/* 状态提示 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderRadius: 10, marginBottom: 24,
        background: anyEnabled ? '#dcfce7' : '#fef3c7',
        border: `1px solid ${anyEnabled ? '#86efac' : '#fcd34d'}`,
      }}>
        {anyEnabled ? <CheckCircle size={18} color="#16a34a" /> : <AlertCircle size={18} color="#d97706" />}
        <span style={{ fontSize: 14, color: anyEnabled ? '#166534' : '#92400e' }}>
          {anyEnabled
            ? `已开启：${[payConfig.epay_enabled && '支付宝', payConfig.wx_enabled && '微信'].filter(Boolean).join(' + ')}`
            : '所有支付渠道未开启，用户只能使用充值码兑换额度'}
        </span>
      </div>

      <div style={{ maxWidth: 720 }}>
        {/* 充值码开关 */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>充值码兑换</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>允许用户使用充值码兑换额度</div>
            </div>
            <input type="checkbox" checked={payConfig.redeem_enabled} onChange={e => setPayConfig(p => ({ ...p, redeem_enabled: e.target.checked }))} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
          </div>
        </div>

        {/* 支付宝渠道 */}
        <ChannelCard
          title="支付宝"
          desc="虎皮椒后台创建的支付宝应用"
          enabled={payConfig.epay_enabled}
          onToggle={v => setPayConfig(p => ({ ...p, epay_enabled: v }))}
          url={payConfig.epay_url}
          onUrlChange={v => setPayConfig(p => ({ ...p, epay_url: v }))}
          pid={payConfig.epay_pid}
          onPidChange={v => setPayConfig(p => ({ ...p, epay_pid: v }))}
          key_={payConfig.epay_key}
          onKeyChange={v => setPayConfig(p => ({ ...p, epay_key: v }))}
          keyConfigured={payConfig.epay_key_configured}
        />

        {/* 微信渠道 */}
        <ChannelCard
          title="微信支付"
          desc="虎皮椒后台创建的微信应用（未申请下来时保持关闭，前端用户看不到此渠道）"
          enabled={payConfig.wx_enabled}
          onToggle={v => setPayConfig(p => ({ ...p, wx_enabled: v }))}
          url={payConfig.wx_url}
          onUrlChange={v => setPayConfig(p => ({ ...p, wx_url: v }))}
          pid={payConfig.wx_pid}
          onPidChange={v => setPayConfig(p => ({ ...p, wx_pid: v }))}
          key_={payConfig.wx_key}
          onKeyChange={v => setPayConfig(p => ({ ...p, wx_key: v }))}
          keyConfigured={payConfig.wx_key_configured}
        />

        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '12px 32px' }}>
          <Save size={16}/>{saving ? '保存中...' : '保存支付配置'}
        </button>
      </div>
    </div>
  )
}

// 单个渠道的配置卡片（支付宝 / 微信共用）
function ChannelCard(props: {
  title: string
  desc: string
  enabled: boolean
  onToggle: (v: boolean) => void
  url: string
  onUrlChange: (v: string) => void
  pid: string
  onPidChange: (v: string) => void
  key_: string
  onKeyChange: (v: string) => void
  keyConfigured: boolean
}) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: props.enabled ? 16 : 0 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{props.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{props.desc}</div>
        </div>
        <input type="checkbox" checked={props.enabled} onChange={e => props.onToggle(e.target.checked)} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
      </div>

      {props.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 14, borderTop: '0.5px solid var(--border)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">下单接口地址</label>
            <input value={props.url} onChange={e => props.onUrlChange(e.target.value)} placeholder="https://api.xunhupay.com" />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              只填域名即可，后端自动拼 <code>/payment/do.html</code>。留空自动使用 <code>https://api.xunhupay.com</code>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">AppID</label>
            <input value={props.pid} onChange={e => props.onPidChange(e.target.value)} placeholder="虎皮椒应用的 AppID" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              AppSecret
              {props.keyConfigured && <span style={{ color: 'var(--accent, #2ECC71)', marginLeft: 8, fontWeight: 400 }}>已配置 ✓</span>}
            </label>
            <input
              type="password"
              value={props.key_}
              onChange={e => props.onKeyChange(e.target.value)}
              placeholder={props.keyConfigured ? '留空则保持原值' : '虎皮椒应用的 AppSecret'}
            />
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
            <div style={{ marginBottom: 4 }}><strong>异步回调地址</strong>（填到虎皮椒后台）：</div>
            <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: 4, display: 'inline-block', wordBreak: 'break-all' }}>
              https://aitoken.homes/api/lingjing/pay/notify/hupijiao
            </code>
          </div>
        </div>
      )}
    </div>
  )
}
