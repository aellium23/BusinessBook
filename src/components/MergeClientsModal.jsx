import { useState } from 'react'
import { Modal } from './ui'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { Check, ArrowRight, AlertTriangle } from 'lucide-react'

export default function MergeClientsModal({ clients, deals, onClose, onMerged }) {
  const { showToast } = useToast()
  const [primaryId, setPrimaryId] = useState(clients[0]?.id)
  const [merging, setMerging] = useState(false)

  if (clients.length !== 2) return null
  const primary = clients.find(c => c.id === primaryId)
  const secondary = clients.find(c => c.id !== primaryId)

  const secDeals = deals.filter(d =>
    d.account_id === secondary.id || (d.client && d.client.toLowerCase() === secondary.name?.toLowerCase())
  )

  async function handleMerge() {
    setMerging(true)
    try {
      await supabase.from('deals')
        .update({ client: primary.name, account_id: primary.id })
        .or(`account_id.eq.${secondary.id},client.ilike.${secondary.name}`)

      await supabase.from('contacts')
        .update({ account_id: primary.id })
        .eq('account_id', secondary.id)

      await supabase.from('slas')
        .update({ client: primary.name, account_id: primary.id })
        .or(`account_id.eq.${secondary.id},client.ilike.${secondary.name}`)

      const updates = {}
      if (!primary.country && secondary.country) updates.country = secondary.country
      if (!primary.region && secondary.region) updates.region = secondary.region
      if (!primary.notes && secondary.notes) updates.notes = secondary.notes
      if (Object.keys(updates).length > 0) {
        await supabase.from('accounts').update(updates).eq('id', primary.id)
      }

      await supabase.from('accounts').delete().eq('id', secondary.id)

      showToast(`Merged "${secondary.name}" into "${primary.name}"`, 'success')
      onMerged()
      onClose()
    } catch (e) {
      showToast(`Merge failed: ${e.message}`, 'error')
    }
    setMerging(false)
  }

  return (
    <Modal open onClose={onClose} title="Merge Clients"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleMerge} disabled={merging}
            className="btn-primary flex-1 gap-1">
            {merging ? 'Merging…' : `Merge into ${primary.name}`}
          </button>
        </div>
      }>
      <div className="space-y-4">
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-xs rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0"/>
          <span>This action cannot be undone. All data from the secondary will move to the primary.</span>
        </div>

        <p className="text-xs text-gray-500 font-medium uppercase">Select the primary (the one that stays):</p>

        <div className="space-y-2">
          {clients.map(c => {
            const isPrimary = c.id === primaryId
            const cDeals = deals.filter(d =>
              d.account_id === c.id || (d.client && d.client.toLowerCase() === c.name?.toLowerCase())
            )
            return (
              <button key={c.id} onClick={() => setPrimaryId(c.id)}
                className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                  isPrimary
                    ? 'border-navy bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isPrimary ? 'border-navy bg-navy text-white' : 'border-gray-300'
                  }`}>
                    {isPrimary && <Check size={12}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    <div className="flex items-center gap-2 text-micro text-gray-400">
                      {c.country && <span>{c.country}</span>}
                      {c.region && <span>{c.region}</span>}
                      <span>{cDeals.length} deals</span>
                    </div>
                  </div>
                  {isPrimary && (
                    <span className="text-micro font-bold text-navy bg-blue-100 px-2 py-0.5 rounded-full shrink-0">PRIMARY</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3 text-xs text-gray-600">
          <ArrowRight size={14} className="text-navy shrink-0"/>
          <span>
            <strong>{secDeals.length} deals</strong> and all contacts from
            <strong> "{secondary.name}"</strong> will be moved to
            <strong> "{primary.name}"</strong>.
            The account "{secondary.name}" will be deleted.
          </span>
        </div>
      </div>
    </Modal>
  )
}
