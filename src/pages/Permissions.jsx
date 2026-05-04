import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner } from '../components/ui'
import { safeJsonParse } from '../constants'
import {
  Shield, Building2, Users, Plus, Edit3, Trash2, Check, X,
  Mail, Lock, RefreshCw, AlertCircle, CheckCircle2,
  Search, Target, Copy, ChevronRight, Settings
} from 'lucide-react'

// ── Configuração das páginas disponíveis ──────────────────────────────────────
const ALL_PAGES = [
  { id:'dashboard',   label:'Dashboard',    group:'core' },
  { id:'deals',       label:'Deals',        group:'core' },
  { id:'clients',     label:'Clients',      group:'core' },
  { id:'tasks',       label:'Tasks',        group:'core' },
  { id:'tenders',     label:'Tenders',      group:'core' },
  { id:'history',     label:'History',      group:'reports' },
  { id:'quotas',      label:'Sales Targets',group:'reports' },
  { id:'budget',      label:'Budget',       group:'admin' },
  { id:'users',       label:'Users',        group:'admin' },
  { id:'settings',    label:'Settings',     group:'admin' },
  { id:'permissions', label:'Permissions',  group:'admin' },
]

const PAGE_GROUPS = {
  core:    { label:'Core',    color:'#1D9E75' },
  reports: { label:'Reports', color:'#185FA5' },
  admin:   { label:'Admin',   color:'#B45309' },
}

const COMPANY_TYPES = {
  internal_vgt: { label:'VGT (Portugal)', icon:'🇵🇹' },
  internal_ect: { label:'ECT (Spain)',    icon:'🇪🇸' },
  distributor:  { label:'Distribuidor',   icon:'🤝' },
  partner:      { label:'Parceiro',       icon:'🏢' },
  client:       { label:'Cliente',        icon:'🏥' },
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function PSBadge({ ps }) {
  if (!ps) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ color: ps.color || '#6B7280', background: (ps.color || '#6B7280') + '20' }}>
      <Shield size={9}/>{ps.name}
    </span>
  )
}

