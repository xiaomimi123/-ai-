import { useEffect, useState } from 'react'
import { MessageCircle, X, Copy, Check } from 'lucide-react'
import axios from 'axios'

export default function CustomerService() {
  const [config, setConfig] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  useEffect(() => {
    axios.get('/api/lingjing/config', { withCredentials: true }).then(r => {
      if (r.data.success) setConfig(r.data.data)
    }).catch(() => {})

    // 响应式：窗口尺寸变化时同步状态
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 不显示：未加载、未启用
  if (!config || !config.customer_service_enabled) return null

  const copyWechat = () => {
    if (config.customer_service_wechat) {
      navigator.clipboard.writeText(config.customer_service_wechat)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      {/* 浮动按钮：移动端 bottom=88 避开 TabBar；桌面 bottom=24 */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          bottom: isMobile ? 88 : 24,
          right: isMobile ? 16 : 24,
          zIndex: 1000,
          width: 56, height: 56, borderRadius: '50%',
          background: '#07c160', color: '#fff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(7,193,96,.4)',
          transition: 'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* 弹出卡片 */}
      {open && (
        <>
          {/* 遮罩 - 点击关闭 */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />

          <div style={isMobile ? {
            // 移动端：bottom sheet 风格，左右撑满，紧贴 TabBar 上方
            position: 'fixed', bottom: 152, left: 16, right: 16, zIndex: 1001,
            background: '#fff', borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,.2)',
            maxHeight: '60vh', overflowY: 'auto',
            animation: 'csSlideUp .2s ease',
          } : {
            // 桌面端：原样，浮在按钮左上方
            position: 'fixed', bottom: 90, right: 24, zIndex: 1001,
            width: 280, background: '#fff', borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,.15)',
            overflow: 'hidden', animation: 'csSlideUp .2s ease',
          }}>
            {/* 头部 */}
            <div style={{ background: 'linear-gradient(135deg, #07c160, #06ad56)', padding: '16px 20px', color: '#fff' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>客服微信</div>
              <div style={{ fontSize: 13, opacity: .85 }}>{config.customer_service_text || '添加微信，获取帮助'}</div>
            </div>

            <div style={{ padding: '20px' }}>
              {/* 二维码 */}
              {config.customer_service_qrcode ? (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <img
                    src={config.customer_service_qrcode}
                    alt="客服二维码"
                    style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid #e5e7eb', objectFit: 'contain' }}
                  />
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>微信扫码添加客服</p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', marginBottom: 16, padding: '24px 0' }}>
                  <MessageCircle size={32} color="#07c160" style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: '#6b7280' }}>请复制下方微信号添加</p>
                </div>
              )}

              {/* 微信号 + 复制 */}
              {config.customer_service_wechat && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>微信号</div>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'monospace' }}>{config.customer_service_wechat}</div>
                  </div>
                  <button onClick={copyWechat} style={{
                    background: copied ? '#07c160' : '#fff', border: '1px solid #e5e7eb',
                    borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                    color: copied ? '#fff' : '#374151', fontSize: 12, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 4, transition: 'all .2s',
                  }}>
                    {copied ? <><Check size={12} />已复制</> : <><Copy size={12} />复制</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes csSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 480px) {
          div[style*="width: 280"] { width: calc(100vw - 48px) !important; right: 24px !important; }
        }
      `}</style>
    </>
  )
}
