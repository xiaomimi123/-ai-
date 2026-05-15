import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Check } from 'lucide-react'
import ModelIcon from '../components/ModelIcon'
import { apiUrl } from '../api'
import { isImageModel } from '../utils/modelPricing'

interface ModelPrice {
  id: number
  model_id: string
  name: string
  provider: string
  description: string
  input_price: number
  output_price: number
  logo?: string
  context_window?: string
  tags?: string  // 逗号分隔，用于检测是否图像模型（"画图"）
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div style={{ position: 'relative', marginBottom: 4 }}>
      <div style={{ background: 'var(--primary)', borderRadius: 10, padding: '16px 20px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: 'var(--accent)', lineHeight: 1.7, overflowX: 'auto' }}>
        <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>{lang}</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{code}</pre>
      </div>
      <button onClick={copy} style={{ position: 'absolute', top: 10, right: 10, background: copied ? 'var(--accent)' : 'rgba(234,247,239,.15)', border: 'none', borderRadius: 6, padding: '4px 10px', color: copied ? 'var(--primary)' : 'var(--accent)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, transition: 'all .2s' }}>
        {copied ? <><Check size={12} />已复制</> : <><Copy size={12} />复制</>}
      </button>
    </div>
  )
}

export default function ModelDetailPage() {
  const { modelName } = useParams<{ modelName: string }>()
  const navigate = useNavigate()
  const [model, setModel] = useState<ModelPrice | null>(null)
  const [activeTab, setActiveTab] = useState('python')
  const [loading, setLoading] = useState(true)
  // 给用户文档展示用：API 调用走 api 子域名（绕 CF，保流式 + 高速）
  const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://api.aitoken.homes').replace(/\/$/, '') + '/v1'

  useEffect(() => {
    fetch(apiUrl('/api/lingjing/model-prices')).then(r => r.json()).then(r => {
      if (r.success) setModel((r.data || []).find((m: ModelPrice) => m.model_id === modelName) || null)
    }).finally(() => setLoading(false))
  }, [modelName])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>加载中...</div>
  if (!model) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>模型不存在</div>
      <button className="btn btn-outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> 返回</button>
    </div>
  )

  const isImage = isImageModel(model.tags)

  const chatCodes: Record<string, string> = {
    python: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="sk-你的令牌",\n    base_url="${BASE_URL}"\n)\n\nresponse = client.chat.completions.create(\n    model="${model.model_id}",\n    messages=[\n        {"role": "system", "content": "你是一个智能助手"},\n        {"role": "user", "content": "你好！"}\n    ]\n)\n\nprint(response.choices[0].message.content)`,
    nodejs: `import OpenAI from 'openai'\n\nconst client = new OpenAI({\n  apiKey: 'sk-你的令牌',\n  baseURL: '${BASE_URL}'\n})\n\nconst response = await client.chat.completions.create({\n  model: '${model.model_id}',\n  messages: [\n    { role: 'system', content: '你是一个智能助手' },\n    { role: 'user', content: '你好！' }\n  ]\n})\n\nconsole.log(response.choices[0].message.content)`,
    curl: `curl ${BASE_URL}/chat/completions \\\n  -H "Authorization: Bearer sk-你的令牌" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${model.model_id}",\n    "messages": [\n      {"role": "user", "content": "你好！"}\n    ]\n  }'`,
    stream: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="sk-你的令牌",\n    base_url="${BASE_URL}"\n)\n\nstream = client.chat.completions.create(\n    model="${model.model_id}",\n    messages=[{"role": "user", "content": "你好！"}],\n    stream=True\n)\n\nfor chunk in stream:\n    if chunk.choices[0].delta.content:\n        print(chunk.choices[0].delta.content, end="", flush=True)`,
  }

  const imageCodes: Record<string, string> = {
    python: `import time\nimport requests\n\nAPI_KEY = "sk-你的令牌"\nBASE = "${BASE_URL}"\n\n# 1. 提交异步任务\nresp = requests.post(\n    f"{BASE}/images/generations",\n    headers={"Authorization": f"Bearer {API_KEY}"},\n    json={\n        "model": "${model.model_id}",\n        "prompt": "一只橘猫坐在窗台上看夕阳",\n        "size": "16:9",\n        "resolution": "1k",\n        "n": 1,\n    },\n)\ntask_id = resp.json()["data"][0]["task_id"]\nprint("task_id:", task_id)\n\n# 2. 轮询任务状态（约 20-60 秒完成）\nwhile True:\n    res = requests.get(\n        f"{BASE}/tasks/{task_id}",\n        headers={"Authorization": f"Bearer {API_KEY}"},\n    ).json()\n    print("status:", res["status"], "progress:", res.get("progress"))\n    if res["status"] in ("completed", "failed", "canceled"):\n        break\n    time.sleep(3)\n\n# 3. 取图片 URL\nif res["status"] == "completed":\n    image_url = res["result"]["raw"]["data"]["result"]["images"][0]["url"][0]\n    print("Image URL:", image_url)\nelse:\n    print("Task ended:", res.get("error"))`,
    nodejs: `const API_KEY = "sk-你的令牌";\nconst BASE = "${BASE_URL}";\n\nasync function generate(prompt) {\n  // 1. 提交异步任务\n  const submit = await fetch(\`\${BASE}/images/generations\`, {\n    method: "POST",\n    headers: {\n      "Authorization": \`Bearer \${API_KEY}\`,\n      "Content-Type": "application/json",\n    },\n    body: JSON.stringify({\n      model: "${model.model_id}",\n      prompt,\n      size: "16:9",\n      resolution: "1k",\n      n: 1,\n    }),\n  });\n  const { data } = await submit.json();\n  const taskId = data[0].task_id;\n  console.log("task_id:", taskId);\n\n  // 2. 轮询任务状态\n  while (true) {\n    const r = await fetch(\`\${BASE}/tasks/\${taskId}\`, {\n      headers: { "Authorization": \`Bearer \${API_KEY}\` },\n    });\n    const res = await r.json();\n    console.log("status:", res.status, "progress:", res.progress);\n    if (res.status === "completed") {\n      return res.result.raw.data.result.images[0].url[0];\n    }\n    if (res.status === "failed" || res.status === "canceled") {\n      throw new Error(res.error?.message || \`task \${res.status}\`);\n    }\n    await new Promise(r => setTimeout(r, 3000));\n  }\n}\n\ngenerate("一只橘猫坐在窗台上看夕阳").then(console.log).catch(console.error);`,
    curl: `# 1. 提交异步任务\nTASK=$(curl -s -X POST ${BASE_URL}/images/generations \\\n  -H "Authorization: Bearer sk-你的令牌" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "${model.model_id}",\n    "prompt": "一只橘猫坐在窗台上看夕阳",\n    "size": "16:9",\n    "resolution": "1k",\n    "n": 1\n  }')\nTASK_ID=$(echo "$TASK" | grep -oE '"task_id":"[^"]+"' | head -1 | cut -d'"' -f4)\necho "task_id: $TASK_ID"\n\n# 2. 轮询任务状态\nwhile true; do\n  RES=$(curl -s ${BASE_URL}/tasks/$TASK_ID \\\n    -H "Authorization: Bearer sk-你的令牌")\n  STATUS=$(echo "$RES" | grep -oE '"status":"[^"]+"' | head -1 | cut -d'"' -f4)\n  echo "status: $STATUS"\n  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then\n    echo "$RES"\n    break\n  fi\n  sleep 3\ndone`,
  }