// ── Editor de Permission Set ──────────────────────────────────────────────────
function PSEditor({ ps, onSave, onCancel, existingNames }) {
  const { t } = useTranslation()
  const isNew = !ps?.id

  const [name, setName]       = useState(ps?.name || '')
  const [desc, setDesc]       = useState(ps?.description || '')
  const [color, setColor]     = useState(ps?.color || '#6B7280')
  const [pages, setPages]     = useState(() => {
    if (!ps?.pages) return []
    return Array.isArray(ps.pages) ? ps.pages : (safeJsonParse(ps.pages, []) ?? [])
  })
  const [canEdit, setCanEdit]   = useState(ps?.can_edit   ?? false)
  const [editOwn, setEditOwn]   = useState(ps?.edit_own   ?? false)
  const [canDelete, setCanDel]  = useState(ps?.can_delete ?? false)
  const [seeAll, setSeeAll]     = useState(ps?.see_all_bu ?? false)
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  const COLORS = ['#B45309','#0F6E56','#1D9E75','#7C3AED','#185FA5','#6B7280','#D85A30','#DC2626']

  function togglePage(pageId) {
    setPages(prev => prev.includes(pageId)
      ? prev.filter(p => p !== pageId)
      : [...prev, pageId]
    )
  }

  function selectGroup(groupId) {
    const groupPages = ALL_PAGES.filter(p => p.group === groupId).map(p => p.id)
    const allSelected = groupPages.every(p => pages.includes(p))
    if (allSelected) {
      setPages(prev => prev.filter(p => !groupPages.includes(p)))
    } else {
      setPages(prev => [...new Set([...prev, ...groupPages])])
    }
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Nome obrigatório.'); return }
    if (existingNames.includes(name.trim()) && name.trim() !== ps?.name) {
      setErr('Já existe um Permission Set com este nome.'); return
    }
    setSaving(true); setErr('')

    const payload = {
      name: name.trim(),
      description: desc.trim() || null,
      color,
      pages: JSON.stringify(pages),
      can_edit:   canEdit,
      edit_own:   editOwn,
      can_delete: canDelete,
      see_all_bu: seeAll,
      updated_at: new Date().toISOString(),
    }

    let error
    if (isNew) {
      const { error: e } = await supabase.from('permission_sets').insert(payload)
      error = e
    } else {
      const { error: e } = await supabase.from('permission_sets')
        .update(payload).eq('id', ps.id)
      error = e
    }

    setSaving(false)
    if (error) { setErr(error.message); return }
    onSave()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Settings size={14} className="text-navy"/>
          {isNew ? 'Novo Permission Set' : `Editar: ${ps.name}`}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
          <X size={14}/>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Nome + Cor */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="label">{t('perm_name')}</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              placeholder={t('perm_name_ph')} style={{fontSize:'16px'}}/>
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  style={{ background: c }}/>
              ))}
            </div>
          </div>
        </div>

        {/* Descrição */}
        <div>
          <label className="label">{t('perm_desc')}</label>
          <input className="input" value={desc} onChange={e => setDesc(e.target.value)}
            placeholder={t('perm_desc_ph')} style={{fontSize:'16px'}}/>
        </div>

        {/* Páginas */}
        <div>
          <label className="label mb-2">{t('perm_pages')}</label>
          {Object.entries(PAGE_GROUPS).map(([groupId, group]) => {
            const groupPages = ALL_PAGES.filter(p => p.group === groupId)
            const selectedCount = groupPages.filter(p => pages.includes(p.id)).length
            const allSelected = selectedCount === groupPages.length
            return (
              <div key={groupId} className="mb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <button onClick={() => selectGroup(groupId)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all ${
                      allSelected ? 'text-white' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'
                    }`}
                    style={allSelected ? { background: group.color } : {}}>
                    {group.label} {selectedCount}/{groupPages.length}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {groupPages.map(page => {
                    const active = pages.includes(page.id)
                    return (
                      <button key={page.id} onClick={() => togglePage(page.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          active
                            ? 'border-transparent text-white'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                        }`}
                        style={active ? { background: group.color, borderColor: group.color } : {}}>
                        {active ? <Check size={10}/> : <X size={10}/>}
                        {page.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Acções */}
        <div>
          <label className="label mb-2">{t('perm_actions')}</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key:'edit',   label:t('perm_can_edit'),          val: canEdit,   set: setCanEdit },
              { key:'own',    label:'Só os seus (edit own)',     val: editOwn,   set: setEditOwn },
              { key:'delete', label:t('perm_can_delete'),           val: canDelete, set: setCanDel },
              { key:'all',    label:t('perm_see_all_bu'),          val: seeAll,    set: setSeeAll },
            ].map(({ key, label, val, set }) => (
              <button key={key} onClick={() => set(o => !o)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium text-left transition-all ${
                  val ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-500'
                }`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                  val ? 'bg-green-500' : 'bg-gray-200'
                }`}>
                  {val && <Check size={10} className="text-white"/>}
                </div>
                {label}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            <AlertCircle size={13}/> {err}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="btn-secondary flex-1 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary flex-1 text-sm">
            {saving ? <RefreshCw size={13} className="animate-spin mx-auto"/> : (isNew ? 'Criar' : 'Guardar')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lista de Permission Sets ───────────────────────────────────────────────────
function PermissionSetsTab({ permSets, profiles, onRefresh }) {
  const { t } = useTranslation()
  const [editing, setEditing]   = useState(null) // null = fechado, 'new' = novo, {id,...} = editar
  const [deleting, setDeleting] = useState(null)

  async function handleDelete(id) {
    // Verificar se há profiles associados
    const users = profiles.filter(p => p.permission_set_id === id)
    if (users.length > 0) {
      alert(`Não é possível apagar — ${users.length} utilizador(es) têm este Permission Set.`)
      return
    }
    await supabase.from('permission_sets').delete().eq('id', id)
    onRefresh()
  }

  async function handleDuplicate(ps) {
    const { id, created_at, updated_at, is_system, ...rest } = ps
    await supabase.from('permission_sets').insert({
      ...rest,
      name: `${ps.name} (cópia)`,
      is_system: false,
    })
    onRefresh()
  }

  const existingNames = permSets.map(ps => ps.name)

  if (editing) {
    return (
      <PSEditor
        ps={editing === 'new' ? null : editing}
        onSave={() => { setEditing(null); onRefresh() }}
        onCancel={() => setEditing(null)}
        existingNames={existingNames}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Shield size={15} className="text-navy"/>
            Permission Sets
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Cria templates de permissões e depois atribui aos utilizadores.
          </p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary text-xs gap-1">
          <Plus size={12}/> Novo set
        </button>
      </div>

      <div className="space-y-2">
        {permSets.map(ps => {
          const pages = Array.isArray(ps.pages) ? ps.pages : (safeJsonParse(ps.pages, []) ?? [])
          const userCount = profiles.filter(p => p.permission_set_id === ps.id).length

          return (
            <div key={ps.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Cor indicator */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: (ps.color || '#6B7280') + '20' }}>
                    <Shield size={18} style={{ color: ps.color || '#6B7280' }}/>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{ps.name}</p>
                      {ps.is_system && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{t('perm_system')}</span>
                      )}
                      <span className="text-[10px] text-gray-400">{userCount} utilizador{userCount !== 1 ? 'es' : ''}</span>
                    </div>

                    {ps.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{ps.description}</p>
                    )}

                    {/* Páginas */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ALL_PAGES.map(page => {
                        const has = pages.includes(page.id)
                        const grp = PAGE_GROUPS[page.group]
                        return (
                          <span key={page.id}
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                            style={has
                              ? { background: grp.color + '20', color: grp.color }
                              : { background: '#F3F4F6', color: '#D1D5DB' }
                            }>
                            {page.label}
                          </span>
                        )
                      })}
                    </div>

                    {/* Acções rápidas */}
                    <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
                      {ps.can_edit   && <span className="text-green-600">✓ Editar</span>}
                      {ps.edit_own   && <span className="text-blue-600">✓ Só próprios</span>}
                      {ps.can_delete && <span className="text-amber-600">✓ Apagar</span>}
                      {ps.see_all_bu && <span className="text-purple-600">✓ Todas as BUs</span>}
                    </div>
                  </div>

                  {/* Acções */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleDuplicate(ps)}
                      title="Duplicar"
                      className="text-gray-300 hover:text-gray-500 p-1 transition-colors">
                      <Copy size={13}/>
                    </button>
                    {!ps.is_system && (
                      <>
                        <button onClick={() => setEditing(ps)}
                          title="Editar"
                          className="text-gray-300 hover:text-navy p-1 transition-colors">
                          <Edit3 size={13}/>
                        </button>
                        <button onClick={() => handleDelete(ps.id)}
                          title="Apagar"
                          className="text-gray-300 hover:text-red-500 p-1 transition-colors">
                          <Trash2 size={13}/>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── User Card com atribuição de Permission Set ────────────────────────────────
function UserCard({ profile, permSets, companies, salesOwners, onSaved, isSelf }) {
  const { t } = useTranslation()
  const [open, setOpen]     = useState(false)
  const [psId, setPsId]     = useState(profile.permission_set_id || '')
  const [active, setActive] = useState(profile.active !== false)
  const [ownerId, setOwner] = useState(profile.sales_owner_id || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const company = companies.find(c => c.id === profile.company_id)
  const ps = permSets.find(p => p.id === (profile.permission_set_id || psId))

  async function save() {
    setSaving(true)
    await supabase.from('profiles').update({
      permission_set_id: psId || null,
      sales_owner_id:    ownerId || null,
      sales_owner_name:  salesOwners.find(o => o.id === ownerId)?.name || null,
      active,
    }).eq('id', profile.id)
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 1500)
    onSaved()
  }

  const pages = ps?.pages
    ? (Array.isArray(ps.pages) ? ps.pages : (safeJsonParse(ps.pages, []) ?? []))
    : []

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${
      isSelf ? 'border-amber-300 border-2' : 'border-gray-200'
    } ${!active ? 'opacity-60' : ''}`}>
      <div className="p-3 flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: (ps?.color || '#6B7280') + '20',
            color: ps?.color || '#6B7280'
          }}>
          {(profile.full_name || profile.email || '?')[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {profile.full_name || profile.email?.split('@')[0]}
              {isSelf && <span className="ml-1 text-[10px] text-amber-600">(you)</span>}
            </p>
            {ps && <PSBadge ps={ps}/>}
            {!active && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">{t('perm_inactive')}</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">{profile.email}</p>
          {company && (
            <p className="text-[10px] text-gray-400 mt-0.5">
              {COMPANY_TYPES[company.type]?.icon} {company.name}
              {profile.bu && <span className="ml-1.5 font-medium">{profile.bu}</span>}
            </p>
          )}
          {/* Mini page list */}
          <div className="flex flex-wrap gap-1 mt-1">
            {ALL_PAGES.map(page => {
              const has = pages.includes(page.id)
              const grp = PAGE_GROUPS[page.group]
              return (
                <span key={page.id}
                  className="text-[9px] px-1 py-0.5 rounded"
                  style={has
                    ? { background: grp.color + '20', color: grp.color }
                    : { color: '#D1D5DB' }
                  }>
                  {page.label}
                </span>
              )
            })}
          </div>
        </div>

        <button onClick={() => setOpen(o => !o)}
          className="shrink-0 text-gray-300 hover:text-navy p-1 transition-colors">
          {open ? <X size={14}/> : <Edit3 size={14}/>}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-3 space-y-3 bg-gray-50">

          {/* Permission Set */}
          <div>
            <label className="label">{t('perm_set_label')}</label>
            <div className="space-y-1.5">
              {permSets.map(p => {
                const active = psId === p.id
                return (
                  <button key={p.id} onClick={() => setPsId(p.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                      active ? 'border-2' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    style={active ? { borderColor: p.color, background: p.color + '08' } : {}}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: p.color + '20' }}>
                      <Shield size={12} style={{ color: p.color }}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">{p.name}</p>
                      {p.description && <p className="text-[10px] text-gray-400 truncate">{p.description}</p>}
                    </div>
                    {active && <Check size={12} style={{ color: p.color }} className="shrink-0"/>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sales Owner */}
          <div>
            <label className="label">{t('perm_sales_owner')}</label>
            <select className="select text-sm" value={ownerId}
              onChange={e => setOwner(e.target.value)}>
              <option value="">— Sem ligação —</option>
              {salesOwners.filter(o => o.active).map(o => (
                <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
              ))}
            </select>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">{t('perm_account_active')}</label>
            <button onClick={() => setActive(o => !o)} disabled={isSelf}
              className={`w-10 h-5 rounded-full transition-colors relative ${active ? 'bg-green-400' : 'bg-gray-200'} disabled:opacity-40`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`}/>
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-xs">Cancelar</button>
            <button onClick={save} disabled={saving || isSelf}
              className="btn-primary flex-1 text-xs">
              {saving ? <RefreshCw size={12} className="animate-spin mx-auto"/> : saved ? '✓ Guardado' : 'Guardar'}
            </button>
          </div>
          {isSelf && <p className="text-[10px] text-amber-600 text-center">Não podes editar o teu próprio perfil.</p>}
        </div>
      )}
    </div>
  )
}

// ── Empresas ──────────────────────────────────────────────────────────────────
function CompaniesSection({ companies, onRefresh }) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name:'', type:'distributor', country:'' })
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('companies').insert({
      name: form.name.trim(), type: form.type,
      bu: form.type === 'internal_vgt' ? 'VGT' : form.type === 'internal_ect' ? 'ECT' : null,
      country: form.country || null, active: true,
    })
    setForm({ name:'', type:'distributor', country:'' })
    setAdding(false); setSaving(false); onRefresh()
  }

  const grouped = useMemo(() => {
    const g = {}
    companies.forEach(co => { if (!g[co.type]) g[co.type] = []; g[co.type].push(co) })
    return g
  }, [companies])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Building2 size={15} className="text-navy"/>Empresas
        </h2>
        <button onClick={() => setAdding(o => !o)} className="btn-primary text-xs gap-1">
          <Plus size={12}/> Nova empresa
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('perm_name')}</label>
              <input className="input" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}
                placeholder={t('perm_company_ph')} style={{fontSize:'16px'}}/>
            </div>
            <div>
              <label className="label">{t('perm_type')}</label>
              <select className="select" value={form.type}
                onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                {Object.entries(COMPANY_TYPES).map(([k,v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">País</label>
              <input className="input" value={form.country}
                onChange={e => setForm(f => ({...f, country: e.target.value}))}
                placeholder={t('perm_country_ph')} style={{fontSize:'16px'}}/>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="btn-secondary flex-1 text-xs">Cancelar</button>
            <button onClick={handleAdd} disabled={!form.name.trim() || saving}
              className="btn-primary flex-1 text-xs">
              {saving ? 'A guardar…' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(grouped).map(([type, list]) => {
          const cfg = COMPANY_TYPES[type] || { label: type, icon:'🏢' }
          return (
            <div key={type} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span>{cfg.icon}</span>
                <p className="text-xs font-bold text-gray-700">{cfg.label}</p>
                <span className="ml-auto text-xs text-gray-400">{list.filter(c=>c.active).length} activas</span>
              </div>
              {list.map(co => (
                <div key={co.id} className={`px-3 py-2.5 flex items-center gap-2 border-b border-gray-50 last:border-0 ${!co.active ? 'opacity-40' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{co.name}</p>
                    {co.country && <p className="text-[10px] text-gray-400">{co.country}</p>}
                  </div>
                  <button onClick={async () => { await supabase.from('companies').update({active:!co.active}).eq('id',co.id); onRefresh() }}
                    className={`w-7 h-3.5 rounded-full transition-colors relative shrink-0 ${co.active ? 'bg-green-400' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${co.active ? 'translate-x-3.5' : 'translate-x-0.5'}`}/>
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sales Targets ─────────────────────────────────────────────────────────────
function SalesTargetsSection({ companies, onRefresh }) {
  const { t } = useTranslation()
  const [quotas, setQuotas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving]   = useState(false)

  async function load() {
    const { data } = await supabase.from('quotas').select('*').not('company_id', 'is', null)
    setQuotas(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const distCompanies = companies.filter(c =>
    !['internal_vgt','internal_ect'].includes(c.type) && c.active
  )

  function getTarget(companyId) {
    return quotas.find(q => q.company_id === companyId)?.target_eur || 0
  }

  async function handleSave(companyId) {
    setSaving(true)
    const val = parseFloat(editVal) || 0
    const existing = quotas.find(q => q.company_id === companyId)
    if (existing) {
      await supabase.from('quotas').update({ target_eur: val }).eq('id', existing.id)
    } else {
      const co = companies.find(c => c.id === companyId)
      await supabase.from('quotas').insert({
        company_id: companyId,
        bu: co?.bu || 'VGT',
        sales_owner: co?.name || '',
        target_eur: val,
        fiscal_year: 2026,
      })
    }
    setSaving(false); setEditing(null); setEditVal('')
    load(); onRefresh()
  }

  if (loading) return <div className="flex justify-center p-8"><div className="w-5 h-5 border-2 border-navy border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Target size={15} className="text-navy"/>Sales Targets por empresa
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">Objetivo anual FY26 para distribuidores e parceiros.</p>
      </div>

      {distCompanies.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">Sem distribuidores activos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {distCompanies.map(co => {
            const target = getTarget(co.id)
            const isEditing = editing === co.id
            const cfg = COMPANY_TYPES[co.type] || { icon:'🏢' }
            return (
              <div key={co.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-lg shrink-0">
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{co.name}</p>
                    <p className="text-xs text-gray-400">{co.bu || co.country || '—'}</p>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <input className="input w-32 text-right pr-7 text-sm" type="number"
                          value={editVal} onChange={e => setEditVal(e.target.value)}
                          placeholder="0" style={{fontSize:'16px'}}/>
                        <span className="absolute right-2 top-2.5 text-xs text-gray-400">€</span>
                      </div>
                      <button onClick={() => handleSave(co.id)} disabled={saving}
                        className="btn-primary text-xs px-3 py-1.5">
                        {saving ? '…' : <Check size={12}/>}
                      </button>
                      <button onClick={() => setEditing(null)} className="btn-secondary text-xs px-2 py-1.5">
                        <X size={12}/>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">
                          {target > 0 ? `${target >= 1000 ? Math.round(target/1000)+'K€' : target+'€'}` : '—'}
                        </p>
                        <p className="text-[10px] text-gray-400">{t('perm_target_fy26')}</p>
                      </div>
                      <button onClick={() => { setEditing(co.id); setEditVal(target > 0 ? String(target) : '') }}
                        className="text-gray-300 hover:text-navy p-1 transition-colors">
                        <Edit3 size={14}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Convidar utilizador ───────────────────────────────────────────────────────
// Collapsible wrapper around InviteSection used inside the Users tab.
// Replaces the old standalone "Invite" tab.
function UsersInviteBlock({ companies, salesOwners, permSets, onSaved }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-card bg-white overflow-hidden">
      <button type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="w-8 h-8 rounded-full bg-navy/10 text-navy flex items-center justify-center">+</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{t('perm_invite_title')}</p>
          <p className="text-micro text-gray-400">{t('perm_invite_subtitle')}</p>
        </div>
        <span className="text-gray-300 text-sm">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          <InviteSection companies={companies} salesOwners={salesOwners} permSets={permSets} onSaved={onSaved}/>
        </div>
      )}
    </div>
  )
}

function InviteSection({ companies, salesOwners, permSets, onSaved }) {
  const { t } = useTranslation()
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [psId, setPsId]       = useState('')
  const [companyId, setComp]  = useState('')
  const [ownerId, setOwner]   = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState(null)

  async function handleInvite() {
    if (!email.trim()) return
    setSending(true); setResult(null)
    const ps = permSets.find(p => p.id === psId)
    const co = companies.find(c => c.id === companyId)
    const bu = co?.type === 'internal_vgt' ? 'VGT' : co?.type === 'internal_ect' ? 'ECT' : co?.bu || null
    // Derivar o role do permission_set para retrocompatibilidade
    const roleMap = {
      'Admin':'admin','Manager':'manager','Member':'member',
      'Distributor':'distributor','Viewer':'viewer','Partner':'partner'
    }
    const role = roleMap[ps?.name] || 'viewer'

    try {
      const trimmedEmail = email.toLowerCase().trim()

      // Step 1: Create auth user via signUp with a random temporary password
      const tempPassword = crypto.randomUUID() + '-Aa1!' // ensure complexity requirements
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: tempPassword,
        options: {
          data: { full_name: name || trimmedEmail.split('@')[0] },
        },
      })

      if (signUpError) throw signUpError

      const newUserId = signUpData.user?.id
      if (!newUserId) throw new Error('Sign-up succeeded but no user ID returned.')

      // If the user already existed (fake signup), identities will be empty
      if (signUpData.user?.identities?.length === 0) {
        throw new Error('Este email já está registado no sistema.')
      }

      // Step 2: Create the profile with the correct role, BU, company, etc.
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: newUserId,
        email: trimmedEmail,
        full_name: name || null,
        role,
        bu,
        company_id: companyId || null,
        permission_set_id: psId || null,
        sales_owner_id: ownerId || null,
        sales_owner_name: salesOwners.find(o => o.id === ownerId)?.name || null,
        active: true,
      }, { onConflict: 'id' })

      if (profileError) throw profileError

      // Step 3: Send password reset email so the user can set their own password
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      })

      if (resetError) {
        // Non-fatal: profile was created, user just won't get the reset email
        console.warn('Password reset email failed:', resetError.message)
      }

      setResult({
        ok: true,
        msg: `Utilizador ${trimmedEmail} criado com sucesso! Foi enviado um email para definir a password.`,
      })
      setEmail(''); setName(''); setPsId(''); setComp(''); setOwner('')
      onSaved()
    } catch (err) {
      setResult({ ok: false, msg: err.message })
    }
    setSending(false)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
        <Mail size={15} className="text-navy"/>Adicionar utilizador
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome (opcional)</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)}
              style={{fontSize:'16px'}}/>
          </div>
          <div>
            <label className="label">{t('perm_email_req')}</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={{fontSize:'16px'}}/>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Permission Set *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {permSets.map(p => (
                <button key={p.id} onClick={() => setPsId(p.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${
                    psId === p.id ? 'border-2' : 'border-gray-200 bg-white'
                  }`}
                  style={psId === p.id ? { borderColor: p.color, background: p.color + '10' } : {}}>
                  <div className="w-4 h-4 rounded shrink-0" style={{ background: p.color }}/>
                  <span className="font-medium text-gray-800 truncate">{p.name}</span>
                  {psId === p.id && <Check size={10} style={{ color: p.color }} className="ml-auto shrink-0"/>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{t('perm_companies')}</label>
            <select className="select" value={companyId} onChange={e => setComp(e.target.value)}>
              <option value="">— Sem empresa —</option>
              {companies.filter(c=>c.active).map(co => (
                <option key={co.id} value={co.id}>
                  {COMPANY_TYPES[co.type]?.icon} {co.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sales Owner</label>
            <select className="select" value={ownerId} onChange={e => setOwner(e.target.value)}>
              <option value="">— Sem ligação —</option>
              {salesOwners.filter(o=>o.active).map(o => (
                <option key={o.id} value={o.id}>{o.name} · {o.bu}</option>
              ))}
            </select>
          </div>
        </div>

        {result && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.ok ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
            {result.msg}
          </div>
        )}

        <button onClick={handleInvite} disabled={!email.trim() || sending}
          className="btn-primary w-full disabled:opacity-50">
          {sending ? <RefreshCw size={14} className="animate-spin mx-auto"/> : <><Mail size={14}/><span>Convidar utilizador</span></>}
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Permissions() {
  const { t } = useTranslation()
  const { isAdmin, user, loading: authLoading } = useAuth()
  const [permSets, setPermSets]     = useState([])
  const [profiles, setProfiles]     = useState([])
  const [companies, setCompanies]   = useState([])
  const [salesOwners, setSalesOwners] = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('sets')
  const [buFilter, setBuFilter]     = useState('all')
  const [search, setSearch]         = useState('')

  async function load() {
    const [ps, pr, co, so] = await Promise.all([
      supabase.from('permission_sets').select('*').order('is_system', {ascending:false}).order('name'),
      supabase.from('profiles').select('*').order('role').order('email'),
      supabase.from('companies').select('*').order('type').order('name'),
      supabase.from('sales_owners').select('*').eq('active',true).order('bu').order('name'),
    ])
    setPermSets(ps.data || [])
    setProfiles(pr.data || [])
    setCompanies(co.data || [])
    setSalesOwners(so.data || [])
    setLoading(false)
  }

  useEffect(() => { if (!authLoading) load() }, [authLoading])

  if (authLoading || loading) return <div className="flex items-center justify-center h-64"><Spinner/></div>

  if (!isAdmin) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <Lock size={32} className="mx-auto mb-2 opacity-30"/>
        <p className="text-sm">Acesso restrito — apenas admin.</p>
      </div>
    </div>
  )

  const filteredProfiles = profiles.filter(p => {
    const matchBU = buFilter === 'all' || p.bu === buFilter
    const matchSearch = !search || p.email?.toLowerCase().includes(search.toLowerCase()) || p.full_name?.toLowerCase().includes(search.toLowerCase())
    return matchBU && matchSearch
  })

  // Tabs. The old "Sales Targets" tab was removed (duplicated with /quotas),
  // and "Invite" is merged into "Users" as a primary CTA inside that tab.
  const TABS = [
    { id:'sets',      label:t('perm_roles_title'),  count: permSets.length },
    { id:'users',     label:t('perm_users_title'),  count: profiles.length },
    { id:'companies', label:t('perm_companies'),    count: companies.length },
  ]

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Shield size={20} className="text-navy"/>Permissions
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {profiles.length} utilizadores · {permSets.length} permission sets
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map(t_ => (
          <button key={t_.id} onClick={() => setTab(t_.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t_.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t_.label}
            {t_.count !== undefined && (
              <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{t_.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Permission Sets */}
      {tab === 'sets' && (
        <PermissionSetsTab permSets={permSets} profiles={profiles} onRefresh={load}/>
      )}

      {/* Tab: Users (now includes the Invite flow as a collapsible section) */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Invite — was a separate tab before; now lives as a collapsible CTA at the top of Users */}
          <UsersInviteBlock
            companies={companies}
            salesOwners={salesOwners}
            permSets={permSets}
            onSaved={load}
          />

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <input className="input pl-8 text-sm" placeholder={t('perm_search_ph')}
                value={search} onChange={e => setSearch(e.target.value)} style={{fontSize:'16px'}}/>
              <Search size={14} className="absolute left-2.5 top-3 text-gray-400"/>
            </div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {['all','VGT','ECT'].map(bu => (
                <button key={bu} onClick={() => setBuFilter(bu)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    buFilter === bu ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}>
                  {bu === 'all' ? t('perm_all') : bu}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filteredProfiles.map(p => (
              <UserCard key={p.id} profile={p}
                permSets={permSets} companies={companies} salesOwners={salesOwners}
                onSaved={load} isSelf={p.id === user?.id}/>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Companies */}
      {tab === 'companies' && (
        <CompaniesSection companies={companies} onRefresh={load}/>
      )}
    </div>
  )
}
