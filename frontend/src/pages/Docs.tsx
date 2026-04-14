import { FileText, Copy } from 'lucide-react'
import { useState } from 'react'

export default function DocsPage() {
  const [copied, setCopied] = useState('')
  const domain = window.location.hostname === 'localhost' ? 'aitoken.homes' : window.location.hostname

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopied(id)
    setTimeout(() => setCopied(''), 2000)
  }

  const examples = [
    {
      lang: 'Python',
      id: 'python',
      code: `from openai import OpenAI

client = OpenAI(
    api_key="sk-your-token",
    base_url="https://${domain}/v1"
)

response = client.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`,
    },
    {
      lang: 'Node.js',
      id: 'nodejs',
      code: `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-token',
  baseURL: 'https://${domain}/v1'
});

const response = await client.chat.completions.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello!' }]
});
console.log(response.choices[0].message.content);`,
    },
    {
      lang: 'curl',
      id: 'curl',
      code: `curl https://${domain}/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
    },
  ]

  return (
    <div style={{ maxWidth: 780 }}>
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={22} color="var(--primary)" />接入文档
        </h1>
        <p className="page-desc">兼容 OpenAI SDK 格式，只需替换 base_url 和 api_key</p>
      </div>

      {/* Endpoint Info */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 16 }}>接口信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px 16px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Base URL</span>
          <code style={{ background: '#f3f4f6', padding: '6px 12px', borderRadius: 6, fontSize: 14, fontFamily: 'monospace' }}>https://{domain}/v1</code>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>认证方式</span>
          <code style={{ background: '#f3f4f6', padding: '6px 12px', borderRadius: 6, fontSize: 14, fontFamily: 'monospace' }}>Authorization: Bearer sk-xxx</code>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>兼容格式</span>
          <span style={{ fontSize: 14 }}>OpenAI Chat Completions API</span>
        </div>
      </div>

      {/* Steps */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 16 }}>快速开始</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['注册账号并登录控制台', '创建 API 令牌', '充值额度', '将 base_url 替换为上方地址，开始调用'].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
              <span style={{ fontSize: 14 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Code Examples */}
      {examples.map(ex => (
        <div className="card" key={ex.id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontWeight: 600 }}>{ex.lang}</h4>
            <button className="btn btn-ghost btn-sm" onClick={() => copyCode(ex.code, ex.id)} style={{ color: copied === ex.id ? 'var(--success)' : 'var(--muted)' }}>
              <Copy size={14} />{copied === ex.id ? '已复制' : '复制'}
            </button>
          </div>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 20, borderRadius: 10, fontSize: 13, overflow: 'auto', lineHeight: 1.7, margin: 0 }}>{ex.code}</pre>
        </div>
      ))}
    </div>
  )
}
