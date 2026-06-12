import { useState } from 'react'
import { Calendar, Table2 } from 'lucide-react'
import ForecastCalendar from '../components/forecast/ForecastCalendar'
import EST1Builder from '../components/forecast/EST1Builder'

const TABS = [
  { id: 'calendar', label: 'Forecast Calendar', icon: Calendar },
  { id: 'est1',     label: 'EST1 Builder',      icon: Table2 },
]

export default function Forecast() {
  const [tab, setTab] = useState('calendar')

  return (
    <div className="p-4 space-y-4 max-w-full mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Calendar size={20} className="text-navy"/> Forecast
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
              tab === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={13}/> {label}
          </button>
        ))}
      </div>

      {tab === 'calendar' ? <ForecastCalendar /> : <EST1Builder />}
    </div>
  )
}
