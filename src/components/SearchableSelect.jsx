import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Search, X } from 'lucide-react'

/**
 * SearchableSelect — dropdown with inline search, for long lists.
 *
 * Props:
 *   value         : string (selected option's value, or '' for none)
 *   onChange      : (val: string) => void
 *   options       : [{ value, label, hint? }]
 *   placeholder   : search-box placeholder
 *   emptyLabel    : text shown when nothing is selected
 *   disabled      : boolean
 *   size          : 'sm' | 'md'   (default 'md')
 *   onCreateNew   : optional (query) => void — shows a "+ Create new" CTA
 *   createLabel   : label for the "create new" CTA (defaults to "Create new")
 *   searchable    : boolean (default true) — set false to turn into a normal select
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Search…',
  emptyLabel  = '— None —',
  disabled    = false,
  size        = 'md',
  onCreateNew,
  createLabel = 'Create new',
  searchable  = true,
}) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const containerRef      = useRef(null)
  const inputRef          = useRef(null)

  const selected = options.find(o => o.value === value)
  const filtered = searchable && query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(val) { onChange(val); setOpen(false); setQuery('') }

  const sizeCls = size === 'sm' ? 'py-1 text-xs' : 'text-sm'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen(o => !o)
          if (searchable) setTimeout(() => inputRef.current?.focus(), 50)
        }}
        className={`input w-full text-left flex items-center justify-between gap-2 min-h-[38px] ${sizeCls} ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}>
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : emptyLabel}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected && !disabled && (
            <span
              role="button"
              aria-label="Clear"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onChange('') }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange('') } }}
              className="text-gray-300 hover:text-gray-500 p-1.5 rounded hover:bg-gray-100 min-h-tap min-w-tap flex items-center justify-center">
              <X size={12}/>
            </span>
          )}
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-gray-100 relative">
              <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input
                ref={inputRef}
                type="text"
                className="input py-1.5 text-sm pl-7"
                placeholder={placeholder}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: '16px' }} /* prevent iOS zoom on focus */
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            <button type="button"
              onClick={() => select('')}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50">
              {emptyLabel}
            </button>
            {onCreateNew && (
              <button type="button"
                onClick={() => { onCreateNew(query); setOpen(false); setQuery('') }}
                className="w-full text-left px-3 py-2 text-sm border-b border-gray-100 bg-gray-50 hover:bg-gray-100 text-navy font-medium flex items-center gap-1">
                <Plus size={13}/> {createLabel}{query ? `: "${query}"` : ''}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            ) : filtered.map(o => (
              <button type="button" key={o.value}
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                  o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}>
                <div className="truncate">{o.label}</div>
                {o.hint && <div className="text-[10px] text-gray-400 truncate">{o.hint}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
