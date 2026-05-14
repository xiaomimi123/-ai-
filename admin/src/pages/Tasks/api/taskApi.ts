// 管理员异步任务 API 客户端
// 与项目惯例一致：使用 Cookie session（credentials: 'include'），不带 Bearer Authorization。
// 后端路由：/api/admin/tasks（list / get / retry / refund），由 controller/admin_task.go 实现。
//
// 注意：admin 主体使用 axios（src/api/index.ts），这里按 Task H1 规范用独立 fetch 客户端隔离，
// 避免和全局 401→/login 拦截器耦合（任务管理需要更细粒度的错误展示）。

const BASE = '/api/admin/tasks'

// 后端返回的任务行（与 model.Task 字段对齐；仅列出 H2 大概率会用到的）
export interface AdminTaskRow {
  id: number
  task_id: string
  platform: string
  action?: string
  model?: string
  status: string
  user_id: number
  channel_id: number
  quota: number
  progress?: string
  fail_reason?: string
  submit_time?: number
  start_time?: number
  finish_time?: number
  created_at: number
  updated_at?: number
  timeout_at?: number
  [key: string]: unknown
}

export interface AdminTaskListResp {
  data: AdminTaskRow[]
  total: number
  page: number
  page_size: number
}

export interface AdminTaskActionResp {
  id: string
  status: string
}

export type AdminTaskListParams = {
  p?: number
  page_size?: number
  platform?: string
  status?: string
  user_id?: number | string
  keyword?: string
}

async function http<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include', // Cookie session：禁用 Bearer
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  // 后端错误返回 { error: { message, type } }；正常返回直接为业务对象。
  let j: unknown = {}
  try { j = await res.json() } catch { /* 空响应兜底 */ }
  if (!res.ok) {
    const errObj = j as { error?: { message?: string }; message?: string }
    const msg = errObj?.error?.message || errObj?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return j as T
}

function buildQS(params: AdminTaskListParams): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)] as [string, string])
  return new URLSearchParams(entries).toString()
}

export const adminTaskApi = {
  /** 列表：支持 platform / status / user_id / keyword 过滤；page 从 0 开始 */
  list: (params: AdminTaskListParams = {}) =>
    http<AdminTaskListResp>('GET', `?${buildQS(params)}`),

  /** 详情 */
  get: (taskId: string) =>
    http<AdminTaskRow>('GET', `/${encodeURIComponent(taskId)}`),

  /** 重试：仅 FAILURE / TIMEOUT 可重试，后端会重置为 SUBMITTED 并延长 timeout */
  retry: (taskId: string) =>
    http<AdminTaskActionResp>('POST', `/${encodeURIComponent(taskId)}/retry`),

  /** 手动退款：仅 SUCCESS 可退；reason 必填（透传到 RefundTaskQuota 审计日志） */
  refund: (taskId: string, reason: string) =>
    http<AdminTaskActionResp>('POST', `/${encodeURIComponent(taskId)}/refund`, { reason }),
}
