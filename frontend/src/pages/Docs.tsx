import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, Zap, Code, BookOpen, Monitor, Smartphone, Globe } from 'lucide-react'
import ModelIcon from '../components/ModelIcon'

const BASE_URL = 'https://aitoken.homes/v1'

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      <div style={{ background: '#0f172a', borderRadius: 10, padding: '16px 20px', fontFamily: 'monospace', fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, overflowX: 'auto' }}>
        <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{language}</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre>
      </div>
      <button onClick={copy} style={{ position: 'absolute', top: 12, right: 12, background: copied ? '#10b981' : 'rgba(255,255,255,.1)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'white', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, transition: 'all .2s' }}>
        {copied ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 复制</>}
      </button>
    </div>
  )
}

function Section({ title, icon: Icon, children, defaultOpen = false }: any) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 16, border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: open ? 'var(--primary-light)' : 'var(--surface)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: open ? 'var(--primary)' : 'var(--text)' }}>
          <Icon size={18} color={open ? 'var(--primary)' : 'var(--muted)'} />
          {title}
        </div>
        {open ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
      </button>
      {open && <div style={{ padding: '20px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>{children}</div>}
    </div>
  )
}

function Step({ num, title, children }: any) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{num}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

function Tip({ children }: any) {
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1e40af', marginBottom: 12 }}>
      💡 {children}
    </div>
  )
}

function Warn({ children }: any) {
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 12 }}>
      ⚠️ {children}
    </div>
  )
}

const models = [
  { name: 'deepseek-chat', provider: 'DeepSeek', desc: 'DeepSeek V3，中文优化，性价比高', badge: '推荐' },
  { name: 'deepseek-reasoner', provider: 'DeepSeek', desc: 'DeepSeek R1，深度推理模型', badge: '' },
  { name: 'claude-3-5-sonnet-20241022', provider: 'Anthropic', desc: 'Claude 3.5 Sonnet，综合能力最强', badge: '即将上线' },
  { name: 'gpt-4o', provider: 'OpenAI', desc: 'GPT-4o，强大多模态能力', badge: '即将上线' },
  { name: 'gpt-4o-mini', provider: 'OpenAI', desc: 'GPT-4o Mini，高性价比', badge: '即将上线' },
]

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState('python')

  const codeExamples: Record<string, string> = {
    python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-你的令牌",  # 替换为你的 API 令牌
    base_url="${BASE_URL}"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "你是一个智能助手"},
        {"role": "user", "content": "你好，请介绍一下自己"}
    ]
)

print(response.choices[0].message.content)`,

    nodejs: `import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'sk-你的令牌',  // 替换为你的 API 令牌
  baseURL: '${BASE_URL}'
})

const response = await client.chat.completions.create({
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: '你是一个智能助手' },
    { role: 'user', content: '你好，请介绍一下自己' }
  ]
})

