import { Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

// 后端 quota 单位：1 元 = 500000
const QUOTA_PER_YUAN = 500000

export default function BalanceBar({ quota }: { quota: number }) {
  const yuan = quota / QUOTA_PER_YUAN
  const low = yuan < 0.1
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 14px',
      background: low ? 'var(--danger-bg)' : 'var(--primary-light)',
      color: low ? 'var(--danger)' : 'var(--primary)',
      borderRadius: 'var(--radius-sm)',
      fontSize: 13,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <Wallet size={15} />
      <span>余额 ¥ {yuan.toFixed(2)}</span>
      {low && (
        <Link to="/topup" style={{
          color: 'var(--danger)',
          textDecoration: 'underline',
          marginLeft: 4,
          fontSize: 12,
        }}>
          去充值
        </Link>
      )}
    </div>
  )
}
