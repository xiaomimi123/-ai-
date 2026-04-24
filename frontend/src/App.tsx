import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import CustomerService from './components/CustomerService'
import ChunkLoadErrorBoundary from './components/ChunkLoadErrorBoundary'

// 立即加载（首屏 + 入口三件套）：Home / Login / Register —— 跟用户首次访问强相关
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'

// 懒加载（登录后才会进的内部页面）：每个独立 chunk，浏览器按需下载
const DashboardPage     = lazy(() => import('./pages/Dashboard'))
const TokensPage        = lazy(() => import('./pages/Tokens'))
const LogsPage          = lazy(() => import('./pages/Logs'))
const TopupPage         = lazy(() => import('./pages/Topup'))
const ModelsPage        = lazy(() => import('./pages/Models'))
const ModelDetailPage   = lazy(() => import('./pages/ModelDetail'))
const DocsPage          = lazy(() => import('./pages/Docs'))
const SettingsPage      = lazy(() => import('./pages/Settings'))
const OrdersPage        = lazy(() => import('./pages/Orders'))
const ReferralPage      = lazy(() => import('./pages/Referral'))
const NotificationsPage = lazy(() => import('./pages/Notifications'))
const PlaygroundPage    = lazy(() => import('./pages/Playground'))

// 切页时下载新 chunk 的过渡态
const PageFallback = () => (
  <div style={{
    padding: 60,
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: 14,
  }}>
    加载中...
  </div>
)

const App = () => (
  <ChunkLoadErrorBoundary>
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard"        element={<Layout><DashboardPage /></Layout>} />
          <Route path="/tokens"           element={<Layout><TokensPage /></Layout>} />
          <Route path="/logs"             element={<Layout><LogsPage /></Layout>} />
          <Route path="/topup"            element={<Layout><TopupPage /></Layout>} />
          <Route path="/models"           element={<Layout><ModelsPage /></Layout>} />
          <Route path="/model/:modelName" element={<Layout><ModelDetailPage /></Layout>} />
          <Route path="/docs"             element={<Layout><DocsPage /></Layout>} />
          <Route path="/settings"         element={<Layout><SettingsPage /></Layout>} />
          <Route path="/orders"           element={<Layout><OrdersPage /></Layout>} />
          <Route path="/referral"         element={<Layout><ReferralPage /></Layout>} />
          <Route path="/notifications"    element={<Layout><NotificationsPage /></Layout>} />
          <Route path="/playground"       element={<Layout><PlaygroundPage /></Layout>} />
        </Routes>
      </Suspense>
      <CustomerService />
    </BrowserRouter>
  </ChunkLoadErrorBoundary>
)

export default App
