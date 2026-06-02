import { Clock, Plus } from 'lucide-react'
import DealTimeline from '../DealTimeline'

export default function DealActivityNotes({
  dealId,
  actNote, setActNote,
  nextAction, setNextAction,
  nextActionDate, setNextActionDate,
  addingAct,
  onAddActivity,
  timelineNonce,
  t,
}) {
  return (
    <div className="space-y-2">
      <p className="label flex items-center gap-1.5"><Clock size={12}/> {t("df_activity")}</p>

      {/* Add note / next action — writes to deal_activities */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
        <textarea className="input text-xs resize-none" rows={2}
          placeholder={t("df_note_placeholder")}
          value={actNote} onChange={e => setActNote(e.target.value)}/>
        <div className="grid grid-cols-2 gap-2">
          <input className="input text-xs py-1" placeholder={t("df_next_action")}
            value={nextAction} onChange={e => setNextAction(e.target.value)}/>
          <input className="input text-xs py-1" type="date"
            value={nextActionDate} onChange={e => setNextActionDate(e.target.value)}/>
        </div>
        <button
          onClick={onAddActivity}
          disabled={!actNote || addingAct}
          className="btn-secondary text-xs w-full">
          <Plus size={11}/> {addingAct ? t("df_adding") : t("df_add_note")}
        </button>
      </div>

      {/* Unified timeline: notes + auto-tracked field changes + attachments */}
      <DealTimeline key={timelineNonce} dealId={dealId}/>
    </div>
  )
}
