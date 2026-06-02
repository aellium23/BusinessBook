import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { HelpCircle, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

// ── Help content per page ────────────────────────────────────────────────────
const HELP = {
  '/': {
    title: 'Dashboard',
    description: 'Your central command center showing pipeline health, revenue metrics, and team performance at a glance.',
    features: [
      'Switch between Summary and Classic views using the tabs at the top.',
      'KPI cards show live totals — click any card to drill into the underlying deals.',
      'Charts update in real time as deals progress through stages.',
    ],
    admin: 'As an admin you can see data across all business units. Use the BU filter to focus on VGT or ECT.',
    viewer: 'You have read-only access. Contact your admin to request edit permissions.',
  },
  '/deals': {
    title: 'Deals',
    description: 'Manage your sales pipeline from lead to invoice. View deals as a list, Kanban board, or on a map.',
    features: [
      'Use the view switcher (List / Kanban / Map) to change how deals are displayed.',
      'Drag deals between columns in Kanban view to update their stage.',
      'Click "+ Deal" to create a new deal with the quick form.',
      'Use filters and search to narrow down by stage, BU, owner, or date range.',
    ],
    admin: 'You can edit or delete any deal regardless of ownership. Bulk actions are available in list view.',
    viewer: 'You can view deal details but cannot create or modify deals.',
  },
  '/clients': {
    title: 'Clients',
    description: 'Your client directory. Each client can have multiple contacts, accounts, and associated deals.',
    features: [
      'Search clients by name, country, or segment.',
      'Click a client row to see full details including linked contacts and deal history.',
      'Use the "+" button to add a new client record.',
    ],
    admin: 'You can merge duplicate clients and manage client segments.',
    viewer: 'You can browse clients but cannot add or edit records.',
  },
  '/contacts': {
    title: 'Contacts',
    description: 'Individual contacts linked to client organizations. Track key stakeholders and decision-makers.',
    features: [
      'Each contact is linked to a client — select the client first when creating a contact.',
      'Add phone, email, and role information for each contact.',
      'Use contacts when assigning deal stakeholders.',
    ],
    admin: 'You can manage all contacts across the organization.',
    viewer: 'You can view contact details in read-only mode.',
  },
  '/accounts': {
    title: 'Accounts',
    description: 'Account records representing billing entities or organizational divisions within clients.',
    features: [
      'Accounts are linked to clients and can be associated with deals for invoicing.',
      'Track account-level revenue and contract details.',
    ],
    admin: 'Full create, edit, and delete access to all accounts.',
  },
  '/tasks': {
    title: 'Tasks',
    description: 'Track action items, follow-ups, and deadlines. Tasks can be linked to deals or stand alone.',
    features: [
      'Create tasks with due dates, priorities, and assignees.',
      'Overdue tasks appear with a red badge in the navigation.',
      'Filter by status (open / done / overdue) or assigned user.',
    ],
    admin: 'You can reassign tasks between any team members.',
  },
  '/tenders': {
    title: 'Tenders',
    description: 'Manage tender submissions and RFP responses. Track deadlines and submission status.',
    features: [
      'Create tender records with requirements, deadlines, and linked deals.',
      'Track tender status from draft through submission to award.',
      'Attach documents and proposals to tender records.',
    ],
    admin: 'You can view and manage all tenders across business units.',
  },
  '/sla': {
    title: 'Contracts & SLAs',
    description: 'Manage service-level agreements and recurring contracts with clients.',
    features: [
      'Define SLA terms including response times and uptime guarantees.',
      'Track contract renewal dates and recurring revenue.',
      'Set up alerts for contracts approaching expiration.',
    ],
    admin: 'You can create and modify SLA templates for the organization.',
  },
  '/products': {
    title: 'Products',
    description: 'Your product catalog. Products can be added as line items to deals.',
    features: [
      'Manage product names, codes, and pricing.',
      'Products are referenced when building deal line items.',
      'Organize products by category or business unit.',
    ],
    admin: 'You can add, edit, or archive products in the catalog.',
  },
  '/budget': {
    title: 'Budget',
    description: 'Financial planning with Profit & Loss views and Forecast (FCT) tracking.',
    features: [
      'Compare actual revenue against budget targets.',
      'View P&L breakdowns by business unit or time period.',
      'FCT tab shows rolling forecasts based on pipeline data.',
    ],
    admin: 'You can set and adjust budget targets for all business units.',
  },
  '/network': {
    title: 'Network',
    description: 'Manage your distribution network including distributors and hub locations.',
    features: [
      'View and manage distributor relationships.',
      'Track hub locations and their associated territories.',
      'Link network entities to deals and clients.',
    ],
    admin: 'You can configure network hierarchy and assign territories.',
  },
  '/quotas': {
    title: 'Quotas',
    description: 'Sales quota tracking and target management for individuals and teams.',
    features: [
      'View quota attainment percentages and progress bars.',
      'Compare performance across team members or periods.',
    ],
    admin: 'You can set and adjust quotas for all team members.',
  },
  '/whitespace': {
    title: 'WhiteSpace',
    description: 'Identify untapped opportunities by analyzing gaps in your client-product coverage.',
    features: [
      'The matrix shows clients vs. products — gaps highlight upsell opportunities.',
      'Click a cell to see existing deals or create a new one for that combination.',
    ],
    admin: 'You can see whitespace data across all business units.',
  },
  '/history': {
    title: 'History',
    description: 'Browse historical deal data and track changes over time.',
    features: [
      'View past deal stages, amounts, and outcomes.',
      'Filter history by date range, client, or deal owner.',
    ],
  },
  '/settings': {
    title: 'Settings',
    description: 'Configure application preferences, business units, stages, and system parameters.',
    features: [
      'Manage deal stages, forecast categories, and currency settings.',
      'Configure business unit structure and team assignments.',
      'Adjust system-wide defaults and display options.',
    ],
    admin: 'Full access to all settings. Changes affect all users in the organization.',
  },
  '/permissions': {
    title: 'Permissions',
    description: 'Manage user roles and permission sets that control access throughout the application.',
    features: [
      'Create custom permission sets with granular page-level access.',
      'Assign permission sets to users to override default role permissions.',
      'Control edit, delete, and visibility scopes per permission set.',
    ],
    admin: 'You are managing permissions for all users. Be careful with changes — they take effect immediately.',
  },
  '/audit': {
    title: 'Audit Log',
    description: 'Track all changes made across the system for compliance and accountability.',
    features: [
      'View who changed what and when, with before/after values.',
      'Filter by user, entity type, or date range.',
    ],
    admin: 'You have full access to the audit trail. Use this to investigate data discrepancies.',
  },
}

const DEFAULT_HELP = {
  title: 'Help',
  description: 'Welcome to BusinessBook CRM. Use the navigation menu to access different modules.',
  features: ['Click the help button on any page for context-specific guidance.'],
}

// ── Component ────────────────────────────────────────────────────────────────
export default function HelpGuide() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { role } = useAuth()

  // Close panel on page change
  useEffect(() => { setOpen(false) }, [pathname])

  const page = HELP[pathname] || DEFAULT_HELP
  const roleTip = role === 'admin' ? page.admin : role === 'viewer' ? page.viewer : null

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open help"
        className="fixed bottom-20 sm:bottom-6 right-4 z-50 w-11 h-11 rounded-full bg-navy text-white shadow-lg flex items-center justify-center hover:bg-navy/90 transition-colors focus:outline-none focus:ring-2 focus:ring-navy/50"
      >
        <HelpCircle size={22} />
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/20 z-[60]" onClick={() => setOpen(false)} />
      )}

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[90vw] bg-white shadow-2xl z-[70] transform transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{page.title}</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{page.description}</p>

          {page.features?.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Features</h3>
              <ul className="space-y-2 mb-4">
                {page.features.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                    <span className="text-navy mt-0.5 shrink-0">&#8226;</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {roleTip && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mt-2">
              <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
                {role === 'admin' ? 'Admin Tip' : 'Note'}
              </h3>
              <p className="text-sm text-blue-700 leading-snug">{roleTip}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
