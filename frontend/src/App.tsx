import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import CustomerService from './components/CustomerService'
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import DashboardPage from './pages/Dashboard'
import TokensPage from './pages/Tokens'
import LogsPage from './pages/Logs'
import TopupPage from './pages/Topup'
import ModelsPage from './pages/Models'
import DocsPage from './pages/Docs'
import SettingsPage from './pages/Settings'
import OrdersPage from './pages/Orders'
import ReferralPage from './pages/Referral'
import ModelDetailPage from './pages/ModelDetail'

const PageWrap = ({ children }: { children: React.ReactNode }) => (
  <><Navbar /><div style={{ paddingTop: 'var(--nav-height)' }}><div className="container" style={{ padding: '32px 24px' }}>{children}</div></div></>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<PageWrap><DashboardPage /></PageWrap>} />
        <Route path="/tokens" element={<PageWrap><TokensPage /></PageWrap>} />
        <Route path="/logs" element={<PageWrap><LogsPage /></PageWrap>} />
        <Route path="/topup" element={<PageWrap><TopupPage /></PageWrap>} />
        <Route path="/models" element={<PageWrap><ModelsPage /></PageWrap>} />
        <Route path="/model/:modelName" element={<PageWrap><ModelDetailPage /></PageWrap>} />
        <Route path="/docs" element={<PageWrap><DocsPage /></PageWrap>} />
        <Route path="/settings" element={<PageWrap><SettingsPage /></PageWrap>} />
        <Route path="/orders" element={<PageWrap><OrdersPage /></PageWrap>} />
        <Route path="/referral" element={<PageWrap><ReferralPage /></PageWrap>} />
      </Routes>
      <CustomerService />
    </BrowserRouter>
  )
}

export default App
