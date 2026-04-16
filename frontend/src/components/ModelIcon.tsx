import { useState } from 'react'

const LOGO_MAP: Record<string, string> = {
  'deepseek': 'deepseek', 'deepseek-chat': 'deepseek', 'deepseek-coder': 'deepseek', 'deepseek-reasoner': 'deepseek', 'deepseek-r1': 'deepseek',
  'gpt-4': 'openai', 'gpt-4o': 'openai', 'gpt-4o-mini': 'openai', 'gpt-4-turbo': 'openai', 'gpt-3.5': 'openai', 'gpt-3.5-turbo': 'openai', 'o1': 'openai', 'o1-mini': 'openai', 'o3': 'openai',
  'claude': 'claude', 'claude-3': 'claude', 'claude-3-5-sonnet': 'claude', 'claude-3-opus': 'claude', 'claude-3-haiku': 'claude',
  'doubao': 'doubao', 'qwen': 'qwen', 'qwen-max': 'qwen', 'qwen-plus': 'qwen', 'qwen-turbo': 'qwen',
  'moonshot': 'moonshot', 'kimi': 'moonshot', 'gemini': 'gemini', 'gemini-pro': 'gemini', 'gemini-flash': 'gemini',
  'mistral': 'mistral', 'grok': 'grok', 'spark': 'spark', 'hunyuan': 'hunyuan', 'minimax': 'minimax', 'ernie': 'wenxin', 'wenxin': 'wenxin',
}

const BRAND_COLORS: Record<string, string> = {
  'deepseek': '#1e3a8a', 'openai': '#10a37f', 'claude': '#d97706', 'doubao': '#1e40af',
  'qwen': '#f97316', 'moonshot': '#7c3aed', 'gemini': '#4285f4', 'mistral': '#ff7000',
  'grok': '#000000', 'hunyuan': '#1a56db', 'minimax': '#6366f1', 'default': '#6b7280',
}

function getLogoKey(modelName: string): string {
  if (!modelName) return ''
  const lower = modelName.toLowerCase()
  if (LOGO_MAP[lower]) return LOGO_MAP[lower]
  for (const [key, value] of Object.entries(LOGO_MAP)) {
    if (lower.startsWith(key)) return value
  }
  if (lower.includes('deepseek')) return 'deepseek'
  if (lower.includes('gpt') || lower.includes('openai')) return 'openai'
  if (lower.includes('claude') || lower.includes('anthropic')) return 'claude'
  if (lower.includes('doubao')) return 'doubao'
  if (lower.includes('qwen')) return 'qwen'
  if (lower.includes('moonshot') || lower.includes('kimi')) return 'moonshot'
  if (lower.includes('gemini')) return 'gemini'
  if (lower.includes('grok')) return 'grok'
  if (lower.includes('hunyuan')) return 'hunyuan'
  if (lower.includes('minimax')) return 'minimax'
  if (lower.includes('spark')) return 'spark'
  return ''
}

// logo 参数优先于从 modelName 推断的品牌名。数据库里 model_prices.logo 存的是 LobeHub icon key（如 "deepseek" / "openai"）
export default function ModelIcon({ modelName, logo, size = 32, style }: { modelName: string; logo?: string; size?: number; style?: React.CSSProperties }) {
  const [error, setError] = useState(false)
  const logoKey = (logo && logo.trim()) ? logo.trim().toLowerCase() : getLogoKey(modelName)
  const color = BRAND_COLORS[logoKey] || BRAND_COLORS['default']
  const radius = Math.round(size * 0.25)

  if (!logoKey || error) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, background: color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.38), fontWeight: 700, flexShrink: 0, ...style }}>
        {modelName?.charAt(0)?.toUpperCase() || '?'}
      </div>
    )
  }

  return (
    <img src={`https://unpkg.com/@lobehub/icons-static-png@latest/light/${logoKey}.png`}
      width={size} height={size} alt={modelName}
      style={{ borderRadius: radius, objectFit: 'contain', flexShrink: 0, ...style }}
      onError={() => setError(true)} />
  )
}
