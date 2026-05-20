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
import TasksPage from './pages/Tasks'
import FinancePage from './pages/Finance'
import { RoleGuard } from './components/RoleGuard'
import { ADMIN_PAGE_MIN_ROLE } from './api'
import AgentOverviewPage from './pages/agent/AgentOverview'
import AgentTeamMembersPage from './pages/agent/AgentTeamMembers'
import AgentTeamOrdersPage from './pages/agent/AgentTeamOrders'
import AgentTeamLogsPage from './pages/agent/AgentTeamLogs'
import AgentCommissionsPage from './pages/agent/AgentCommissions'

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><OverviewPage /></RoleGuard>} />
          <Route path="users" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><UsersPage /></RoleGuard>} />
          <Route path="channels" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ChannelsPage /></RoleGuard>} />
          <Route path="redemptions" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><RedemptionsPage /></RoleGuard>} />
          <Route path="logs" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><LogsPage /></RoleGuard>} />
          <Route path="tasks" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><TasksPage /></RoleGuard>} />
          <Route path="orders" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><OrdersPage /></RoleGuard>} />
          <Route path="referrals" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ReferralsPage /></RoleGuard>} />
          <Route path="withdrawals" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><WithdrawalsPage /></RoleGuard>} />
          <Route path="finance" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><FinancePage /></RoleGuard>} />
          <Route path="model-prices" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ModelPricesPage /></RoleGuard>} />
          <Route path="notices" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><NoticesPage /></RoleGuard>} />
          <Route path="model-manage" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ModelManagePage /></RoleGuard>} />
          <Route path="model-ratios" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><ModelRatiosPage /></RoleGuard>} />
          <Route path="payment" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><PaymentSettingsPage /></RoleGuard>} />
          <Route path="plans" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><PlansPage /></RoleGuard>} />
          <Route path="settings" element={<RoleGuard min={ADMIN_PAGE_MIN_ROLE}><SettingsPage /></RoleGuard>} />
          <Route path="agent/overview" element={<AgentOverviewPage />} />
          <Route path="agent/team-members" element={<AgentTeamMembersPage />} />
          <Route path="agent/team-orders" element={<AgentTeamOrdersPage />} />
          <Route path="agent/team-logs" element={<AgentTeamLogsPage />} />
          <Route path="agent/my-commissions" element={<AgentCommissionsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
export default App
