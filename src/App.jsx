import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Deals from './pages/Deals'
import History from './pages/History'
import Clients from './pages/Clients'
import Quotas from './pages/Quotas'
import Budget from './pages/Budget'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Tasks from './pages/Tasks'
import Tenders from './pages/Tenders'
import { Spinner } from './components/ui'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner />
    </div>
  )

  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )

  return (
    <Layout>
      <Routes>
        <Route path="/"        element={<Dashboard />} />
        <Route path="/deals"   element={<Deals />} />
        <Route path="/history" element={<History />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/quotas"  element={<Quotas />} />
        <Route path="/budget"    element={<Budget />} />
        <Route path="/users"     element={<Users />} />
        <Route path="/settings"  element={<Settings />} />
        <Route path="/tasks"     element={<Tasks />} />
        <Route path="/tenders"   element={<Tenders />} />
        <Route path="/login"  element={<Navigate to="/" replace />} />
        <Route path="*"       element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
