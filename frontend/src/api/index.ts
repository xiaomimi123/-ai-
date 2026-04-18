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
  // page_size 后端默认 ItemsPerPage(10)；前台令牌一般不多，直接拉 100 条覆盖常见场景
  list: (params?: { p?: number; page_size?: number }) =>
    http.get('/api/token/', { params: { p: 0, page_size: 100, ...params } }),
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

export const referralApi = {
  getInfo: () => http.get('/api/lingjing/referral'),
  getCommissions: () => http.get('/api/lingjing/referral/commissions'),
  withdraw: () => http.post('/api/lingjing/referral/withdraw'),
  // 支付宝提现
  getWithdrawInfo: () => http.get('/api/lingjing/withdraw'),
  createWithdraw: (data: { amount: number; alipay_account: string; real_name: string }) =>
    http.post('/api/lingjing/withdraw', data),
}
