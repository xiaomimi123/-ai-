import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Shield, Globe, Code, ChevronRight, Copy } from 'lucide-react'
import { publicApi } from '../api'

export default function HomePage() {
  const [models, setModels] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    publicApi.getModelPrices().then(r => { if (r.data.success) setModels(r.data.data || []) }).catch(() => {})
    publicApi.getNotices().then(r => { if (r.data.success) setNotices(r.data.data || []) }).catch(() => {})
  }, [])

  const baseUrl = window.location.origin + '/v1'

  const handleCopy = () => {
    navigator.clipboard.writeText(baseUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isLoggedIn = !!localStorage.getItem('access_token')

  return (
    <div style={{ background: '#0a0a14', color: '#f1f5f9', minHeight: 'calc(100vh - var(--nav-height))' }}>
      {/* Notice */}
      {notices.length > 0 && (
        <div style={{ background: 'rgba(99,102,241,.12)', borderBottom: '1px solid rgba(99,102,241,.25)', padding: '10px 32px', textAlign: 'center', fontSize: 13, color: '#a5b4fc' }}>
          📢 {notices[0].title}{notices[0].content ? ` — ${notices[0].content}` : ''}
        </div>
      )}

      {/* Hero */}
      <section style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center', paddingLeft: 24, paddingRight: 24 }}>
        <div style={{ display: 'inline-block', background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.25)', borderRadius: 999, padding: '6px 16px', fontSize: 12, color: '#a5b4fc', marginBottom: 28 }}>
          支持 Claude / GPT / DeepSeek / Gemini 等 40+ 模型
        </div>
        <h1 style={{ fontSize: 'clamp(34px, 5.5vw, 64px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, background: 'linear-gradient(135deg, #fff 40%, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          一个 API<br />接入全部 AI
        </h1>
        <p style={{ fontSize: 17, color: 'rgba(255,255,255,.45)', maxWidth: 460, margin: '0 auto 32px', lineHeight: 1.8 }}>
          兼容 OpenAI 格式，按量计费，用多少付多少。<br />无月费，无最低消费，余额永不过期。
        </p>

        {/* Base URL */}
        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 16px', gap: 10, marginBottom: 36 }}>
          <code style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>{baseUrl}</code>
          <span style={{ color: '#818cf8', fontSize: 14, fontWeight: 600 }}>/chat/completions</span>
          <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#34d399' : 'rgba(255,255,255,.3)', padding: 2 }}>
            <Copy size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isLoggedIn ? (
            <Link to="/dashboard" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', padding: '13px 30px', borderRadius: 10, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              进入控制台 <ChevronRight size={16} />
            </Link>
          ) : (
            <Link to="/register" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', padding: '13px 30px', borderRadius: 10, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              免费开始 <ChevronRight size={16} />
            </Link>
          )}
          <Link to="/docs" style={{ background: 'rgba(255,255,255,.06)', color: '#fff', padding: '13px 30px', borderRadius: 10, fontSize: 15, border: '1px solid rgba(255,255,255,.1)' }}>
            查看文档
          </Link>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '0 32px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 20 }}>
          {[
            { icon: Zap, title: '极低延迟', desc: '多节点直连，自动选择最快通道' },
            { icon: Shield, title: '稳定可靠', desc: '多渠道冗余容灾，99.9% 可用性' },
            { icon: Globe, title: '全球模型', desc: '覆盖 Anthropic / OpenAI / Google 等' },
            { icon: Code, title: '开发友好', desc: '完全兼容 OpenAI SDK，一行代码接入' },
          ].map(f => (
            <div key={f.title} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 26 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(99,102,241,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <f.icon size={20} color="#818cf8" />
              </div>
              <h3 style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{f.title}</h3>
              <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Models */}
      {models.length > 0 && (
        <section style={{ padding: '0 32px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, marginBottom: 40 }}>支持的模型</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {models.slice(0, 8).map(m => (
              <div key={m.model_name} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{m.model_name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>{m.provider}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>${m.input_price}/M</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.25)' }}>输入价格</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Link to="/models" style={{ color: '#818cf8', fontSize: 14, fontWeight: 500 }}>查看全部模型 →</Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,.25)', fontSize: 13 }}>
        © {new Date().getFullYear()} 灵镜AI · aitoken.homes
      </footer>
    </div>
  )
}
