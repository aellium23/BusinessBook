import { useState, useEffect } from 'react'
import { t, getLang, onLangChange } from '../lib/i18n'

export function useTranslation() {
  const [lang, setLang] = useState(getLang)

  useEffect(() => {
    return onLangChange(code => setLang(code))
  }, [])

  return { t, lang }
}
