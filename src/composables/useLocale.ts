import { useI18n } from 'vue-i18n'

export type Locale = 'en' | 'zh-TW' | 'zh-CN'

const STORAGE_KEY = 'llm-scheduler-locale'

export function useLocale() {
  const { locale } = useI18n()

  function initLocale() {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (stored && ['en', 'zh-TW', 'zh-CN'].includes(stored)) {
      locale.value = stored
    } else {
      locale.value = 'zh-TW'
    }
  }

  function setLocale(newLocale: Locale) {
    locale.value = newLocale
    localStorage.setItem(STORAGE_KEY, newLocale)
  }

  return {
    locale,
    setLocale,
    initLocale
  }
}
