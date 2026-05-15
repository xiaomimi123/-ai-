import { useState } from 'react'
import {
  Copy, Check, ChevronDown, ChevronRight, Zap, Code, BookOpen, Monitor, Smartphone, Globe,
  Shield, Activity, Layers, Clock, Image as ImageIcon,
} from 'lucide-react'
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
      <div style={{ background: 'var(--primary)', borderRadius: 10, padding: '16px 20px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: 'var(--accent)', lineHeight: 1.7, overflowX: 'auto' }}>
        <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{language}</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre>
      </div>
      <button onClick={copy} style={{ position: 'absolute', top: 12, right: 12, background: copied ? 'var(--accent)' : 'rgba(234,247,239,.15)', border: 'none', borderRadius: 6, padding: '4px 10px', color: copied ? 'var(--primary)' : 'var(--accent)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, transition: 'all .2s' }}>
        {copied ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 复制</>}
      </button>
    </div>
  )
}

function Section({ title, icon: Icon, children, defaultOpen = false }: any) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 14, border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: open ? 'var(--accent-light)' : 'var(--surface)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, color: open ? 'var(--primary)' : 'var(--text)' }}>
          <Icon size={18} color={open ? 'var(--accent)' : 'var(--muted)'} />
          {title}
        </div>
        {open ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
      </button>
      {open && <div style={{ padding: '20px', borderTop: '0.5px solid var(--border)', background: 'var(--surface)' }}>{children}</div>}
    </div>
  )
}

function Step({ num, title, children }: any) {
  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{num}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

function Tip({ children }: any) {
  return (
    <div style={{ background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--primary)', marginBottom: 12 }}>
      💡 {children}
    </div>
  )
}

// 模型列表与"模型广场"页保持一致（后端 model_prices 表种子数据）
// tag: 'featured' = 旗舰推荐；'new' = 新上线；undefined = 普通可用
type ModelRow = {
  name: string
  provider: string
  context: string
  desc: string
  tag?: 'featured' | 'new'
}
const models: ModelRow[] = [
  { name: 'claude-sonnet-4-6',   provider: 'Anthropic', context: '1M',   desc: '当前综合能力最强均衡模型，代码、长文档处理出众，SWE-bench 72.7%', tag: 'featured' },
  { name: 'claude-haiku-4-5',    provider: 'Anthropic', context: '200K', desc: '快速轻量版 Claude，响应迅速，高并发和简单任务首选' },
  { name: 'gpt-4o',              provider: 'OpenAI',    context: '128K', desc: '多模态旗舰，支持图文理解，开发者集成首选', tag: 'featured' },
  { name: 'gpt-4o-mini',         provider: 'OpenAI',    context: '128K', desc: '轻量快速版 GPT-4o，价格实惠，适合批量处理' },
  { name: 'o3',                  provider: 'OpenAI',    context: '200K', desc: '顶级推理模型，竞赛数学与复杂分析场景首选' },
  { name: 'gemini-2.5-pro',      provider: 'Google',    context: '1M',   desc: '多模态旗舰，原生视频理解，超长上下文处理卓越' },
  { name: 'gemini-2.5-flash',    provider: 'Google',    context: '1M',   desc: '高性价比 Gemini，速度极快，支持百万级上下文' },
  { name: 'deepseek-chat',       provider: 'DeepSeek',  context: '64K',  desc: 'DeepSeek V3 旗舰，中文优化，综合性价比之王', tag: 'featured' },
  { name: 'deepseek-reasoner',   provider: 'DeepSeek',  context: '64K',  desc: 'DeepSeek R1，深度推理模型，复杂逻辑与数学推导媲美 o1' },
  { name: 'qwen-max',            provider: '阿里云',    context: '1M',   desc: '通义千问旗舰版，中文理解和长文处理能力出众' },
]

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState('python')
  const [imgTab, setImgTab] = useState('python')

  const imageExamples: Record<string, string> = {
    curl: `# 1. 提交任务
TASK=$(curl -s -X POST ${BASE_URL}/images/generations \\
  -H "Authorization: Bearer sk-你的令牌" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-image-2",
    "prompt": "一只橘猫坐在窗台上看夕阳，水彩画风格",
    "size": "16:9",
    "resolution": "1k",
    "n": 1
  }')
TASK_ID=$(echo "$TASK" | grep -oE '"task_id":"[^"]+"' | head -1 | cut -d'"' -f4)
echo "task_id: $TASK_ID"

# 2. 轮询直到完成
while true; do
  RES=$(curl -s ${BASE_URL}/tasks/$TASK_ID \\
    -H "Authorization: Bearer sk-你的令牌")
  STATUS=$(echo "$RES" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)
  echo "status: $STATUS"
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    echo "$RES"
    break
  fi
  sleep 3
done`,

    python: `import time
import requests

API_KEY = "sk-你的令牌"
BASE = "${BASE_URL}"

# 1. 提交任务
resp = requests.post(
    f"{BASE}/images/generations",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "gpt-image-2",
        "prompt": "一只橘猫坐在窗台上看夕阳，水彩画风格",
        "size": "16:9",
        "resolution": "1k",
        "n": 1,
    },
)
task_id = resp.json()["data"][0]["task_id"]
print("task_id:", task_id)

# 2. 轮询直到完成
while True:
    res = requests.get(
        f"{BASE}/tasks/{task_id}",
        headers={"Authorization": f"Bearer {API_KEY}"},
    ).json()
    print("status:", res["status"], "progress:", res.get("progress"))
    if res["status"] in ("completed", "failed", "canceled"):
        break
    time.sleep(3)

# 3. 取图
if res["status"] == "completed":
    image_url = res["result"]["raw"]["data"]["result"]["images"][0]["url"][0]
    print("Image URL:", image_url)
else:
    print("Task ended:", res.get("error"))`,

    nodejs: `const API_KEY = "sk-你的令牌";
const BASE = "${BASE_URL}";

async function generate(prompt: string) {
  // 1. 提交任务
  const submit = await fetch(\`\${BASE}/images/generations\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size: "16:9",
      resolution: "1k",
      n: 1,
    }),
  });
  const { data } = await submit.json();
  const taskId = data[0].task_id;
  console.log("task_id:", taskId);

  // 2. 轮询直到完成
  while (true) {
    const r = await fetch(\`\${BASE}/tasks/\${taskId}\`, {
      headers: { "Authorization": \`Bearer \${API_KEY}\` },
    });
    const res = await r.json();
    console.log("status:", res.status, "progress:", res.progress);
    if (res.status === "completed") {
      return res.result.raw.data.result.images[0].url[0];
    }
    if (res.status === "failed" || res.status === "canceled") {
      throw new Error(res.error?.message || \`task \${res.status}\`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
}

generate("一只橘猫坐在窗台上看夕阳，水彩画风格").then(console.log);`,
  }

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
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="brand-logo" style={{ width: 32, height: 32, fontSize: 14, borderRadius: 8 }}>
            <BookOpen size={16} color="var(--accent)" />
          </div>
          <h2 className="page-title">接入文档</h2>
        </div>
        <p className="page-desc">
          灵镜 AI 完全兼容 OpenAI 接口格式，只需将 <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>base_url</code> 替换为我们的地址，即可调用 {models.length} 款全球主流大模型——包括 Claude、GPT-4o、Gemini、DeepSeek、o3、通义千问等全部旗舰，一套令牌、一份额度、随意切换。
        </p>
      </div>

      {/* 快速信息卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'API 地址', value: BASE_URL, mono: true },
          { label: '接口格式', value: '完全兼容 OpenAI', mono: false },
          { label: '认证方式', value: 'Bearer Token', mono: false },
          { label: '可用模型', value: `${models.length}+ 全球主流模型`, mono: false },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: 14, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontWeight: 600, fontSize: 13, fontFamily: item.mono ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit', wordBreak: 'break-all', color: item.mono ? 'var(--accent)' : 'var(--text)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* 稳定性保障（4 个指标卡） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 28 }}>
        {[
          { icon: Activity, title: '99.9% 可用性', desc: '香港节点 + 多渠道冗余，7×24 监控' },
          { icon: Clock,    title: '毫秒级响应',   desc: '边缘优化，首包延迟 < 200ms' },
          { icon: Layers,   title: '多渠道容灾',   desc: '单一渠道故障自动切换，不影响调用' },
          { icon: Shield,   title: '按量计费',     desc: '精确到 Token，无最低消费，余额永久有效' },
        ].map(item => (
          <div key={item.title} style={{
            background: 'var(--surface)', border: '0.5px solid var(--border)',
            borderRadius: 10, padding: 14, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <div style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: 8,
              background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <item.icon size={16} color="var(--accent)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 快速开始 */}
      <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent)' }}>
        <h3 style={{ fontWeight: 600, marginBottom: 20, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={18} color="var(--accent)" /> 快速开始（3 步接入）
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
                className={`btn btn-sm ${activeTab === tab.key ? 'btn-accent' : 'btn-outline'}`}
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
      <Section title={`支持的模型（共 ${models.length} 个，全部已开通）`} icon={Zap} defaultOpen={true}>
        <div style={{
          background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--primary)',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={14} color="var(--accent)" />
          下表所有模型均已接入、实时可用；新模型发布后会持续加入。
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>模型</th>
                <th>提供商</th>
                <th>上下文</th>
                <th>说明</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr key={m.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ModelIcon modelName={m.name} size={22} />
                      <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: 'var(--text)' }}>{m.name}</code>
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{m.provider}</td>
                  <td style={{ fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: 'var(--muted)' }}>{m.context}</td>
                  <td style={{ fontSize: 13 }}>{m.desc}</td>
                  <td>
                    {m.tag === 'featured' ? (
                      <span className="badge badge-green">旗舰</span>
                    ) : m.tag === 'new' ? (
                      <span className="badge badge-green">新上线</span>
                    ) : (
                      <span className="badge badge-green">可用</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.7 }}>
          💡 调用时 <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 3 }}>model</code> 参数填入上表的模型名即可。
          所有模型共享同一额度账户，无需重复充值；单次调用按实际 Token 精确计费。
          <br />如需了解单价详情，请前往 <a href="/models" style={{ color: 'var(--accent)' }}>模型广场</a> 查看。
        </div>
      </Section>

      {/* 异步图像生成 */}
      <Section title="异步图像生成 API（gpt-image-2 / gemini-2.5-flash-image / nano-banana）" icon={ImageIcon}>
        {/* 概述 */}
        <div style={{
          background: 'var(--accent-light)', borderLeft: '3px solid var(--accent)',
          borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--primary)',
          marginBottom: 20, lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>为什么是异步？</div>
          灵镜支持的图像生成模型（<code>gpt-image-2</code> / <code>gemini-2.5-flash-image</code> / <code>nano-banana</code> 等）单张耗时 <b>20–60 秒</b>，因此采用异步任务设计：提交后立即返回 <code>task_id</code>，轮询 <code>/v1/tasks/&#123;task_id&#125;</code> 拿结果。失败 / 取消会自动退还预扣额度。
        </div>

        {/* 1.2 提交任务 */}
        <h4 style={{ fontWeight: 600, marginBottom: 10, marginTop: 4, fontSize: 15, color: 'var(--text)' }}>1. 提交任务</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <span className="badge badge-green">POST</span>
          <code style={{ background: 'var(--bg)', padding: '3px 8px', borderRadius: 4, color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{BASE_URL}/images/generations</code>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>请求体：</div>
        <CodeBlock language="json" code={`{
  "model": "gpt-image-2",
  "prompt": "一只橘猫坐在窗台上看夕阳，水彩画风格",
  "n": 1,
  "size": "16:9",
  "resolution": "1k"
}`} />
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>响应（HTTP 200）：</div>
        <CodeBlock language="json" code={`{
  "created": 1747156804,
  "data": [
    {
      "task_id": "task_859be413-68c1-41c8-9488-660e70fd9204",
      "status": "submitted"
    }
  ]
}`} />

        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>类型</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>model</code></td><td style={{ color: 'var(--muted)' }}>string</td><td>模型 ID，见下方支持列表</td></tr>
              <tr><td><code>prompt</code></td><td style={{ color: 'var(--muted)' }}>string</td><td>提示词（最多 1000 字符）</td></tr>
              <tr><td><code>n</code></td><td style={{ color: 'var(--muted)' }}>int</td><td>生成数量，默认 <code>1</code></td></tr>
              <tr><td><code>size</code></td><td style={{ color: 'var(--muted)' }}>string</td><td>比例，推荐 <code>16:9</code> / <code>1:1</code> / <code>9:16</code> / <code>4:3</code> / <code>3:4</code></td></tr>
              <tr><td><code>resolution</code></td><td style={{ color: 'var(--muted)' }}>string</td><td>分辨率档位 <code>1k</code> / <code>2k</code> / <code>4k</code></td></tr>
            </tbody>
          </table>
        </div>

        {/* 1.3 查询任务状态 */}
        <h4 style={{ fontWeight: 600, marginBottom: 10, fontSize: 15, color: 'var(--text)' }}>2. 查询任务状态</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <span className="badge badge-green">GET</span>
          <code style={{ background: 'var(--bg)', padding: '3px 8px', borderRadius: 4, color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{BASE_URL}/tasks/&#123;task_id&#125;</code>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>处理中响应：</div>
        <CodeBlock language="json" code={`{
  "id": "task_859be413-...",
  "status": "in_progress",
  "progress": 50,
  "created_at": 1747156804
}`} />
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>完成响应：</div>
        <CodeBlock language="json" code={`{
  "id": "task_859be413-...",
  "status": "completed",
  "progress": 100,
  "created_at": 1747156804,
  "completed_at": 1747156852,
  "result": {
    "raw": {
      "data": {
        "result": {
          "images": [
            {
              "url": ["https://upload.apimart.ai/.../image.png"],
              "expires_at": 1747243204
            }
          ]
        }
      }
    }
  },
  "usage": {
    "cost_quota": 1024,
    "cost_usd": 0.002048
  }
}`} />

        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}><code>status</code> 取值：</div>
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>状态</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>submitted</code></td><td>已提交，等待上游处理</td></tr>
              <tr><td><code>queued</code></td><td>上游排队中</td></tr>
              <tr><td><code>in_progress</code></td><td>上游处理中</td></tr>
              <tr><td><code>completed</code></td><td>完成（含结果图）</td></tr>
              <tr><td><code>failed</code></td><td>失败（自动退款）</td></tr>
              <tr><td><code>canceled</code></td><td>用户主动取消（自动退款）</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{
          background: '#fef3c7', borderLeft: '3px solid #f59e0b',
          borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#7c2d12',
          marginBottom: 24,
        }}>
          ⚠️ 图片 URL <b>24 小时内有效</b>，请尽快下载或转存到自家 CDN，过期后将无法访问。
        </div>

        {/* 1.4 批量查询 */}
        <h4 style={{ fontWeight: 600, marginBottom: 10, fontSize: 15, color: 'var(--text)' }}>3. 批量查询</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <span className="badge badge-green">POST</span>
          <code style={{ background: 'var(--bg)', padding: '3px 8px', borderRadius: 4, color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{BASE_URL}/tasks/batch</code>
        </div>
        <CodeBlock language="json" code={`{
  "task_ids": ["task_xxx", "task_yyy"]
}`} />
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
          适用场景：playground 同时跑多个任务时合并查询请求，节省 RTT。
        </div>

        {/* 1.5 取消任务 */}
        <h4 style={{ fontWeight: 600, marginBottom: 10, fontSize: 15, color: 'var(--text)' }}>4. 取消任务</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <span className="badge badge-green">POST</span>
          <code style={{ background: 'var(--bg)', padding: '3px 8px', borderRadius: 4, color: 'var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{BASE_URL}/tasks/&#123;task_id&#125;/cancel</code>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
          只在 <code>submitted</code> / <code>queued</code> / <code>in_progress</code> 状态下可取消。取消后状态转 <code>canceled</code>，预扣额度全额退还。
        </div>

        {/* 1.6 支持模型 */}
        <h4 style={{ fontWeight: 600, marginBottom: 10, fontSize: 15, color: 'var(--text)' }}>5. 当前支持的图像模型</h4>
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th>Model ID</th>
                <th>提供方</th>
                <th>单张耗时</th>
                <th>单张价格</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>gpt-image-2</code></td>
                <td style={{ color: 'var(--muted)' }}>apimart</td>
                <td style={{ color: 'var(--muted)' }}>30–60 秒</td>
                <td style={{ color: 'var(--accent)', fontWeight: 600 }}>$0.006</td>
              </tr>
              <tr>
                <td><code>gemini-2.5-flash-image</code></td>
                <td style={{ color: 'var(--muted)' }}>apimart</td>
                <td style={{ color: 'var(--muted)' }}>20–40 秒</td>
                <td style={{ color: 'var(--accent)', fontWeight: 600 }}>$0.0078</td>
              </tr>
              <tr>
                <td><code>nano-banana</code></td>
                <td style={{ color: 'var(--muted)' }}>apimart (alias)</td>
                <td style={{ color: 'var(--muted)' }}>20–40 秒</td>
                <td style={{ color: 'var(--accent)', fontWeight: 600 }}>$0.0078</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 1.7 完整代码示例 */}
        <h4 style={{ fontWeight: 600, marginBottom: 10, fontSize: 15, color: 'var(--text)' }}>6. 完整代码示例（提交 → 轮询 → 取图）</h4>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { key: 'python', label: 'Python' },
            { key: 'nodejs', label: 'Node.js' },
            { key: 'curl', label: 'cURL' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setImgTab(tab.key)}
              className={`btn btn-sm ${imgTab === tab.key ? 'btn-accent' : 'btn-outline'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <CodeBlock code={imageExamples[imgTab]} language={imgTab === 'curl' ? 'bash' : imgTab === 'nodejs' ? 'typescript' : 'python'} />

        <Tip>
          推荐轮询间隔 3 秒；首次查询可在 5 秒后进行，避免无谓的 in_progress 命中。批量任务建议改用 <code>/v1/tasks/batch</code>。
        </Tip>
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
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, fontSize: 13, border: '0.5px solid var(--border)' }}>
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
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, fontSize: 13, border: '0.5px solid var(--border)' }}>
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
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, fontSize: 13, border: '0.5px solid var(--border)' }}>
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
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, fontSize: 13, border: '0.5px solid var(--border)' }}>
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
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, fontSize: 13, border: '0.5px solid var(--border)' }}>
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
            { q: '目前支持哪些模型？', a: `灵镜 AI 已全面接入 Anthropic、OpenAI、Google、DeepSeek、阿里云等厂商的 ${models.length} 款主流模型（Claude Sonnet 4.6、GPT-4o、Gemini 2.5 Pro、DeepSeek V3/R1、o3、Qwen Max 等），所有模型即开即用，一份额度通用全部渠道；后续新模型发布后会持续加入，可在「模型广场」页面查看实时列表与价格。` },
            { q: '图像生成（gpt-image-2 / nano-banana）为什么是异步的？', a: '图像模型单张耗时 20–60 秒，远超 HTTP 网关空闲超时；因此采用异步任务 —— 提交后拿 task_id，再轮询 /v1/tasks/{task_id}。轮询间隔建议 3 秒，首次查询建议在提交 5 秒后再发起。任务失败或主动取消时预扣额度会自动退还。' },
            { q: '生成的图片 URL 能保存多久？', a: '图片 URL 默认 24 小时内有效（response 里 expires_at 字段是准确的过期时间戳）。生产环境建议拿到图后立即下载或转存到自家 OSS / CDN，不要直接把上游 URL 返回给前端。' },
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
