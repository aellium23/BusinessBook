import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import Permissions from './pages/Permissions'
import Tasks from './pages/Tasks'
import Tenders from './pages/Tenders'
import { Spinner } from './components/ui'

// ── Route Guard ───────────────────────────────────────────────────────────────
function Guard({ page, element }) {
  const { canAccessPage } = useAuth()
  return canAccessPage(page) ? element : <Navigate to="/" replace />
}

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
      <Route path="*"      element={<Navigate to="/login" replace />} />
    </Routes>
  )

  return (
    <Layout>
      <Routes>
        <Route path="/"         element={<Guard page="dashboard" element={<Dashboard />} />} />
        <Route path="/deals"    element={<Guard page="deals"     element={<Deals />} />} />
        <Route path="/clients"  element={<Guard page="clients"   element={<Clients />} />} />
        <Route path="/history"  element={<Guard page="history"   element={<History />} />} />
        <Route path="/quotas"   element={<Guard page="quotas"    element={<Quotas />} />} />
        <Route path="/tasks"    element={<Guard page="tasks"     element={<Tasks />} />} />
        <Route path="/tenders"  element={<Guard page="tenders"   element={<Tenders />} />} />
        <Route path="/budget"   element={<Guard page="budget"    element={<Budget />} />} />
        <Route path="/users"    element={<Guard page="users"     element={<Users />} />} />
        <Route path="/settings"     element={<Guard page="settings"     element={<Settings />} />} />
        <Route path="/permissions" element={<Guard page="permissions" element={<Permissions />} />} />
        <Route path="/login"    element={<Navigate to="/" replace />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
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
