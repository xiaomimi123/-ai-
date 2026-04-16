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
  ['#0D1F14', '#2ECC71', '#7FD99F', '#EAF7EF'],
  ['#14532d', '#22c55e', '#86efac', '#dcfce7'],
  ['#064e3b', '#10b981', '#6ee7b7', '#d1fae5'],
  ['#365314', '#84cc16', '#bef264', '#ecfccb'],
  ['#134e4a', '#14b8a6', '#5eead4', '#ccfbf1'],
  ['#1a2e05', '#65a30d', '#bef264', '#f7fee7'],
  ['#052e16', '#16a34a', '#4ade80', '#dcfce7'],
  ['#0f766e', '#2dd4bf', '#99f6e4', '#ccfbf1'],
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
