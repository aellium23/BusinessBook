import { lazy, Suspense } from 'react'
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
import MyAccount from './pages/MyAccount'
import Tasks from './pages/Tasks'
import Tenders from './pages/Tenders'
import { Spinner } from './components/ui'
import AuthCallback from './pages/AuthCallback'
import SetPassword from './pages/SetPassword'

// Lazy load — não bloqueia o build se o ficheiro não existir
const Permissions = lazy(() =>
  import('./pages/Permissions').catch(() => ({ default: () => (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <p>Página não disponível.</p>
    </div>
  )}))
)

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

  // Rotas de auth — acessíveis sem sessão
  if (!user) return (
    <Routes>
      <Route path="/login"           element={<Login />} />
      <Route path="/auth/callback"   element={<AuthCallback />} />
      <Route path="/auth/set-password" element={<SetPassword />} />
      <Route path="*"                element={<Navigate to="/login" replace />} />
    </Routes>
  )

  // Rotas auth acessíveis mesmo com sessão (ex: set-password após invite)

  return (
    <Layout>
      <Suspense fallback={<div className="flex items-center justify-center p-8"><Spinner /></div>}>
        <Routes>
          <Route path="/"             element={<Guard page="dashboard"   element={<Dashboard />} />} />
          <Route path="/deals"        element={<Guard page="deals"       element={<Deals />} />} />
          <Route path="/clients"      element={<Guard page="clients"     element={<Clients />} />} />
          <Route path="/history"      element={<Guard page="history"     element={<History />} />} />
          <Route path="/quotas"       element={<Guard page="quotas"      element={<Quotas />} />} />
          <Route path="/tasks"        element={<Guard page="tasks"       element={<Tasks />} />} />
          <Route path="/tenders"      element={<Guard page="tenders"     element={<Tenders />} />} />
          <Route path="/budget"       element={<Guard page="budget"      element={<Budget />} />} />
          <Route path="/users"        element={<Guard page="users"       element={<Users />} />} />
          <Route path="/settings"     element={<Guard page="settings"    element={<Settings />} />} />
          <Route path="/permissions"  element={<Permissions />} />
          <Route path="/account"       element={<MyAccount />} />
          <Route path="/auth/callback"     element={<AuthCallback />} />
          <Route path="/auth/set-password" element={<SetPassword />} />
          <Route path="/login"              element={<Navigate to="/" replace />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
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
