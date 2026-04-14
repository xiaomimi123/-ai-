import { useState, useEffect, useRef } from 'react'
import { CreditCard, Gift, Check } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { redeemApi, payApi } from '../api'

const PRESET_AMOUNTS = [1, 5, 10, 50, 100, 500]

export default function TopupPage() {
  const [amount, setAmount] = useState<number>(10)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [payMethod, setPayMethod] = useState<'alipay' | 'wxpay'>('alipay')
  const [paying, setPaying] = useState(false)
  const [payUrl, setPayUrl] = useState('')
  const [payMoney, setPayMoney] = useState('')
  const [paySuccess, setPaySuccess] = useState(false)

  const [code, setCode] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [payInfo, setPayInfo] = useState<any>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    payApi.getInfo().then(r => { if (r.data.success) setPayInfo(r.data.data) }).catch(() => {})
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // 计算支付金额
  useEffect(() => {
    const a = isCustom ? parseInt(customAmount) || 0 : amount
    if (a > 0 && payInfo?.price) {
      setPayMoney((a * payInfo.price).toFixed(2))
    }
  }, [amount, customAmount, isCustom, payInfo])

  const handlePay = async () => {
    const a = isCustom ? parseInt(customAmount) || 0 : amount
    if (a < (payInfo?.min_topup || 1)) return
    setPaying(true); setPayUrl(''); setPaySuccess(false)
    try {
      const res = await payApi.pay({ amount: a, payment_method: payMethod })
      if (res.data.success) {
        // 易支付可能返回 url（支付跳转）或 data（表单参数）
        const url = res.data.url || ''
        const data = res.data.data || ''
        const payLink = url || (typeof data === 'string' ? data : '')

        if (payLink && payLink.startsWith('http')) {
          setPayUrl(payLink)
          // 同时在新窗口打开（部分支付方式不支持扫码）
          window.open(payLink, '_blank')
        } else if (payLink) {
          // 非标准URL，直接跳转
          window.open(payLink, '_blank')
        } else {
          alert('支付链接生成失败，请联系管理员')
        }
      } else {
        alert(res.data.message || '支付未配置，请联系管理员开启在线支付')
      }
    } catch { alert('网络错误') } finally { setPaying(false) }
  }

  const handleRedeem = async () => {
    if (!code.trim()) return
    setRedeemLoading(true); setRedeemMsg(null)
    try {
      const res = await redeemApi.submit(code)
      setRedeemMsg({ ok: res.data.success, text: res.data.message })
      if (res.data.success) setCode('')
    } catch { setRedeemMsg({ ok: false, text: '网络错误' }) } finally { setRedeemLoading(false) }
  }

  const currentAmount = isCustom ? parseInt(customAmount) || 0 : amount
  const epayEnabled = payInfo?.enable_online_topup

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">充值</h1>
        <p className="page-desc">按需充值，用多少充多少，余额永不过期</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: epayEnabled ? '1fr 1fr' : '1fr', gap: 24, alignItems: 'start' }}>
        {/* 在线充值 */}
        {epayEnabled && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ background: 'var(--primary-50)', borderRadius: 8, padding: 8 }}>
                <CreditCard size={18} color="var(--primary)" />
              </div>
              <h3 style={{ fontWeight: 600 }}>在线充值</h3>
            </div>

            {/* 金额选择 */}
            <div className="form-label">选择充值金额（$）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {PRESET_AMOUNTS.map(a => (
                <button
                  key={a}
                  onClick={() => { setAmount(a); setIsCustom(false) }}
                  style={{
                    padding: '14px 0', borderRadius: 10, fontSize: 18, fontWeight: 700,
                    border: !isCustom && amount === a ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: !isCustom && amount === a ? 'var(--primary-50)' : '#fff',
                    color: !isCustom && amount === a ? 'var(--primary)' : 'var(--text)',
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  ${a}
                </button>
              ))}
            </div>

            {/* 自定义金额 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="自定义金额"
                  value={customAmount}
                  onChange={e => { setCustomAmount(e.target.value); setIsCustom(true) }}
                  onFocus={() => setIsCustom(true)}
                  min={1}
                  style={{ flex: 1, border: isCustom ? '2px solid var(--primary)' : undefined }}
                />
                <span style={{ color: 'var(--muted)', fontSize: 13, flexShrink: 0 }}>美元</span>
              </div>
            </div>

            {/* 支付方式 */}
            <div className="form-label">支付方式</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              {[
                { key: 'alipay' as const, label: '支付宝', color: '#1677ff' },
                { key: 'wxpay' as const, label: '微信支付', color: '#07c160' },
              ].map(m => (
                <button key={m.key} onClick={() => setPayMethod(m.key)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                    border: payMethod === m.key ? `2px solid ${m.color}` : '1px solid var(--border)',
                    background: payMethod === m.key ? `${m.color}10` : '#fff',
                    color: payMethod === m.key ? m.color : 'var(--text)',
                  }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* 支付信息 */}
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--text-secondary)' }}>充值额度</span>
                <strong>${currentAmount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>实付金额</span>
                <strong style={{ color: 'var(--primary)', fontSize: 20 }}>¥{payMoney || '0.00'}</strong>
              </div>
            </div>

            {/* 支付按钮或二维码 */}
            {paySuccess ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Check size={26} color="#16a34a" />
                </div>
                <h3 style={{ color: 'var(--success)', marginBottom: 6 }}>支付成功</h3>
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>额度已到账</p>
              </div>
            ) : payUrl ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 12 }}>
                  <QRCodeSVG value={payUrl} size={180} />
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  打开{payMethod === 'alipay' ? '支付宝' : '微信'}扫码支付
                </p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>支付完成后请刷新页面查看余额</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                  <a href={payUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">在浏览器中打开</a>
                  <button className="btn btn-outline btn-sm" onClick={() => setPayUrl('')}>重新选择</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15 }} onClick={handlePay} disabled={paying || currentAmount < 1}>
                <CreditCard size={16} />{paying ? '跳转中...' : `支付 ¥${payMoney || '0.00'}`}
              </button>
            )}

            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
              汇率 1 USD = ¥{payInfo?.price || '7.3'} · 最低充值 ${payInfo?.min_topup || 1}
            </p>
          </div>
        )}

        {/* 充值码兑换 */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ background: '#dcfce7', borderRadius: 8, padding: 8 }}>
              <Gift size={18} color="var(--success)" />
            </div>
            <h3 style={{ fontWeight: 600 }}>充值码兑换</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            如果您有充值码，可在此直接兑换为额度
          </p>
          <div className="form-group">
            <label className="form-label">充值码</label>
            <input placeholder="请输入充值码" value={code} onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRedeem()} />
            <p className="form-hint">充值码由管理员发放，每码仅限使用一次</p>
          </div>
          {redeemMsg && (
            <div style={{ background: redeemMsg.ok ? '#dcfce7' : '#fee2e2', color: redeemMsg.ok ? '#166534' : '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              {redeemMsg.text}
            </div>
          )}
          <button className="btn btn-primary" onClick={handleRedeem} disabled={redeemLoading || !code.trim()} style={{ width: '100%', padding: 12 }}>
            {redeemLoading ? '兑换中...' : '立即兑换'}
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"][style*="gap: 24px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
