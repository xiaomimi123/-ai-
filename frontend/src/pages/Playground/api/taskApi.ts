// 异步任务（gpt-image-2 / jimeng 等）API 客户端
// 与项目惯例一致：使用 Cookie session（credentials: 'include'），不带 Bearer Authorization。
// 后端路由：/api/lingjing/playground/async-* （session-auth 包装，控制器复用 /v1/tasks/* 的实现）
//
// 注意：业务侧的 /v1/images/generations 与 /v1/tasks/* 仍然保留给第三方 SDK 走 Bearer Token。
// 广场（前端）不能直接命中那批路由，因为它们走 TokenAuth；我们用 session-auth 镜像版本。
import { runtimeConfig } from '../../../runtimeConfig'

// 空 = 同源 /api；非空 = 独立 API 域名（用于绕开 CDN 超时限制）
const API_BASE = runtimeConfig.apiBaseUrl
const BASE = '/api/lingjing/playground'

export interface TaskSubmitPayload {
  model: string
  prompt?: string
  // 其余字段透传给后端（size / n / image_url / video 参数等）
  [key: string]: unknown
}

export interface TaskInfo {
  task_id: string
  status: string
  model?: string
  progress?: number
  result?: unknown
  error?: { code?: string; message?: string } | null
  created_at?: number
  updated_at?: number
  [key: string]: unknown
}

async function http<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    credentials: 'include', // Cookie session：禁用 Bearer
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  // 后端错误返回 { error: { message } } 或 { message }
  let j: unknown = {}
  try { j = await res.json() } catch { /* 空响应兜底 */ }
  if (!res.ok) {
    const errObj = j as { error?: { message?: string }; message?: string }
    const msg = errObj?.error?.message || errObj?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return j as T
}

export const taskApi = {
  /** 提交异步任务 —— 后端按 model 路由到 gpt-image-2 / jimeng 适配器 */
  submit: (payload: TaskSubmitPayload) =>
    http<TaskInfo>('POST', `${BASE}/async-submit`, payload),

  /** 查询单个任务 */
  get: (taskId: string) =>
    http<TaskInfo>('GET', `${BASE}/async-tasks/${encodeURIComponent(taskId)}`),

  /** 批量查询（轮询多任务时优先用这个，减少请求数） */
  batch: (taskIds: string[]) =>
    http<{ tasks: TaskInfo[] }>('POST', `${BASE}/async-tasks/batch`, { task_ids: taskIds }),

  /** 取消任务（pending/running 状态生效，结束态返回错误） */
  cancel: (taskId: string) =>
    http<TaskInfo>('POST', `${BASE}/async-tasks/${encodeURIComponent(taskId)}/cancel`),
}
