import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

// 不再用 Bearer token，改用 cookie session（One API 原生认证方式）
http.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) { window.location.href = '/login' }
  return Promise.reject(err)
})

// One API 原生接口
export const authApi = {
  login: (username: string, password: string) => http.post('/api/user/login', { username, password }),
}

export const userApi = {
  list: (params: { p?: number; page_size?: number }) => http.get('/api/user/', { params }),
  update: (id: number, data: object) => http.put(`/api/user/${id}`, data),
  delete: (id: number) => http.delete(`/api/user/${id}`),
}

// 注意 PUT 后端是 /api/channel/（不是 /:id），更新数据里必须带 id
// 老代码 http.put(`/api/channel/${id}`) 会 404，toggle 根本没生效 —— 本次一并修复
export const channelApi = {
  list: (params?: { p?: number; page_size?: number }) => http.get('/api/channel/', { params }),
  search: (keyword: string) => http.get('/api/channel/search', { params: { keyword } }),
  get: (id: number) => http.get(`/api/channel/${id}`),
  create: (data: object) => http.post('/api/channel/', data),
  update: (id: number, data: object) => http.put('/api/channel/', { id, ...data }),
  delete: (id: number) => http.delete(`/api/channel/${id}`),
  deleteDisabled: () => http.delete('/api/channel/disabled'),
  test: (id: number, model?: string) =>
    http.get(`/api/channel/test/${id}`, { params: model ? { model } : {} }),
  testAll: (scope: 'all' | 'disabled' = 'all') =>
    http.get('/api/channel/test', { params: { scope } }),
  updateBalance: (id: number) => http.get(`/api/channel/update_balance/${id}`),
  updateAllBalance: () => http.get('/api/channel/update_balance'),
}

export const tokenApi = {
  list: (params?: { p?: number; page_size?: number }) => http.get('/api/token/', { params }),
}

export const redemptionApi = {
  list: (params: { p?: number; page_size?: number }) => http.get('/api/redemption/', { params }),
  create: (data: { name: string; quota: number; count: number }) => http.post('/api/redemption/', data),
  delete: (id: number) => http.delete(`/api/redemption/${id}`),
}

export const logApi = {
  list: (params: { p?: number; page_size?: number; username?: string; model_name?: string }) =>
    http.get('/api/log/', { params }),
}

// 灵镜AI 扩展接口
export const orderApi = {
  list: (params?: { page?: number; page_size?: number; status?: string; username?: string }) =>
    http.get('/api/admin/lingjing/topups', { params }),
  // 按订单号 order_no 补单（pending 订单 trade_no 可能为空）
  complete: (order_no: string) =>
    http.post('/api/admin/lingjing/topups/complete', { order_no }),
}

export const referralAdminApi = {
  getStats: () => http.get('/api/admin/lingjing/referral/stats'),
  updateConfig: (data: object) => http.put('/api/admin/lingjing/referral/config', data),
}

export const modelPriceApi = {
  // 管理员全部列表（含隐藏）
  list: () => http.get('/api/admin/lingjing/model-prices'),
  create: (data: object) => http.post('/api/admin/lingjing/model-prices', data),
  update: (id: number, data: object) => http.put(`/api/admin/lingjing/model-prices/${id}`, data),
  delete: (id: number) => http.delete(`/api/admin/lingjing/model-prices/${id}`),
  toggle: (id: number) => http.put(`/api/admin/lingjing/model-prices/${id}/toggle`),
}

export const noticeApi = {
  list: () => http.get('/api/lingjing/notices'),
  create: (data: { title: string; content: string }) => http.post('/api/admin/lingjing/notices', data),
  delete: (id: number) => http.delete(`/api/admin/lingjing/notices/${id}`),
}

export const optionApi = {
  get: () => http.get('/api/option/'),
  update: (data: Record<string, string>) => http.put('/api/option/', data),
}

export const lingjingConfigApi = {
  get: () => http.get('/api/lingjing/config'),
  update: (data: Record<string, string>) => http.put('/api/admin/lingjing/config', data),
}

export const groupApi = {
  list: () => http.get('/api/admin/group/list'),
  updateUser: (data: { user_id: number; group: string }) => http.put('/api/admin/group/user', data),
  stats: () => http.get('/api/admin/group/stats'),
}

export const rateLimitApi = {
  setToken: (tokenId: number, data: { rpm: number; tpm: number }) =>
    http.put(`/api/admin/lingjing/token/${tokenId}/rate-limit`, data),
}

export const planApi = {
  list: () => http.get('/api/admin/lingjing/plans'),
  create: (data: object) => http.post('/api/admin/lingjing/plans', data),
  update: (id: number, data: object) => http.put(`/api/admin/lingjing/plans/${id}`, data),
  delete: (id: number) => http.delete(`/api/admin/lingjing/plans/${id}`),
}

// 提现审核
export const withdrawApi = {
  list: (params?: { status?: string; page?: number }) => http.get('/api/admin/withdraw', { params }),
  stats: () => http.get('/api/admin/withdraw/stats'),
  process: (id: number, data: { action: 'approve' | 'reject' | 'paid'; reject_reason?: string; admin_remark?: string }) =>
    http.put(`/api/admin/withdraw/${id}`, data),
}
