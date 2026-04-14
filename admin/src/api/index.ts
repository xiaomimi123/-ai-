import axios from 'axios'

const http = axios.create({ baseURL: '', withCredentials: true, timeout: 15000 })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) { localStorage.removeItem('admin_token'); window.location.href = '/login' }
  return Promise.reject(err)
})

// One API 原生接口
export const authApi = {
  login: (username: string, password: string) => http.post('/api/user/login', { username, password }),
}

export const userApi = {
  list: (params: { p?: number; page_size?: number }) => http.get('/api/user', { params }),
  update: (id: number, data: object) => http.put(`/api/user/${id}`, data),
  delete: (id: number) => http.delete(`/api/user/${id}`),
}

export const channelApi = {
  list: () => http.get('/api/channel'),
  create: (data: object) => http.post('/api/channel', data),
  update: (id: number, data: object) => http.put(`/api/channel/${id}`, data),
  delete: (id: number) => http.delete(`/api/channel/${id}`),
  test: (id: number) => http.get(`/api/channel/test/${id}`),
}

export const tokenApi = {
  list: (params?: { p?: number; page_size?: number }) => http.get('/api/token', { params }),
}

export const redemptionApi = {
  list: (params: { p?: number }) => http.get('/api/redemption', { params }),
  create: (data: { name: string; quota: number; count: number }) => http.post('/api/redemption', data),
  delete: (id: number) => http.delete(`/api/redemption/${id}`),
}

export const logApi = {
  list: (params: { p?: number; page_size?: number; username?: string; model_name?: string }) =>
    http.get('/api/log', { params }),
}

// 灵镜AI 扩展接口
export const orderApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    http.get('/api/admin/lingjing/topups', { params }),
  complete: (trade_no: string) =>
    http.post('/api/admin/lingjing/topups/complete', { trade_no }),
}

export const referralAdminApi = {
  getStats: () => http.get('/api/admin/lingjing/referral/stats'),
  updateConfig: (data: object) => http.put('/api/admin/lingjing/referral/config', data),
}

export const modelPriceApi = {
  list: () => http.get('/api/lingjing/model-prices'),
  upsert: (data: object) => http.post('/api/admin/lingjing/model-prices', data),
  delete: (id: number) => http.delete(`/api/admin/lingjing/model-prices/${id}`),
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

export const planApi = {
  list: () => http.get('/api/admin/lingjing/plans'),
  create: (data: object) => http.post('/api/admin/lingjing/plans', data),
  update: (id: number, data: object) => http.put(`/api/admin/lingjing/plans/${id}`, data),
  delete: (id: number) => http.delete(`/api/admin/lingjing/plans/${id}`),
}
