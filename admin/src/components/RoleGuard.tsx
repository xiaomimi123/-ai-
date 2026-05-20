import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authApi } from '../api'

interface Props {
  min: number
  children: ReactNode
  fallback?: string
}

// RoleGuard 路由级权限闸：role < min 时直接 Navigate 走，不渲染 children。
// 用法：<RoleGuard min={10}><UsersPage/></RoleGuard>
// 用于挡住"代理在地址栏手输 admin URL"绕过菜单裁剪的情况。
//
// 注意：这是前端守卫，仅是 UX 防护；后端 AdminAuth 中间件才是真正的权限边界。
export function RoleGuard({ min, children, fallback = '/agent/overview' }: Props) {
  const [role, setRole] = useState<number | null>(null)

  useEffect(() => {
    authApi.getSelf()
      .then(r => setRole(r.data?.data?.role ?? 0))
      .catch(() => setRole(0))
  }, [])

  if (role === null) return null
  if (role < min) return <Navigate to={fallback} replace />
  return <>{children}</>
}