console.log(response.choices[0].message.content)`,

    curl: `curl ${BASE_URL}/chat/completions \\
  -H "Authorization: Bearer sk-你的令牌" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "system", "content": "你是一个智能助手"},
      {"role": "user", "content": "你好，请介绍一下自己"}
    ]
  }'`,

    stream: `from openai import OpenAI

client = OpenAI(
    api_key="sk-你的令牌",
    base_url="${BASE_URL}"
)

# 流式输出
stream = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "写一首关于春天的诗"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)`,
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {/* 头部 */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={18} color="white" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>接入文档</h2>
        </div>
        <p style={{ color: 'var(--muted)', lineHeight: 1.8 }}>
          灵镜AI 完全兼容 OpenAI 接口格式，只需将 <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>base_url</code> 替换为我们的地址，即可无缝切换所有支持的 AI 模型。
        </p>
      </div>

      {/* 快速信息卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'API 地址', value: BASE_URL, mono: true },
          { label: '接口格式', value: '兼容 OpenAI', mono: false },
          { label: '认证方式', value: 'Bearer Token', mono: false },
          { label: '当前可用模型', value: 'DeepSeek 系列', mono: false },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontWeight: 600, fontSize: 13, fontFamily: item.mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* 快速开始 */}
      <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--primary)' }}>
        <h3 style={{ fontWeight: 700, marginBottom: 20, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={18} color="var(--primary)" /> 快速开始（3步接入）
        </h3>

        <Step num={1} title="注册账号并获取 API 令牌">
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>登录灵镜AI，进入「API 令牌」页面，点击「新建令牌」，复制生成的令牌。</p>
          <Tip>令牌格式为 <code>sk-xxxxxxxx</code>，请妥善保管，不要泄露给他人。</Tip>
        </Step>

        <Step num={2} title="充值获取额度">
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>进入「充值」页面，选择适合的套餐或使用充值码充值额度，充值后可立即使用。</p>
        </Step>

        <Step num={3} title="调用 API">
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>选择你熟悉的语言，复制以下代码，替换令牌后即可运行。</p>

          {/* 语言切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { key: 'python', label: 'Python' },
              { key: 'nodejs', label: 'Node.js' },
              { key: 'curl', label: 'cURL' },
              { key: 'stream', label: '流式输出' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`btn btn-sm ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <CodeBlock code={codeExamples[activeTab]} language={activeTab === 'curl' ? 'bash' : activeTab === 'stream' ? 'python' : activeTab} />

          <Tip>运行前请先安装依赖：Python 执行 <code>pip install openai</code>，Node.js 执行 <code>npm install openai</code></Tip>
        </Step>
      </div>

      {/* 支持的模型 */}
      <Section title="支持的模型" icon={Zap} defaultOpen={true}>
        <div style={{ marginBottom: 12 }}>
          <Warn>以下模型持续更新中，Claude、GPT-4o、豆包、千问等模型即将上线。</Warn>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>模型名称</th><th>提供商</th><th>说明</th><th>状态</th></tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr key={m.name}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ModelIcon modelName={m.name} size={22} /><code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>{m.name}</code></div></td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{m.provider}</td>
                  <td style={{ fontSize: 13 }}>{m.desc}</td>
                  <td>
                    {m.badge === '推荐' && <span className="badge badge-green">{m.badge}</span>}
                    {m.badge === '即将上线' && <span className="badge badge-gray">{m.badge}</span>}
                    {m.badge === '' && <span className="badge badge-green">可用</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 客户端接入 */}
      <Section title="客户端工具接入" icon={Monitor}>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>不会写代码？使用以下客户端工具，填入配置即可直接使用 AI。</p>

        {/* ChatBox */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Monitor size={16} /> ChatBox（桌面客户端，推荐新手）
          </h4>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>ChatBox 是一款支持多平台的 AI 桌面客户端，界面美观，适合日常对话使用。</p>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>配置步骤：</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '下载 ChatBox：访问 chatboxai.app 下载安装',
                '打开设置 → 模型服务 → 选择 OpenAI API',
                `API 域名填入：${BASE_URL}`,
                'API Key 填入：你的 API 令牌（sk-xxxxxxxx）',
                '模型选择：deepseek-chat',
                '保存后即可开始对话',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cherry Studio */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Monitor size={16} /> Cherry Studio
          </h4>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>Cherry Studio 支持多模型管理，适合需要频繁切换模型的用户。</p>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>配置步骤：</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '下载 Cherry Studio：访问 cherry-ai.com 下载安装',
                '打开设置 → 模型服务商 → 添加服务商',
                '服务商类型选择：OpenAI Compatible',
                `API 地址填入：${BASE_URL}`,
                'API Key 填入：你的 API 令牌',
                '添加模型：deepseek-chat',
                '保存后在对话页面选择对应模型',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cursor */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code size={16} /> Cursor 编辑器（开发者专用）
          </h4>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>Cursor 是 AI 驱动的代码编辑器，接入灵镜AI后可使用 DeepSeek 等模型辅助编程。</p>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>配置步骤：</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '打开 Cursor → Settings → Models',
                '点击 Add Model，输入模型名称：deepseek-chat',
                '找到 OpenAI API Key 输入框，填入你的令牌',
                `找到 Override OpenAI Base URL，填入：${BASE_URL}`,
                '保存设置，即可在 Cursor 中使用 DeepSeek 模型',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 沉浸式翻译 */}
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={16} /> 沉浸式翻译（浏览器插件）
          </h4>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>沉浸式翻译是一款网页双语翻译插件，接入灵镜AI后翻译质量更高。</p>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>配置步骤：</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '安装沉浸式翻译浏览器插件',
                '打开插件设置 → 翻译服务 → OpenAI',
                `API URL 填入：${BASE_URL}`,
                'API Key 填入：你的 API 令牌',
                '模型填入：deepseek-chat',
                '保存后浏览网页即可自动翻译',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* OpenCat */}
        <div>
          <h4 style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Smartphone size={16} /> OpenCat（手机端）
          </h4>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>OpenCat 是 iOS/macOS 上的 AI 客户端，支持自定义 API 接入。</p>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>配置步骤：</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '在 App Store 下载 OpenCat',
                '打开设置 → API 配置',
                `API Host 填入：${BASE_URL}`,
                'API Key 填入：你的 API 令牌',
                '模型填入：deepseek-chat',
                '保存后即可在手机上使用',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 常见问题 */}
      <Section title="常见问题 FAQ" icon={BookOpen}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { q: '如何获取 API 令牌？', a: '登录灵镜AI后，点击左侧菜单「API 令牌」→「新建令牌」，填写名称后创建，复制生成的 sk- 开头的令牌即可。' },
            { q: '额度不足怎么办？', a: '进入「充值」页面，选择套餐完成支付，或输入充值码兑换额度。额度充值后立即生效，可在「概览」页面查看余额。' },
            { q: '如何查看 API 用量？', a: '登录后点击「用量日志」，可以查看每次调用的模型、Token 消耗和费用明细。' },
            { q: '支持流式输出（Streaming）吗？', a: '支持。在请求参数中设置 stream: true 即可开启流式输出，实时接收生成内容。具体示例见上方「流式输出」代码。' },
            { q: '令牌泄露了怎么办？', a: '立即进入「API 令牌」页面删除已泄露的令牌，然后重新创建一个新令牌。删除后旧令牌立即失效。' },
            { q: '后续会支持哪些模型？', a: 'Claude 3.5、GPT-4o、豆包、通义千问、月之暗面等主流模型正在接入中，上线后会在模型列表中显示，敬请期待。' },
            { q: '调用时报错 401 是什么原因？', a: '401 表示认证失败，请检查：1）令牌是否正确填写；2）令牌是否已被删除；3）请求头格式是否为 Authorization: Bearer sk-xxx。' },
            { q: '调用时报错 429 是什么原因？', a: '429 表示请求频率超限，请稍等片刻后重试，或联系客服提升限额。' },
          ].map((item, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--primary)' }}>Q: {item.q}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>A: {item.a}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
