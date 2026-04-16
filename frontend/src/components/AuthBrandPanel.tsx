import { Link } from 'react-router-dom'
import { Zap, CreditCard, Shield } from 'lucide-react'

// 登录 / 注册页共用的左侧品牌面板
// 移动端（< 768px）通过 className "auth-brand" 在 index.css 里被隐藏，右侧表单全宽
export default function AuthBrandPanel() {
  return (
    <div
      className="auth-brand"
      style={{
        flex: 1,
        background: 'var(--primary)',
        color: '#fff',
        padding: '48px 56px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '100vh',
      }}
    >
      {/* 装饰：右上角翠绿光晕 */}
      <div style={{
        position: 'absolute',
        top: -120, right: -120,
        width: 360, height: 360,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(46,204,113,.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      {/* 装饰：左下角翠绿光晕 */}
      <div style={{
        position: 'absolute',
        bottom: -100, left: -100,
        width: 300, height: 300,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(46,204,113,.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo + 品牌 */}
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1, color: '#fff' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: 'var(--accent)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 16,
        }}>境</div>
        <span style={{ fontWeight: 600, fontSize: 20 }}>灵镜 AI</span>
      </Link>

      {/* 主标题 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1, marginTop: 20 }}>
        <h2 style={{
          fontSize: 36, fontWeight: 600, lineHeight: 1.25,
          marginBottom: 16, letterSpacing: '-0.02em',
        }}>
          统一接入<br />
          <span style={{ color: 'var(--accent)' }}>全球 AI 模型</span>
        </h2>
        <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 15, lineHeight: 1.7, maxWidth: 360, marginBottom: 32 }}>
          一个 API Key，统一调用 DeepSeek / Claude / GPT-4o / Gemini 等全球主流大模型。
        </p>

        {/* 三个特性卡 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { icon: Zap,        title: '统一接口', desc: '完全兼容 OpenAI 格式，改一行 API 地址即可接入' },
            { icon: CreditCard, title: '按量计费', desc: '精确到 Token 计费，无最低消费，余额永久有效' },
            { icon: Shield,     title: '稳定可靠', desc: '多渠道冗余，香港节点直连，毫秒级响应' },
          ].map(f => (
            <div key={f.title} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '14px 16px',
              background: 'rgba(255,255,255,.04)',
              border: '0.5px solid rgba(255,255,255,.08)',
              borderRadius: 10,
              maxWidth: 380,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 7,
                background: 'rgba(46,204,113,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <f.icon size={16} color="var(--accent)" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{f.title}</div>
                <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部版权 */}
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,.35)',
        position: 'relative', zIndex: 1,
      }}>
        © {new Date().getFullYear()} 灵镜 AI · API Service Provider
      </div>
    </div>
  )
}
