import { ChevronLeft, ChevronRight } from 'lucide-react'

// 与用户前台共用同款样式，保持整个平台分页风格一致
interface Props {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export default function Pagination({ page, pageSize, total, onChange }: Props) {
  if (total <= pageSize) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 }}>
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>第 {page} / {totalPages} 页</span>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ChevronLeft size={14}/>
      </button>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        <ChevronRight size={14}/>
      </button>
    </div>
  )
}
