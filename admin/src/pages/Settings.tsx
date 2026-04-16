import { useEffect, useState } from 'react'
import { Save, Globe, UserPlus, Shield, Mail, Loader2, MessageCircle } from 'lucide-react'
import { optionApi, lingjingConfigApi } from '../api'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [opts, setOpts] = useState<Record<string, string>>({})
  const [csConfig, setCsConfig] = useState({
    customer_service_enabled: 'false',
    customer_service_wechat: '',
    customer_service_qrcode: '',
    customer_service_text: '添加微信，获取帮助',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    optionApi.get().then(r => {
      // 后端返回数组 [{key, value}, ...]，前端用作 map 需要先转换
      if (r.data.success) {
        const arr: Array<{ key: string; value: string }> = r.data.data || []
        const map: Record<string, string> = {}
        for (const item of arr) map[item.key] = item.value
        setOpts(map)
      }
    }).catch(() => toast.error('加载配置失败')).finally(() => setLoading(false))
    lingjingConfigApi.get().then(r => {
      if (r.data.success) {
        const d = r.data.data
        setCsConfig({
          customer_service_enabled: d.customer_service_enabled ? 'true' : 'false',
          customer_service_wechat: d.customer_service_wechat || '',
          customer_service_qrcode: d.customer_service_qrcode || '',
          customer_service_text: d.customer_service_text || '添加微信，获取帮助',
        })
      }
    }).catch(() => {})
  }, [])

  const saveOption = async (key: string, value: string) => {
    try {
      const r = await optionApi.update({ key, value })
      if (r.data.success) return true
      toast.error(`保存 ${key} 失败`)
      return false
    } catch { toast.error('网络错误'); return false }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    const keys = [
      'SystemName', 'ServerAddress', 'Footer',
      'RegisterEnabled', 'PasswordRegisterEnabled', 'EmailVerificationEnabled',
      'TurnstileCheckEnabled', 'TurnstileSiteKey', 'TurnstileSecretKey',
      'QuotaForNewUser',
      'SMTPServer', 'SMTPPort', 'SMTPAccount', 'SMTPFrom', 'SMTPToken',
    ]
    let allOk = true
    for (const key of keys) {
      if (opts[key] !== undefined) {
        const ok = await saveOption(key, opts[key])
        if (!ok) allOk = false
      }
    }
    // 保存客服配置
    try {
      const csRes = await lingjingConfigApi.update(csConfig)
      if (!csRes.data.success) allOk = false
    } catch { allOk = false }

    if (allOk) toast.success('所有设置已保存')
    setSaving(false)
  }

  const setOpt = (key: string, value: string) => {
    setOpts(prev => ({ ...prev, [key]: value }))
  }

  const boolVal = (key: string) => opts[key] === 'true'
  const setBool = (key: string, val: boolean) => setOpt(key, val ? 'true' : 'false')

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /><style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style></div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">系统设置</h1>
          <p className="page-desc">所有配置修改后需点击保存才会生效</p>
        </div>
        <button className="btn btn-primary" onClick={handleSaveAll} disabled={saving} style={{ padding: '10px 28px' }}>
          <Save size={16}/>{saving ? '保存中...' : '保存全部设置'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 20, maxWidth: 720 }}>

        {/* 基本设置 */}
        <div className="card">
          <div className="card-header"><span className="card-title"><Globe size={16} color="var(--primary)"/>基本设置</span></div>
          <div className="form-group">
            <label className="form-label">平台名称</label>
            <input value={opts.SystemName || ''} onChange={e => setOpt('SystemName', e.target.value)} placeholder="灵镜AI" />
          </div>
          <div className="form-group">
            <label className="form-label">服务器地址</label>
            <input value={opts.ServerAddress || ''} onChange={e => setOpt('ServerAddress', e.target.value)} placeholder="https://aitoken.homes" />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>用于生成邀请链接和支付回调地址</div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">页脚 HTML</label>
            <input value={opts.Footer || ''} onChange={e => setOpt('Footer', e.target.value)} placeholder="自定义页脚文字" />
          </div>
        </div>

        {/* 注册设置 */}
        <div className="card">
          <div className="card-header"><span className="card-title"><UserPlus size={16} color="var(--success)"/>注册设置</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>开放注册</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>允许新用户自行注册账号</div>
              </div>
              <input type="checkbox" checked={boolVal('RegisterEnabled')} onChange={e => setBool('RegisterEnabled', e.target.checked)} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>邮箱验证</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>注册时要求验证邮箱（需先配置 SMTP）</div>
              </div>
              <input type="checkbox" checked={boolVal('EmailVerificationEnabled')} onChange={e => setBool('EmailVerificationEnabled', e.target.checked)} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
            </label>
          </div>
          <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="form-label">新用户初始额度</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" value={opts.QuotaForNewUser || '0'} onChange={e => setOpt('QuotaForNewUser', e.target.value)} style={{ width: 180 }} />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>（内部额度单位，500000 = $1）</span>
            </div>
          </div>
        </div>

        {/* 人机验证 */}
        <div className="card">
          <div className="card-header"><span className="card-title"><Shield size={16} color="var(--warning)"/>人机验证（Turnstile）</span></div>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
            Cloudflare Turnstile 是免费的人机验证服务，可有效防止机器人批量注册。
            <a href="https://dash.cloudflare.com/sign-up?to=/:account/turnstile" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', marginLeft: 4 }}>前往申请 →</a>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>启用 Turnstile 验证</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>注册和重置密码时要求通过人机验证</div>
            </div>
            <input type="checkbox" checked={boolVal('TurnstileCheckEnabled')} onChange={e => setBool('TurnstileCheckEnabled', e.target.checked)} style={{ width: 'auto', accentColor: 'var(--primary)' }} />
          </label>
          {boolVal('TurnstileCheckEnabled') && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Site Key</label>
                <input value={opts.TurnstileSiteKey || ''} onChange={e => setOpt('TurnstileSiteKey', e.target.value)} placeholder="0x..." />
              </div>
              <div className="form-group">
                <label className="form-label">Secret Key</label>
                <input type="password" value={opts.TurnstileSecretKey || ''} onChange={e => setOpt('TurnstileSecretKey', e.target.value)} placeholder="0x..." />
              </div>
            </div>
          )}
        </div>

        {/* 邮件配置 */}
        <div className="card">
          <div className="card-header"><span className="card-title"><Mail size={16} color="var(--info)"/>邮件配置（SMTP）</span></div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            配置 SMTP 后才能启用邮箱验证和密码重置功能
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SMTP 服务器</label>
              <input value={opts.SMTPServer || ''} onChange={e => setOpt('SMTPServer', e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="form-group">
              <label className="form-label">端口</label>
              <input type="number" value={opts.SMTPPort || '587'} onChange={e => setOpt('SMTPPort', e.target.value)} placeholder="587" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">SMTP 账号</label>
              <input value={opts.SMTPAccount || ''} onChange={e => setOpt('SMTPAccount', e.target.value)} placeholder="your@email.com" />
            </div>
            <div className="form-group">
              <label className="form-label">SMTP 密码/Token</label>
              <input type="password" value={opts.SMTPToken || ''} onChange={e => setOpt('SMTPToken', e.target.value)} placeholder="应用专用密码" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">发件人地址</label>
            <input value={opts.SMTPFrom || ''} onChange={e => setOpt('SMTPFrom', e.target.value)} placeholder="noreply@aitoken.homes" />
          </div>
        </div>

        {/* 客服设置 */}
        <div className="card">
          <div className="card-header"><span className="card-title"><MessageCircle size={16} color="#07c160"/>客服设置</span></div>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>显示客服浮动按钮</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>在用户前台右下角显示微信客服入口</div>
            </div>
            <input type="checkbox" checked={csConfig.customer_service_enabled === 'true'} onChange={e => setCsConfig(p => ({ ...p, customer_service_enabled: e.target.checked ? 'true' : 'false' }))} style={{ width: 'auto', accentColor: '#07c160' }} />
          </label>
          <div className="form-group">
            <label className="form-label">微信号</label>
            <input value={csConfig.customer_service_wechat} onChange={e => setCsConfig(p => ({ ...p, customer_service_wechat: e.target.value }))} placeholder="企业微信号" />
          </div>
          <div className="form-group">
            <label className="form-label">二维码图片 URL</label>
            <input value={csConfig.customer_service_qrcode} onChange={e => setCsConfig(p => ({ ...p, customer_service_qrcode: e.target.value }))} placeholder="https://图床地址/qrcode.png" />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>上传二维码到图床后填入 URL，用户可扫码添加</div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">提示文字</label>
            <input value={csConfig.customer_service_text} onChange={e => setCsConfig(p => ({ ...p, customer_service_text: e.target.value }))} placeholder="添加微信，获取帮助" />
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSaveAll} disabled={saving} style={{ justifySelf: 'flex-start', padding: '12px 32px' }}>
          <Save size={16}/>{saving ? '保存中...' : '保存全部设置'}
        </button>
      </div>
    </div>
  )
}