  const codes: Record<string, string> = isImage ? imageCodes : chatCodes
  // 图像模型没有 stream tab，若残留 activeTab=stream 则回落到 python
  const safeTab = codes[activeTab] ? activeTab : 'python'
  const tabs = isImage
    ? [{ key: 'python', label: 'Python' }, { key: 'nodejs', label: 'Node.js' }, { key: 'curl', label: 'cURL' }]
    : [{ key: 'python', label: 'Python' }, { key: 'nodejs', label: 'Node.js' }, { key: 'curl', label: 'cURL' }, { key: 'stream', label: '流式输出' }]

  return (
    <div style={{ maxWidth: 800 }}>
      <button onClick={() => navigate(-1)} className="btn btn-outline" style={{ marginBottom: 24 }}>
        <ArrowLeft size={15} /> 返回模型广场
      </button>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <ModelIcon modelName={model.model_id} logo={model.logo} size={56} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{model.name || model.model_id}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>by {model.provider}</span>
              <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: 'var(--accent)' }}>{model.model_id}</code>
              {model.context_window && <span className="badge badge-blue">{model.context_window}</span>}
            </div>
          </div>
        </div>
        {model.description && <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.8 }}>{model.description}</p>}
      </div>

      {isImageModel(model.tags) ? (
        // 图像模型：按"每张图"展示，铺满一行
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 20 }}>
          <div className="card" style={{ textAlign: 'center', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>单张价格</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>${(model.input_price ?? 0).toFixed(4)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>/ 张</div>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div className="card" style={{ textAlign: 'center', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>输入价格</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>${(model.input_price ?? 0).toFixed(2)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>/ 百万 Token</div>
          </div>
          <div className="card" style={{ textAlign: 'center', borderLeft: '3px solid var(--primary)' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>输出价格</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>${(model.output_price ?? 0).toFixed(2)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>/ 百万 Token</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 16 }}>API 调用示例</h3>
        <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)' }}>
          Base URL：<code style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 4, color: 'var(--accent)' }}>{BASE_URL}</code>
          &nbsp;&nbsp;模型：<code style={{ background: 'var(--bg)', padding: '2px 8px', borderRadius: 4 }}>{model.model_id}</code>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`btn btn-sm ${safeTab === tab.key ? 'btn-accent' : 'btn-outline'}`}>{tab.label}</button>
          ))}
        </div>
        <CodeBlock code={codes[safeTab]} lang={safeTab === 'curl' ? 'bash' : safeTab === 'stream' ? 'python' : safeTab} />
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 13, color: 'var(--primary)', borderLeft: '3px solid var(--accent)' }}>
          {isImage ? (
            <>💡 将 <code>sk-你的令牌</code> 替换为你的实际令牌。图像生成为<b>异步任务</b>，单张耗时约 20–60 秒，需轮询 <code>/v1/tasks/&#123;task_id&#125;</code> 获取结果。Python 依赖：<code>pip install requests</code>。</>
          ) : (
            <>💡 将 <code>sk-你的令牌</code> 替换为你的实际令牌。Python: <code>pip install openai</code>，Node.js: <code>npm install openai</code></>
          )}
        </div>
      </div>
    </div>
  )
}
