import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { updatePassword } from '../lib/supabase'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, User, Building2, Shield } from 'lucide-react'

const ROLE_LABELS = {
  admin:       'Admin',
  manager:     'Manager',
  member:      'Member',
  distributor: 'Distributor',
  viewer:      'Viewer',
  partner:     'Partner',
}

export default function MyAccount() {
  const { t } = useTranslation()
  const { profile, company, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)

  const checks = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    number:  /[0-9]/.test(password),
    match:   password === confirm && confirm.length > 0,
  }
  const isValid = Object.values(checks).every(Boolean)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true); setError('')
    const { error: err } = await updatePassword(password)
    if (err) {
      setError(err.message)
    } else {
      setSuccess(true)
      setPassword(''); setConfirm('')
      setTimeout(() => setSuccess(false), 3000)
    }
    setLoading(false)
  }

  const roleCfg = ROLE_LABELS[profile?.role] || profile?.role || '—'

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5 pt-1">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <User size={20} className="text-navy"/>
          {t('account_title')}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">{t('account_subtitle')}</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{t('account_profile')}</h2>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-navy/10 flex items-center justify-center text-navy font-bold text-lg shrink-0">
            {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {profile?.full_name || profile?.email?.split('@')[0] || '—'}
            </p>
            <p className="text-sm text-gray-400 truncate">{profile?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1 flex items-center gap-1">
              <Shield size={9}/> Role
            </p>
            <p className="text-sm font-semibold text-gray-800">{roleCfg}</p>
          </div>
          {profile?.bu && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">BU</p>
              <p className="text-sm font-semibold text-gray-800">{profile.bu}</p>
            </div>
          )}
          {company && (
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1 flex items-center gap-1">
                <Building2 size={9}/> Company
              </p>
              <p className="text-sm font-semibold text-gray-800">{company.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* {t('account_changepw')} */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Lock size={14} className="text-gray-400"/>
          {t('account_changepw')}
        </h2>

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
            <CheckCircle2 size={14}/>
            {t('account_success')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nova password */}
          <div>
            <label className="label">{t('account_new_pw')}</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} required
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder={t('account_placeholder1')}
                className="input pr-10"
                style={{ fontSize: '16px' }}
              />
              <button type="button" tabIndex={-1}
                onClick={() => setShowPw(o => !o)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          {/* Confirmar */}
          <div>
            <label className="label">{t('account_confirm_pw')}</label>
            <input
              type={showPw ? 'text' : 'password'} required
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder={t('account_placeholder2')}
              className="input"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Requisitos */}
          {password.length > 0 && (
            <div className="grid grid-cols-2 gap-1">
              {[
                { key: 'length',  label: t('setpw_check_length') },
                { key: 'upper',   label: t('setpw_check_upper') },
                { key: 'number',  label: t('setpw_check_number') },
                { key: 'match',   label: t('setpw_check_match') },
              ].map(({ key, label }) => (
                <div key={key} className={`flex items-center gap-1.5 text-xs ${
                  checks[key] ? 'text-green-600' : 'text-gray-400'
                }`}>
                  <CheckCircle2 size={11} className={checks[key] ? 'text-green-500' : 'text-gray-300'}/>
                  {label}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={14} className="shrink-0 mt-0.5"/>
              {error}
            </div>
          )}

          <button type="submit" disabled={!isValid || loading}
            className="btn-primary w-full justify-center disabled:opacity-50">
            {loading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/><span>{t('account_updating')}</span></>
              : <><Lock size={14}/><span>{t('account_update')}</span></>
            }
          </button>
        </form>
      </div>

      {/* Admin shortcut */}
      {isAdmin && (
        <button onClick={() => navigate('/permissions')}
          className="w-full text-center text-sm text-navy hover:underline">
          {t('account_manage')}
        </button>
      )}
    </div>
  )
}
