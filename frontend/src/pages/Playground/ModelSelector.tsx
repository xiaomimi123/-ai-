import type { PlaygroundModel } from '../../api'
import ProviderIcon from '../../components/ProviderIcon'

interface Props {
  models: PlaygroundModel[]
  selected: string
  onSelect: (id: string) => void
}

export default function ModelSelector({ models, selected, onSelect }: Props) {
  if (!models.length) {
    return (
      <div style={{
        padding: 16,
        color: 'var(--muted)',
        fontSize: 13,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        暂无可用模型
      </div>
    )
  }
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      height: 'fit-content',
      position: 'sticky',
      top: 80,
    }}>
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--muted)',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>
        选择模型
      </div>
      <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
        {models.map(m => {
          const active = m.id === selected
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: active ? 'var(--primary-light)' : 'transparent',
                borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                border: 'none',
                borderTop: 0,
                borderRight: 0,
                borderBottom: 0,
                textAlign: 'left',
                cursor: 'pointer',
                color: active ? 'var(--primary)' : 'var(--text)',
                fontSize: 13,
              }}
            >
              <ProviderIcon name={m.logo} size={20} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: active ? 600 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {m.name}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {m.provider}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
