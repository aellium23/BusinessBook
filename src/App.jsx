import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { SettingsProvider } from './hooks/useSettings'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import { Spinner } from './components/ui'

// Lazy import with auto-recovery from stale chunks after a deploy.
// When a new version is deployed, old hashed chunk filenames 404 and the
// SPA rewrite returns index.html (text/html) → dynamic import fails with
// "not a valid JavaScript MIME type". We force ONE reload to fetch the
// fresh index.html (and new chunk names). A sessionStorage flag prevents
// reload loops if the failure is something else.
function lazyWithRetry(factory) {
  return React.lazy(() =>
    factory().catch(err => {
      const KEY = 'chunk_reload_at'
      const last = Number(sessionStorage.getItem(KEY) || 0)
      const now = Date.now()
      // Only auto-reload if we haven't reloaded in the last 10s
      if (now - last > 10000) {
        sessionStorage.setItem(KEY, String(now))
        window.location.reload()
        // Return a never-resolving module while the page reloads
        return new Promise(() => {})
      }
      throw err
    })
  )
}

const Login = lazyWithRetry(() => import('./pages/Login'))
const DashboardIndex = lazyWithRetry(() => import('./pages/DashboardIndex'))
const Deals = lazyWithRetry(() => import('./pages/Deals'))
const History = lazyWithRetry(() => import('./pages/History'))
const Clients = lazyWithRetry(() => import('./pages/Clients'))
const Contacts = lazyWithRetry(() => import('./pages/Contacts'))
const Accounts = lazyWithRetry(() => import('./pages/Accounts'))
const WhiteSpace = lazyWithRetry(() => import('./pages/WhiteSpace'))
const AuditLog = lazyWithRetry(() => import('./pages/AuditLog'))
const Network = lazyWithRetry(() => import('./pages/Network'))
const Quotas = lazyWithRetry(() => import('./pages/Quotas'))
const Budget = lazyWithRetry(() => import('./pages/Budget'))
const Settings = lazyWithRetry(() => import('./pages/Settings'))
const MyAccount = lazyWithRetry(() => import('./pages/MyAccount'))
const Tasks = lazyWithRetry(() => import('./pages/Tasks'))
const Tenders = lazyWithRetry(() => import('./pages/Tenders'))
const SLAs = lazyWithRetry(() => import('./pages/SLAs'))
const Products = lazyWithRetry(() => import('./pages/Products'))
const AuthCallback = lazyWithRetry(() => import('./pages/AuthCallback'))
const SetPassword = lazyWithRetry(() => import('./pages/SetPassword'))
const Permissions = lazyWithRetry(() => import('./pages/Permissions'))
const Approvals = lazyWithRetry(() => import('./pages/Approvals'))

// The user's landing route — dashboard for most, /approvals for
// approval-only users (brand approvers with no dashboard access).
function useHomeRoute() {
  const { canAccessPage } = useAuth()
  if (canAccessPage('dashboard')) return '/'
  if (canAccessPage('approvals')) return '/approvals'
  return '/account'
}

function Guard({ page, element }) {
  const { canAccessPage } = useAuth()
  const home = useHomeRoute()
  if (canAccessPage(page)) return element
  // Avoid redirect loops: if the blocked page IS the home target, send to /account
  return <Navigate to={page === 'dashboard' ? home : home} replace />
}

function HomeRedirect({ children }) {
  const { canAccessPage } = useAuth()
  const home = useHomeRoute()
  if (canAccessPage('dashboard')) return children
  return <Navigate to={home} replace />
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Spinner />
    </div>
  )

  // Rotas de auth — acessíveis sem sessão
  const fallback = <div className="flex items-center justify-center h-screen"><Spinner /></div>

  if (!user) return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/login"           element={<Login />} />
        <Route path="/auth/callback"   element={<AuthCallback />} />
        <Route path="/auth/set-password" element={<SetPassword />} />
        <Route path="*"                element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )

  return (
    <Layout>
      <Suspense fallback={fallback}>
        <Routes>
          <Route path="/"             element={<HomeRedirect><Guard page="dashboard" element={<DashboardIndex />} /></HomeRedirect>} />
          <Route path="/deals"        element={<Guard page="deals"       element={<Deals />} />} />
          <Route path="/clients"      element={<Guard page="clients"     element={<Clients />} />} />
          <Route path="/contacts"     element={<Guard page="contacts"    element={<Contacts />} />} />
          <Route path="/accounts"     element={<Guard page="accounts"    element={<Accounts />} />} />
          <Route path="/whitespace"   element={<Guard page="whitespace"  element={<WhiteSpace />} />} />
          <Route path="/network"      element={<Guard page="network"     element={<Network />} />} />
          <Route path="/sla"          element={<Guard page="sla"         element={<SLAs />} />} />
          <Route path="/products"     element={<Guard page="products"    element={<Products />} />} />
          <Route path="/audit"        element={<Guard page="audit"       element={<AuditLog />} />} />
          <Route path="/history"      element={<Guard page="history"     element={<History />} />} />
          <Route path="/quotas"       element={<Guard page="quotas"      element={<Quotas />} />} />
          <Route path="/tasks"        element={<Guard page="tasks"       element={<Tasks />} />} />
          <Route path="/tenders"      element={<Guard page="tenders"     element={<Tenders />} />} />
          <Route path="/budget"       element={<Guard page="budget"      element={<Budget />} />} />
          <Route path="/settings"     element={<Guard page="settings"    element={<Settings />} />} />
          <Route path="/permissions"  element={<Guard page="permissions" element={<Permissions />} />} />
          <Route path="/approvals"     element={<Guard page="approvals"    element={<Approvals />} />} />
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
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SettingsProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </SettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
