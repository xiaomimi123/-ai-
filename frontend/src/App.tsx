import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import CustomerService from './components/CustomerService'
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import DashboardPage from './pages/Dashboard'
import TokensPage from './pages/Tokens'
import LogsPage from './pages/Logs'
import TopupPage from './pages/Topup'
import ModelsPage from './pages/Models'
import ModelDetailPage from './pages/ModelDetail'
import DocsPage from './pages/Docs'
import SettingsPage from './pages/Settings'
import OrdersPage from './pages/Orders'
import ReferralPage from './pages/Referral'

const App = () => (
  <BrowserRouter>
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
    </Routes>
    <CustomerService />
  </BrowserRouter>
)

export default App
