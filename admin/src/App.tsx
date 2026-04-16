import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import AdminLayout from './components/AdminLayout'
import LoginPage from './pages/Login'
import OverviewPage from './pages/Overview'
import UsersPage from './pages/Users'
import ChannelsPage from './pages/Channels'
import RedemptionsPage from './pages/Redemptions'
import LogsPage from './pages/Logs'
import OrdersPage from './pages/Orders'
import ReferralsPage from './pages/Referrals'
import WithdrawalsPage from './pages/Withdrawals'
import ModelPricesPage from './pages/ModelPrices'
import ModelManagePage from './pages/ModelManage'
import NoticesPage from './pages/Notices'
import SettingsPage from './pages/Settings'
import ModelRatiosPage from './pages/ModelRatios'
import PaymentSettingsPage from './pages/PaymentSettings'
import PlansPage from './pages/Plans'

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="redemptions" element={<RedemptionsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="referrals" element={<ReferralsPage />} />
          <Route path="withdrawals" element={<WithdrawalsPage />} />
          <Route path="model-prices" element={<ModelPricesPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="model-manage" element={<ModelManagePage />} />
          <Route path="model-ratios" element={<ModelRatiosPage />} />
          <Route path="payment" element={<PaymentSettingsPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
export default App
