import { useState, useEffect, useRef } from 'react'
import { CreditCard, Gift, Tag, CheckCircle, Loader2, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { redeemApi, payApi, authApi } from '../api'
import axios from 'axios'

// PC 端 vs 移动端：PC 渲染二维码让用户手机扫；移动端直接跳转唤起支付 App
const isMobile = () => /android|iphone|ipad|ipod|mobile|micromessenger/i.test(navigator.userAgent)
// 微信内置浏览器（支付宝跳转会被拦截 → 需要提示用户"在浏览器打开"）
const isWechatBrowser = () => /micromessenger/i.test(navigator.userAgent)

// pending 订单号 localStorage key（移动端支付完成后可能不回跳本站，下次访问时补查状态）
const PENDING_ORDER_KEY = 'lingjing_pending_order'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

interface Plan { id: number; name: string; price: number; quota: number; bonus_quota: number; description: string; is_available: boolean }

export default function TopupPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [payMode, setPayMode] = useState<'plan' | 'custom'>('plan')
  const [payType, setPayType] = useState<'alipay' | 'wxpay'>('alipay')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [payStatus, setPayStatus] = useState(0) // 0idle 1success
  const [orderNo, setOrderNo] = useState('')
  const [qrPayUrl, setQrPayUrl] = useState('')     // PC 端二维码内容（支付跳转 URL）
  const [qrAmount, setQrAmount] = useState(0)     // 二维码弹窗展示的金额
  const [user, setUser] = useState<any>(null)
  const [payConfig, setPayConfig] = useState({ alipay_enabled: false, wxpay_enabled: false, redeem_enabled: true })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 启动订单状态轮询（每 2s 查一次，最多 150 次 = 5 分钟）
  const startPolling = (targetOrderNo: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    let cnt = 0
    pollRef.current = setInterval(async () => {
      cnt++
      if (cnt > 150) {
        clearInterval(pollRef.current!)
        // 5 分钟还没支付成功，清掉 localStorage 避免脏数据
        localStorage.removeItem(PENDING_ORDER_KEY)
        return
      }
      try {
        const r = await http.get(`/api/lingjing/pay/order/${targetOrderNo}`)
        if (r.data.success && r.data.data.status === 1) {
          clearInterval(pollRef.current!)
          setPayStatus(1)
          setQrPayUrl('') // 关闭二维码弹窗
          localStorage.removeItem(PENDING_ORDER_KEY)
          authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) })
        }
      } catch {}
    }, 2000)
  }

  useEffect(() => {
    authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) }).catch(() => {})
    http.get('/api/lingjing/plans').then(r => { if (r.data.success && r.data.data?.length) setPlans(r.data.data) }).catch(() => {})
    payApi.getConfig().then(r => {
      if (r.data.success) {
        const cfg = r.data.data
        setPayConfig({
          alipay_enabled: !!cfg.alipay_enabled,
          wxpay_enabled: !!cfg.wxpay_enabled,
          redeem_enabled: cfg.redeem_enabled !== false,
        })
        // 若默认选中的支付宝未开通但微信开通，自动切到微信；反之亦然
        if (!cfg.alipay_enabled && cfg.wxpay_enabled) setPayType('wxpay')
        else if (cfg.alipay_enabled && !cfg.wxpay_enabled) setPayType('alipay')
      }
    }).catch(() => {})

    // 待处理订单恢复：优先从 URL ?order= 取（移动端支付后 return_url 回跳），
    // 次优从 localStorage 取（用户关掉浏览器又回来的场景）
    const params = new URLSearchParams(window.location.search)
    const returnedOrder = params.get('order') || localStorage.getItem(PENDING_ORDER_KEY)
    if (returnedOrder) {
      setOrderNo(returnedOrder)
      // 先查一次当前状态：已完成就显示成功，未完成才启动轮询
      http.get(`/api/lingjing/pay/order/${returnedOrder}`).then(r => {
        if (r.data.success && r.data.data.status === 1) {
          setPayStatus(1)
          localStorage.removeItem(PENDING_ORDER_KEY)
          authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) })
        } else if (r.data.success) {
          startPolling(returnedOrder)
        } else {
          // 订单不存在：清理陈旧 localStorage
          localStorage.removeItem(PENDING_ORDER_KEY)
        }
      }).catch(() => {})
    }

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handlePay = async () => {
    const amount = payMode === 'plan' ? selectedPlan?.price : parseFloat(customAmount)
    if (!amount || amount < 10) { alert(payMode === 'plan' ? '请选择套餐' : '最低充值 ¥10'); return }
    // 微信内置浏览器要跳支付宝：微信必然拦截，先提示用户
    if (payType === 'alipay' && isWechatBrowser()) {
      alert('微信内暂时无法直接唤起支付宝。\n请点击右上角「...」→ 在浏览器打开，再支付')
      return
    }
    setLoading(true); setPayStatus(0)
    try {
      const payload = payMode === 'plan' && selectedPlan
        ? { plan_id: selectedPlan.id, amount: selectedPlan.price, pay_type: payType }
        : { amount: parseFloat(customAmount), pay_type: payType }
      const res = await http.post('/api/lingjing/pay/create', payload)
      if (res.data.success) {
        const { pay_url, order_no } = res.data.data
        // 记 pending 订单到 localStorage：移动端支付完可能不回跳，下次打开本页仍能识别
        localStorage.setItem(PENDING_ORDER_KEY, order_no)
        if (isMobile()) {
          // 移动端：直接跳到支付页唤起支付宝 / 微信 App
          window.location.href = pay_url
        } else {
          // PC 端：展示二维码让用户手机扫码支付 + 启动订单状态轮询
          setOrderNo(order_no)
          setQrPayUrl(pay_url)
          setQrAmount(amount)
          startPolling(order_no)
        }
      } else alert(res.data.message || '创建订单失败')
    } catch { alert('网络错误') } finally { setLoading(false) }
  }

  const closeQR = () => {
    setQrPayUrl('')
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const handleRedeem = async () => {
    if (!code.trim()) return
    setRedeemLoading(true); setRedeemMsg(null)
    try {
      const res = await redeemApi.submit(code.trim())
      setRedeemMsg({ ok: res.data.success, text: res.data.message })
      if (res.data.success) { setCode(''); authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) }) }
    } catch { setRedeemMsg({ ok: false, text: '网络错误' }) } finally { setRedeemLoading(false) }
  }

  const curAmount = payMode === 'plan' ? (selectedPlan?.price || 0) : (parseFloat(customAmount) || 0)
  const curQuota = payMode === 'plan' ? ((selectedPlan?.quota || 0) + (selectedPlan?.bonus_quota || 0)) : Math.floor(curAmount * 500000)
  const balance = ((user?.quota || 0) / 500000).toFixed(2)

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header">
        <h1 className="page-title">充值</h1>
        <p className="page-desc">当前余额：<span style={{ color: 'var(--accent)', fontWeight: 600 }}>${balance}</span></p>
      </div>

      {payStatus === 1 && (
        <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderLeft: '3px solid var(--accent)' }}>
          <CheckCircle size={20} color="var(--accent)" />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--primary)' }}>支付成功！</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>额度已到账，订单号：{orderNo}</div>
          </div>
        </div>
      )}

      {/* PC 端扫码支付弹窗 */}
      {qrPayUrl && payStatus === 0 && (
        <div
          onClick={closeQR}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(13,31,20,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, backdropFilter: 'blur(4px)', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: '28px 32px',
              boxShadow: '0 8px 32px rgba(0,0,0,.2)',
              minWidth: 320, position: 'relative', textAlign: 'center',
            }}
          >
            <button
              onClick={closeQR}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 6, borderRadius: 6, color: 'var(--muted)',
              }}
            >
              <X size={18} />
            </button>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--primary)', marginBottom: 4 }}>
              请使用手机扫码支付
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
              支付金额 <span style={{ color: 'var(--accent)', fontWeight: 600 }}>¥{qrAmount.toFixed(2)}</span>
            </div>
            <div style={{
              padding: 14, border: '0.5px solid var(--border)', borderRadius: 12,
              display: 'inline-block', background: '#fff',
            }}>
              <QRCodeSVG value={qrPayUrl} size={220} level="M" />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.6 }}>
              打开手机「支付宝」或「微信」扫一扫
              <br />完成支付后页面将自动跳转
            </div>
            <div style={{
              marginTop: 14, padding: '8px 12px', background: 'var(--bg)',
              borderRadius: 8, fontSize: 12, color: 'var(--muted)',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              <span>等待支付结果...（订单号 {orderNo}）</span>
            </div>
          </div>
        </div>
      )}

      {orderNo && payStatus === 0 && !loading && (
        <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderLeft: '3px solid var(--accent)' }}>
          <Loader2 size={18} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--primary)' }}>支付结果确认中...</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>订单号：{orderNo}（如已完成支付请稍等数秒）</div>
          </div>
        </div>
      )}

      {/* 充值方式切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => { setPayMode('plan'); setCustomAmount('') }} className={`btn ${payMode === 'plan' ? 'btn-accent' : 'btn-outline'}`} style={{ flex: 1 }}><Gift size={15} />套餐充值</button>
        <button onClick={() => { setPayMode('custom'); setSelectedPlan(null) }} className={`btn ${payMode === 'custom' ? 'btn-accent' : 'btn-outline'}`} style={{ flex: 1 }}><CreditCard size={15} />自定义金额</button>
      </div>

      {/* 套餐 */}
      {payMode === 'plan' && (
        <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {plans.map(p => {
            const selected = selectedPlan?.id === p.id
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPlan(p)}
                style={{
                  border: selected ? '2px solid var(--accent)' : '0.5px solid var(--border)',
                  borderRadius: 10,
                  padding: 16,
                  cursor: 'pointer',
                  background: selected ? 'var(--accent-light)' : '#fff',
                  position: 'relative',
                  transition: 'all .15s',
                }}
              >
                {p.bonus_quota > 0 && (
                  <div style={{ position: 'absolute', top: -10, right: 12, background: 'var(--accent)', color: 'var(--primary)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                    赠 ${(p.bonus_quota / 500000).toFixed(2)}
                  </div>
                )}
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>¥{p.price}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  到账 ${(p.quota / 500000).toFixed(2)}
                  {p.bonus_quota > 0 && <span style={{ color: 'var(--accent)', marginLeft: 4, fontWeight: 600 }}>+ ${(p.bonus_quota / 500000).toFixed(2)}</span>}
                </div>
                {p.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{p.description}</div>}
                {selected && <CheckCircle size={16} color="var(--accent)" style={{ position: 'absolute', bottom: 12, right: 12 }} />}
              </div>
            )
          })}
        </div>
      )}

      {/* 自定义金额 */}
      {payMode === 'custom' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>输入充值金额</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)' }}>¥</span>
            <input type="number" min="10" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="最低 10" style={{ flex: 1, fontSize: 24, fontWeight: 600, border: 'none', outline: 'none', padding: '8px 0' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>最低 ¥10 · ¥1 ≈ $1 额度（按 1:1 汇率到账）</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[10, 30, 50, 100, 200, 500].map(a => (
              <button key={a} onClick={() => setCustomAmount(String(a))} className={`btn btn-sm ${customAmount === String(a) ? 'btn-accent' : 'btn-outline'}`} style={{ fontSize: 12 }}>¥{a}</button>
            ))}
          </div>
        </div>
      )}

      {/* 支付按钮 */}
      {curAmount >= 10 && (payConfig.alipay_enabled || payConfig.wxpay_enabled) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>支付金额</span>
              <span style={{ fontWeight: 600, fontSize: 18 }}>¥{curAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>到账额度</span>
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>${(curQuota / 500000).toFixed(2)}</span>
            </div>
          </div>

          {/* 支付方式切换：两个都开通时才显示切换条 */}
          {payConfig.alipay_enabled && payConfig.wxpay_enabled && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setPayType('alipay')}
                className={`btn ${payType === 'alipay' ? 'btn-accent' : 'btn-outline'}`}
                style={{ flex: 1 }}
              >
                支付宝
              </button>
              <button
                type="button"
                onClick={() => setPayType('wxpay')}
                className={`btn ${payType === 'wxpay' ? 'btn-accent' : 'btn-outline'}`}
                style={{ flex: 1 }}
              >
                微信支付
              </button>
            </div>
          )}

          <button onClick={handlePay} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 13, fontSize: 15, fontWeight: 600 }}>
            {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />处理中...</> : `${payType === 'alipay' ? '支付宝' : '微信'}支付 ¥${curAmount.toFixed(2)}`}
          </button>
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>点击后跳转到收银台完成支付</div>
        </div>
      )}

      {/* 兑换码 */}
      {payConfig.redeem_enabled && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: 8, display: 'flex' }}>
              <Tag size={16} color="var(--accent)" />
            </div>
            <span style={{ fontWeight: 600 }}>充值码兑换</span>
          </div>
          {redeemMsg?.ok ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <CheckCircle size={28} color="var(--accent)" />
              </div>
              <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>兑换成功！</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{redeemMsg.text}</div>
              <button className="btn btn-outline" onClick={() => setRedeemMsg(null)} style={{ marginTop: 12 }}>继续兑换</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRedeem()} placeholder="请输入充值码" style={{ flex: 1 }} />
                <button onClick={handleRedeem} disabled={redeemLoading || !code.trim()} className="btn btn-primary" style={{ minWidth: 80 }}>{redeemLoading ? '兑换中...' : '兑换'}</button>
              </div>
              {redeemMsg && !redeemMsg.ok && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginTop: 12, fontSize: 13 }}>{redeemMsg.text}</div>}
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
