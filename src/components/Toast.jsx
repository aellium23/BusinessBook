import { createContext, useContext, useState, useCallback } from 'react'

const Ctx = createContext()
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 5000)
  }, [])
  return (
    <Ctx.Provider value={{ showToast }}>
      {children}
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}
    </Ctx.Provider>
  )
}

function ToastBanner({ toast, onClose }) {
  const bg = toast.type === 'error' ? 'bg-red-600' : toast.type === 'success' ? 'bg-green-600' : 'bg-blue-600'
  return (
    <div className={`fixed top-4 right-4 z-[9999] ${bg} text-white px-4 py-3 rounded-lg shadow-lg max-w-md flex items-center gap-2`}>
      <span className="flex-1 text-sm">{toast.message}</span>
      <button onClick={onClose} className="text-white/80 hover:text-white font-bold">×</button>
    </div>
  )
}
