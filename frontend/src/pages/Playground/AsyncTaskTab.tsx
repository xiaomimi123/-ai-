import { Sparkles } from 'lucide-react'

// 异步任务 Tab（G1 仅脚手架占位，完整 UI 见 G2-G3）
// 主题严格遵循森林科技风：仅用 var(--accent) / var(--border) / var(--text) 等全局变量，
// 禁止蓝紫、禁止 AI 主题 emoji。
export default function AsyncTaskTab() {
  return (
    <div
      style={{
        padding: 24,
        border: '0.5px solid var(--border)',
        borderRadius: 12,
        background: 'var(--bg)',
        minHeight: 'calc(100vh - 320px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Sparkles size={18} color="var(--accent)" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
          异步生成
        </h2>
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
        支持 gpt-image-2 / jimeng 等异步图像、视频任务的提交、轮询与结果展示。
      </p>
      <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 13 }}>
        完整 UI 即将上线（Task G2 - G3）。
      </p>
    </div>
  )
}
