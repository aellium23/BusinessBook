import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './../lib/supabase'
import { useAuth } from './useAuth'

/**
 * Which companies the signed-in person may act for, and which of them they are
 * looking at right now.
 *
 * One person can be an officer of two distributors — the CEO of TIMED Chile is
 * also an officer of TIMED Peru — and used to need two accounts to be both. The
 * database now answers "may I act for this company?" from a membership list;
 * this is the same answer on the screen, so the two cannot drift.
 *
 * `scope` is 'all' or a single company id, and `ids` is what every query should
 * filter on. They open on everything, because the first question is how the
 * whole book is doing; narrowing to one company is a deliberate act and it is
 * remembered.
 *
 * The distinction that matters: `ids` is for READING and `homeId` is for
 * WRITING. A deal belongs to one company, so creating one while looking at
 * everything has to pick — and the answer is the home company unless the
 * reader has narrowed to one, in which case the one they are looking at is
 * obviously the one they mean.
 */

const ScopeContext = createContext(null)
const STORAGE_KEY = 'bb_company_scope'

export function CompanyScopeProvider({ children }) {
  const { profile } = useAuth()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState(() => {
    if (typeof window === 'undefined') return 'all'
    return localStorage.getItem(STORAGE_KEY) || 'all'
  })

  useEffect(() => {
    let alive = true
    if (!profile?.id) { setCompanies([]); setLoading(false); return }
    supabase
      .from('company_members')
      .select('company_id, companies:company_id(id, name, country, bu)')
      .eq('profile_id', profile.id)
      .then(({ data, error }) => {
        if (!alive) return
        // A missing table — the migration not run yet — must not lock anybody
        // out of their own company. Fall back to the home company alone, which
        // is exactly what the app did before memberships existed.
        if (error || !data) {
          setCompanies(profile.company_id
            ? [{ id: profile.company_id, name: profile.company_name || '' }]
            : [])
        } else {
          setCompanies(data.map(r => r.companies).filter(Boolean)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '')))
        }
        setLoading(false)
      })
    return () => { alive = false }
  }, [profile?.id, profile?.company_id, profile?.company_name])

  // A remembered scope can name a company somebody no longer belongs to.
  // Falling back to everything is the safe direction: it shows them less than
  // they might expect, never more.
  const effective = useMemo(() => {
    if (scope === 'all') return 'all'
    return companies.some(c => c.id === scope) ? scope : 'all'
  }, [scope, companies])

  const value = useMemo(() => {
    const ids = effective === 'all' ? companies.map(c => c.id) : [effective]
    return {
      companies,
      loading,
      scope: effective,
      multi: companies.length > 1,
      /** What every read should filter on. Empty means "no company of my own". */
      ids,
      /** The company a new record belongs to. */
      homeId: effective === 'all' ? (profile?.company_id || null) : effective,
      /** Whether a given row is in view. */
      inScope: companyId => ids.includes(companyId),
      setScope: next => {
        setScope(next)
        try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private window */ }
      },
    }
  }, [companies, loading, effective, profile?.company_id])

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useCompanyScope() {
  return useContext(ScopeContext) || {
    companies: [], loading: false, scope: 'all', multi: false, ids: [],
    homeId: null, inScope: () => false, setScope: () => {},
  }
}
