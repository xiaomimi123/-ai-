import { useState, useEffect, useRef } from 'react'
import { CreditCard, Gift, Tag, CheckCircle, Loader2 } from 'lucide-react'
import { redeemApi, payApi, authApi } from '../api'
import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

interface Plan { id: number; name: string; price: number; quota: number; bonus_quota: number; description: string; is_available: boolean }

function fmtQuota(q: number): string {
  if (q >= 100000000) return `${(q / 100000000).toFixed(1)}亿`
  if (q >= 10000000) return `${(q / 10000000).toFixed(0)}千万`
  if (q >= 1000000) return `${(q / 1000000).toFixed(0)}百万`
  return `${q}`
}

export default function TopupPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [payMode, setPayMode] = useState<'plan' | 'custom'>('plan')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [payStatus, setPayStatus] = useState(0) // 0idle 1success
  const [orderNo, setOrderNo] = useState('')
  const [payUrl, setPayUrl] = useState('')
  const [user, setUser] = useState<any>(null)
  const [payConfig, setPayConfig] = useState({ alipay_enabled: false, redeem_enabled: true })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) }).catch(() => {})
    http.get('/api/lingjing/plans').then(r => { if (r.data.success && r.data.data?.length) setPlans(r.data.data) }).catch(() => {})
    payApi.getConfig().then(r => { if (r.data.success) setPayConfig(r.data.data) }).catch(() => {})
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handlePay = async () => {
    const amount = payMode === 'plan' ? selectedPlan?.price : parseFloat(customAmount)
    if (!amount || amount < 10) { alert(payMode === 'plan' ? '请选择套餐' : '最低充值 ¥10'); return }
    setLoading(true); setPayStatus(0); setPayUrl('')
    try {
      const payload = payMode === 'plan' && selectedPlan
        ? { plan_id: selectedPlan.id, amount: selectedPlan.price, pay_type: 'alipay' }
        : { amount: parseFloat(customAmount), pay_type: 'alipay' }
      const res = await http.post('/api/lingjing/pay/create', payload)
      if (res.data.success) {
        const { pay_url, order_no } = res.data.data
        setOrderNo(order_no); setPayUrl(pay_url)
        window.open(pay_url, '_blank')
        // 轮询
        if (pollRef.current) clearInterval(pollRef.current)
        let cnt = 0
        pollRef.current = setInterval(async () => {
          cnt++; if (cnt > 60) { clearInterval(pollRef.current!); return }
          try {
            const r = await http.get(`/api/lingjing/pay/order/${order_no}`)
            if (r.data.success && r.data.data.status === 1) {
              clearInterval(pollRef.current!); setPayStatus(1)
              authApi.getSelf().then(r => { if (r.data.success) setUser(r.data.data) })
            }
          } catch {}
        }, 3000)
      } else alert(res.data.message || '创建订单失败')
    } catch { alert('网络错误') } finally { setLoading(false) }
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
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>充值</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>当前余额：<span style={{ color: 'var(--primary)', fontWeight: 700 }}>¥{balance}</span></p>
      </div>

      {payStatus === 1 && (
        <div style={{ background: '#dcfce7', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, border: '1px solid #86efac' }}>
          <CheckCircle size={20} color="#10b981" /><div><div style={{ fontWeight: 700, color: '#065f46' }}>支付成功！</div><div style={{ fontSize: 13, color: '#047857' }}>额度已到账，订单号：{orderNo}</div></div>
        </div>
      )}

      {orderNo && payStatus === 0 && !loading && (
        <div style={{ background: '#eff6ff', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, border: '1px solid #93c5fd' }}>
          <Loader2 size={18} color="#4f6ef7" style={{ animation: 'spin 1s linear infinite' }} />
          <div><div style={{ fontWeight: 600, color: '#1e40af' }}>等待支付...</div>
            <div style={{ fontSize: 13, color: '#3b82f6' }}>请在新窗口完成支付 <button onClick={() => window.open(payUrl, '_blank')} style={{ color: '#4f6ef7', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>重新打开</button></div>
          </div>
        </div>
      )}

      {/* 充值方式切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => { setPayMode('plan'); setCustomAmount('') }} className={`btn ${payMode === 'plan' ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }}><Gift size={15} style={{ marginRight: 6 }} />套餐充值</button>
        <button onClick={() => { setPayMode('custom'); setSelectedPlan(null) }} className={`btn ${payMode === 'custom' ? 'btn-primary' : 'btn-outline'}`} style={{ flex: 1 }}><CreditCard size={15} style={{ marginRight: 6 }} />自定义金额</button>
      </div>

      {/* 套餐 */}
      {payMode === 'plan' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {plans.map(p => (
            <div key={p.id} onClick={() => setSelectedPlan(p)} style={{ border: `2px solid ${selectedPlan?.id === p.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 12, padding: 16, cursor: 'pointer', background: selectedPlan?.id === p.id ? 'var(--primary-50)' : 'white', position: 'relative', transition: 'all .15s' }}>
              {p.bonus_quota > 0 && <div style={{ position: 'absolute', top: -10, right: 12, background: '#f59e0b', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>赠 {fmtQuota(p.bonus_quota)}</div>}
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)', marginBottom: 4 }}>¥{p.price}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{fmtQuota(p.quota)} Token{p.bonus_quota > 0 && <span style={{ color: '#f59e0b', marginLeft: 4 }}>+{fmtQuota(p.bonus_quota)}</span>}</div>
              {p.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{p.description}</div>}
              {selectedPlan?.id === p.id && <CheckCircle size={16} color="var(--primary)" style={{ position: 'absolute', bottom: 12, right: 12 }} />}
            </div>
          ))}
        </div>
      )}

      {/* 自定义金额 */}
      {payMode === 'custom' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>输入充值金额</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)' }}>¥</span>
            <input type="number" min="10" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder="最低 10" style={{ flex: 1, fontSize: 24, fontWeight: 700, border: 'none', outline: 'none', padding: '8px 0' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>最低 ¥10 · 1元 = 50万 Token</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[10, 30, 50, 100, 200, 500].map(a => (
              <button key={a} onClick={() => setCustomAmount(String(a))} className={`btn btn-sm ${customAmount === String(a) ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: 12 }}>¥{a}</button>
            ))}
          </div>
        </div>
      )}

      {/* 支付按钮 */}
      {curAmount >= 10 && payConfig.alipay_enabled && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: 'var(--muted)' }}>支付金额</span><span style={{ fontWeight: 700, fontSize: 18 }}>¥{curAmount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <span style={{ color: 'var(--muted)' }}>到账额度</span><span style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmtQuota(curQuota)} Token</span>
          </div>
          <button onClick={handlePay} disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700 }}>
            {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />处理中...</> : '支付宝扫码支付'}
          </button>
          <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 10 }}>点击后在新窗口打开支付宝收银台</div>
        </div>
      )}

      {/* 兑换码 */}
      {payConfig.redeem_enabled && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><Tag size={16} color="var(--primary)" /><span style={{ fontWeight: 600 }}>充值码兑换</span></div>
          {redeemMsg?.ok ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle size={32} color="#10b981" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>兑换成功！</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{redeemMsg.text}</div>
              <button className="btn btn-outline" onClick={() => setRedeemMsg(null)} style={{ marginTop: 12 }}>继续兑换</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRedeem()} placeholder="请输入充值码" style={{ flex: 1 }} />
                <button onClick={handleRedeem} disabled={redeemLoading || !code.trim()} className="btn btn-outline" style={{ minWidth: 80 }}>{redeemLoading ? '兑换中...' : '兑换'}</button>
              </div>
              {redeemMsg && !redeemMsg.ok && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginTop: 12, fontSize: 13 }}>{redeemMsg.text}</div>}
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
