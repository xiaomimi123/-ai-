import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login: (username: string, password: string) =>
    http.post('/api/user/login', { username, password }),
  register: (data: {
    username: string
    password: string
    email?: string
    aff_code?: string
    verification_code?: string
  }) => http.post('/api/user/register', data),
  // 发送注册邮箱验证码（One API 原生接口：GET /api/verification?email=xxx）
  sendEmailCode: (email: string) =>
    http.get('/api/verification', { params: { email } }),
  logout: () => http.get('/api/user/logout'),
  getSelf: () => http.get('/api/user/self'),
  updateSelf: (data: object) => http.put('/api/user/self', data),
}

export const tokenApi = {
  // 后端分页 p 从 0 开始；调用方自行传 page_size 控制每页
  list: (params?: { p?: number; page_size?: number }) =>
    http.get('/api/token/', { params }),
  // 注意：后端字段名是 remain_quota / unlimited_quota / expired_time（不是 quota）
  // unlimited_quota=true 时 remain_quota 值不影响鉴权；默认建议无限额度
  create: (data: {
    name: string
    remain_quota?: number
    unlimited_quota?: boolean
    expired_time?: number
  }) => http.post('/api/token/', data),
  delete: (id: number) => http.delete(`/api/token/${id}`),
}

export const logApi = {
  // One API 后端日志接口的分页参数是 p（从 0 开始），不是 page；page_size 默认 ItemsPerPage(10)
  list: (params: { p?: number; page_size?: number }) =>
    http.get('/api/log/self', { params }),
}

// 充值码兑换
export const redeemApi = {
  submit: (key: string) => http.post('/api/user/topup', { key }),
}

// 灵镜AI 扩展接口
export const publicApi = {
  getModelPrices: () => http.get('/api/lingjing/model-prices'),
  getNotices: () => http.get('/api/lingjing/notices'),
}

// 新版模型广场数据接口（与 publicApi.getModelPrices 同端点，保留命名语义）
export const modelPriceApi = {
  listPublic: () => http.get('/api/lingjing/model-prices'),
}

export const payApi = {
  getConfig: () => http.get('/api/lingjing/pay/config'),
  getInfo: () => http.get('/api/lingjing/pay/info'),
  createOrder: (data: { plan_id?: number; amount?: number; pay_type: string }) =>
    http.post('/api/lingjing/pay/create', data),
  getOrderStatus: (orderNo: string) =>
    http.get(`/api/lingjing/pay/order/${orderNo}`),
}

export const notificationApi = {
  list: (params?: { page?: number }) => http.get('/api/lingjing/notifications', { params }),
  unreadCount: () => http.get('/api/lingjing/notifications/unread'),
  markRead: (id: number | 'all') => http.put(`/api/lingjing/notifications/${id}/read`),
}

// 模型广场 Playground
export interface PlaygroundModel {
  id: string
  name: string
  provider: string
  description: string
  logo: string
  input_price?: number
  output_price?: number
  context_window?: string
  featured: boolean
}

export interface PlaygroundChatSummary {
  id: number
  title: string
  model: string
  created_at: number
  updated_at: number
}

export interface PlaygroundMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export const playgroundApi = {
  listModels: () => http.get('/api/lingjing/playground/models'),
  listChats: (params?: { page?: number; page_size?: number }) =>
    http.get('/api/lingjing/playground/chats', { params }),
  getChat: (id: number) => http.get(`/api/lingjing/playground/chats/${id}`),
  deleteChat: (id: number) => http.delete(`/api/lingjing/playground/chats/${id}`),
  // 画图同步接口，返回 data:image/... base64 数组
  generateImage: (data: {
    model: string
    prompt: string
    size?: string
    n?: number
  }) => http.post('/api/lingjing/playground/generate-image', data),
}

// 聊天走 fetch 以支持 SSE 流式读取。
// 返回 AsyncGenerator<string>，每 yield 一次新 token；结束时自动落盘到后端
// chat_id 为空 → 后端新建；响应头 X-Playground-Chat-Id 回传新 id
export async function* playgroundChatStream(body: {
  chat_id?: number
  model: string
  messages: PlaygroundMessage[]
  stream?: boolean
}, onChatId?: (id: number) => void, signal?: AbortSignal): AsyncGenerator<string> {
  const resp = await fetch('/api/lingjing/playground/chat', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  const chatIdHeader = resp.headers.get('X-Playground-Chat-Id')
  if (chatIdHeader && onChatId) onChatId(Number(chatIdHeader))

  if (!resp.ok || !resp.body) {
    const text = await resp.text()
    throw new Error(text || `请求失败 (${resp.status})`)
  }

  // 后端 JSON 错误兜底：非 SSE 响应
  const contentType = resp.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const j = await resp.json()
    if (j.success === false) throw new Error(j.message || '请求失败')
    // 理论上不该走到这里（stream=true），但兜底
    if (j?.choices?.[0]?.message?.content) {
      yield j.choices[0].message.content
    }
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE 按双换行分割事件
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const obj = JSON.parse(payload)
          const delta = obj?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) yield delta
        } catch {
          // 忽略非 JSON 行
        }
      }
    }
  }
}

export const referralApi = {
  getInfo: () => http.get('/api/lingjing/referral'),
  getCommissions: () => http.get('/api/lingjing/referral/commissions'),
  withdraw: () => http.post('/api/lingjing/referral/withdraw'),
  // 支付宝提现
  getWithdrawInfo: () => http.get('/api/lingjing/withdraw'),
  createWithdraw: (data: { amount: number; alipay_account: string; real_name: string }) =>
    http.post('/api/lingjing/withdraw', data),
}
