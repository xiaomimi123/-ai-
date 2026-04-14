import React from 'react'

// 供应商品牌色 + 首字母图标
const providerStyles: Record<string, { bg: string; color: string; letter: string }> = {
  'OpenAI':        { bg: '#10a37f', color: '#fff', letter: 'O' },
  'Anthropic':     { bg: '#d4a27f', color: '#fff', letter: 'A' },
  'Google Gemini': { bg: '#4285f4', color: '#fff', letter: 'G' },
  'Meta Llama':    { bg: '#0668E1', color: '#fff', letter: 'M' },
  'Mistral':       { bg: '#ff7000', color: '#fff', letter: 'Mi' },
  'DeepSeek':      { bg: '#4D6BFE', color: '#fff', letter: 'DS' },
  'Qwen':          { bg: '#615EFF', color: '#fff', letter: 'Qw' },
  'Yi':            { bg: '#1a1a2e', color: '#fff', letter: 'Yi' },
  'GLM':           { bg: '#3366FF', color: '#fff', letter: 'GL' },
  'Moonshot':      { bg: '#000000', color: '#fff', letter: '🌙' },
}

// SVG logos for major providers
const svgLogos: Record<string, React.ReactNode> = {
  'OpenAI': (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
    </svg>
  ),
  'Anthropic': (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541zm-.371 10.69L8.964 8.16l2.639 6.071z"/>
    </svg>
  ),
}

export default function ProviderIcon({ name, size = 36 }: { name: string; size?: number }) {
  const style = providerStyles[name] || { bg: '#6b7280', color: '#fff', letter: name.slice(0, 2) }
  const logo = svgLogos[name]

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 10,
      background: style.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: style.color,
      fontSize: style.letter.length > 2 ? size * 0.45 : size * 0.36,
      fontWeight: 700,
      flexShrink: 0,
      lineHeight: 1,
    }}>
      {logo || style.letter}
    </div>
  )
}
