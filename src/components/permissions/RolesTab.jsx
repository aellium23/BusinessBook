import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../hooks/useTranslation'
import { safeJsonParse } from '../../constants'
import {
  Shield, Plus, Edit3, Trash2, Check, X,
  RefreshCw, AlertCircle, Copy, Settings
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
                    className={`text-micro font-bold px-2 py-0.5 rounded-full transition-all ${
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
export default function RolesTab({ permSets, profiles, onRefresh }) {
  const { t } = useTranslation()
  const [editing, setEditing]   = useState(null) // null = fechado, 'new' = novo, {id,...} = editar

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
                        <span className="text-micro bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{t('perm_system')}</span>
                      )}
                      <span className="text-micro text-gray-400">{userCount} utilizador{userCount !== 1 ? 'es' : ''}</span>
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
                            className="text-micro px-1.5 py-0.5 rounded font-medium"
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
                    <div className="flex gap-3 mt-2 text-micro text-gray-400">
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
