import { Link } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'

export default function IntercompanySection({ form, set, hasIC }) {
  const { t } = useTranslation()

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link size={14} className="text-amber-600" />
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
          Intercompany · VGT cost
        </p>
      </div>
      <p className="text-xs text-amber-600">
        If ECT purchases from VGT to deliver this deal, enter the VGT amount below.
        A linked VGT Internal deal will be created automatically.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("df_vgt_cost")}</label>
          <input className="input bg-white" type="number"
            value={form.intercompany_value}
            onChange={e => set('intercompany_value', e.target.value)}
            placeholder="0 — leave empty if none" />
        </div>
        {hasIC && form.value_total && (
          <div className="flex items-end pb-2">
            <div>
              <p className="text-xs text-amber-600">ECT margin after VGT cost</p>
              <p className="text-lg font-bold text-amber-800">
                €{((parseFloat(form.value_total) - parseFloat(form.intercompany_value)) / 1000).toFixed(1)}K
              </p>
              <p className="text-xs text-amber-500">
                {form.value_total > 0
                  ? Math.round((1 - parseFloat(form.intercompany_value) / parseFloat(form.value_total)) * 100)
                  : 0}% of deal value
              </p>
            </div>
          </div>
        )}
      </div>

      {/* VGT mirror preview */}
      {hasIC && (
        <div className="bg-vgt/5 border border-vgt/20 rounded-lg p-3">
          <p className="text-xs font-semibold text-vgt mb-1">
            VGT deal that will be created automatically
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <span>Client: <strong>{form.client || '—'}</strong></span>
            <span>Value: <strong>€{(parseFloat(form.intercompany_value)/1000).toFixed(1)}K</strong></span>
            <span>BU: <strong>VGT</strong></span>
            <span>Type: <strong>Internal</strong></span>
            <span>Stage: <strong>{form.stage}</strong></span>
            <span>Description: <strong>[Intercompany]</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}
