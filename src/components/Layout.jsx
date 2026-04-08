import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOut } from '../lib/supabase'
import { LayoutDashboard, List, DollarSign, Users, LogOut, ChevronRight } from 'lucide-react'

const nav = [
  { to: '/',       icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/deals',  icon: List,            label: 'Deals'     },
  { to: '/budget', icon: DollarSign,      label: 'Budget', adminOnly: true },
  { to: '/users',  icon: Users,           label: 'Users',  adminOnly: true },
]

export default function Layout({ children }) {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg tracking-tight">
            <span className="text-vgt">B</span><span className="text-ect">B</span>
          </span>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-white text-sm font-semibold">Business Book · FY26</span>
            <span className="text-white/70 text-[10px] font-medium tracking-wide">Developed by Elio Santos · Powered by AI</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs hidden sm:inline">{profile?.full_name || profile?.email}</span>
          <span className={`text-xs px-2 py-0.5 rounded font-bold ${
            isAdmin ? 'bg-amber-400 text-amber-900' :
            profile?.role === 'vgt' ? 'bg-vgt text-white' :
            profile?.role === 'ect' ? 'bg-ect text-white' : 'bg-gray-500 text-white'
          }`}>
            {(profile?.role || '').toUpperCase()}
          </span>
          <button onClick={handleSignOut} className="text-white/60 hover:text-white transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1">
        {/* Sidebar — desktop */}
        <aside className="hidden sm:flex flex-col w-52 bg-white border-r border-gray-100 py-4 gap-1 shrink-0">
          {nav.filter(n => !n.adminOnly || isAdmin).map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-100'
                }`
              }>
              <Icon size={16} />
              {label}
              <ChevronRight size={14} className="ml-auto opacity-30" />
            </NavLink>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto pb-20 sm:pb-4 relative">
          {/* Watermark */}
          <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-0"
            style={{ left: '13rem' }}>
            <svg viewBox="0 0 340 400" xmlns="http://www.w3.org/2000/svg"
              style={{ width: 'min(40vw, 380px)', opacity: 0.055 }}>
              {/* Left blade — tapers from top-left to bottom centre */}
              <path d="M 10 10 C 10 10 170 10 175 18 C 178 24 172 32 170 40 L 168 50 L 170 380 C 170 380 10 10 10 10 Z"
                fill="#0D2137"/>
              {/* Right blade — mirror, dark red */}
              <path d="M 330 10 C 330 10 170 10 165 18 C 162 24 168 32 170 40 L 172 50 L 170 380 C 170 380 330 10 330 10 Z"
                fill="#7B1C2E"/>
            </svg>
          </div>
          <div className="relative z-10">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom nav — mobile */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
        {nav.filter(n => !n.adminOnly || isAdmin).map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-navy' : 'text-gray-400'
              }`
            }>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
