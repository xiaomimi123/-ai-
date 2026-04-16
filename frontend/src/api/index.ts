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
  register: (data: { username: string; password: string; email?: string; aff_code?: string }) =>
    http.post('/api/user/register', data),
  logout: () => http.get('/api/user/logout'),
  getSelf: () => http.get('/api/user/self'),
  updateSelf: (data: object) => http.put('/api/user/self', data),
}

export const tokenApi = {
  list: () => http.get('/api/token/'),
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
  list: (params: { page?: number; page_size?: number }) =>
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

export const referralApi = {
  getInfo: () => http.get('/api/lingjing/referral'),
  getCommissions: () => http.get('/api/lingjing/referral/commissions'),
  withdraw: () => http.post('/api/lingjing/referral/withdraw'),
  // 支付宝提现
  getWithdrawInfo: () => http.get('/api/lingjing/withdraw'),
  createWithdraw: (data: { amount: number; alipay_account: string; real_name: string }) =>
    http.post('/api/lingjing/withdraw', data),
}
