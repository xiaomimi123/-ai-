import React from 'react'

const MODEL_LOGO_MAP: Record<string, string> = {
  'deepseek': 'deepseek', 'deepseek-chat': 'deepseek', 'deepseek-coder': 'deepseek', 'deepseek-reasoner': 'deepseek', 'deepseek-r1': 'deepseek',
  'gpt-4': 'openai', 'gpt-4o': 'openai', 'gpt-4o-mini': 'openai', 'gpt-4-turbo': 'openai', 'gpt-3.5': 'openai', 'gpt-3.5-turbo': 'openai', 'o1': 'openai', 'o1-mini': 'openai', 'o3': 'openai',
  'claude': 'claude', 'claude-3': 'claude', 'claude-3-5': 'claude', 'claude-3-opus': 'claude', 'claude-3-sonnet': 'claude', 'claude-3-haiku': 'claude',
  'doubao': 'doubao', 'qwen': 'qwen', 'qwen-max': 'qwen', 'qwen-plus': 'qwen', 'qwen-turbo': 'qwen',
  'moonshot': 'moonshot', 'kimi': 'moonshot', 'gemini': 'gemini', 'gemini-pro': 'gemini', 'gemini-flash': 'gemini',
  'mistral': 'mistral', 'grok': 'grok', 'spark': 'spark', 'hunyuan': 'hunyuan', 'minimax': 'minimax', 'ernie': 'wenxin', 'wenxin': 'wenxin',
}

function getLogoKey(modelName: string): string {
  const lower = modelName.toLowerCase()
  if (MODEL_LOGO_MAP[lower]) return MODEL_LOGO_MAP[lower]
  for (const [key, value] of Object.entries(MODEL_LOGO_MAP)) {
    if (lower.startsWith(key)) return value
  }
  return ''
}

const PROVIDER_COLORS: Record<string, { bg: string; text: string }> = {
  'deepseek': { bg: '#1e3a8a', text: 'white' }, 'openai': { bg: '#10a37f', text: 'white' },
  'claude': { bg: '#d97706', text: 'white' }, 'doubao': { bg: '#1e40af', text: 'white' },
  'qwen': { bg: '#f97316', text: 'white' }, 'moonshot': { bg: '#7c3aed', text: 'white' },
  'gemini': { bg: '#4285f4', text: 'white' }, 'mistral': { bg: '#ff7000', text: 'white' },
  'grok': { bg: '#000000', text: 'white' }, 'default': { bg: '#6b7280', text: 'white' },
}

export default function ModelIcon({ modelName, size = 32, style }: { modelName: string; size?: number; style?: React.CSSProperties }) {
  const [imgError, setImgError] = React.useState(false)
  const logoKey = getLogoKey(modelName)
  const colors = PROVIDER_COLORS[logoKey] || PROVIDER_COLORS['default']

  if (!logoKey || imgError) {
    return (
      <div style={{ width: size, height: size, borderRadius: size * 0.25, background: colors.bg, color: colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, flexShrink: 0, ...style }}>
        {modelName.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <img src={`https://unpkg.com/@lobehub/icons-static-png@latest/light/${logoKey}.png`}
      width={size} height={size} alt={modelName}
      style={{ borderRadius: size * 0.25, objectFit: 'contain', flexShrink: 0, ...style }}
      onError={() => setImgError(true)} />
  )
}
