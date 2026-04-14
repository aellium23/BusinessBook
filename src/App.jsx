import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Deals from './pages/Deals'
import History from './pages/History'
import Clients from './pages/Clients'
import Contacts from './pages/Contacts'
import Accounts from './pages/Accounts'
import WhiteSpace from './pages/WhiteSpace'
import AuditLog from './pages/AuditLog'
import Quotas from './pages/Quotas'
import Budget from './pages/Budget'
import Settings from './pages/Settings'
import MyAccount from './pages/MyAccount'
import Tasks from './pages/Tasks'
import Tenders from './pages/Tenders'
import { Spinner } from './components/ui'
import AuthCallback from './pages/AuthCallback'
import SetPassword from './pages/SetPassword'

import Permissions from './pages/Permissions'

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
        <Routes>
          <Route path="/"             element={<Guard page="dashboard"   element={<Dashboard />} />} />
          <Route path="/deals"        element={<Guard page="deals"       element={<Deals />} />} />
          <Route path="/clients"      element={<Guard page="clients"     element={<Clients />} />} />
          <Route path="/contacts"     element={<Guard page="contacts"    element={<Contacts />} />} />
          <Route path="/accounts"     element={<Guard page="accounts"    element={<Accounts />} />} />
          <Route path="/whitespace"   element={<Guard page="whitespace"  element={<WhiteSpace />} />} />
          <Route path="/audit"        element={<Guard page="audit"       element={<AuditLog />} />} />
          <Route path="/history"      element={<Guard page="history"     element={<History />} />} />
          <Route path="/quotas"       element={<Guard page="quotas"      element={<Quotas />} />} />
          <Route path="/tasks"        element={<Guard page="tasks"       element={<Tasks />} />} />
          <Route path="/tenders"      element={<Guard page="tenders"     element={<Tenders />} />} />
          <Route path="/budget"       element={<Guard page="budget"      element={<Budget />} />} />
          <Route path="/settings"     element={<Guard page="settings"    element={<Settings />} />} />
          <Route path="/permissions"  element={<Guard page="permissions" element={<Permissions />} />} />
          <Route path="/account"       element={<MyAccount />} />
          <Route path="/auth/callback"     element={<AuthCallback />} />
          <Route path="/auth/set-password" element={<SetPassword />} />
          <Route path="/login"              element={<Navigate to="/" replace />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      
    </Layout>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
