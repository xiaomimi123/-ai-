// 基于用户名生成马赛克风格头像
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const palettes = [
  ['#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
  ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ede9fe'],
  ['#10b981', '#34d399', '#6ee7b7', '#d1fae5'],
  ['#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7'],
  ['#ef4444', '#f87171', '#fca5a5', '#fee2e2'],
  ['#ec4899', '#f472b6', '#f9a8d4', '#fce7f3'],
  ['#06b6d4', '#22d3ee', '#67e8f9', '#cffafe'],
  ['#6366f1', '#818cf8', '#a5b4fc', '#e0e7ff'],
]

export default function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const hash = hashCode(name || 'user')
  const palette = palettes[hash % palettes.length]
  const grid = 5
  const cellSize = size / grid

  // Generate symmetric pattern (mirror left half to right)
  const cells: { x: number; y: number; color: string }[] = []
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < Math.ceil(grid / 2); x++) {
      const idx = y * grid + x
      const seed = (hash * (idx + 1) * 31) % 100
      if (seed > 35) { // 65% fill rate
        const color = palette[(hash * (idx + 7)) % palette.length]
        cells.push({ x, y, color })
        // Mirror
        if (x !== Math.floor(grid / 2)) {
          cells.push({ x: grid - 1 - x, y, color })
        }
      }
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius: size > 40 ? 12 : 8, flexShrink: 0 }}>
      <rect width={size} height={size} fill={palette[3]} rx={size > 40 ? 12 : 8} />
      {cells.map((c, i) => (
        <rect key={i} x={c.x * cellSize} y={c.y * cellSize} width={cellSize} height={cellSize} fill={c.color} />
      ))}
    </svg>
  )
}
