import { ref, onMounted } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'claude-scheduler-theme'
const currentTheme = ref<Theme>('system')
const isDark = ref(false)

export function useTheme() {
  function initTheme() {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    currentTheme.value = stored || 'system'
    applyTheme()
  }

  function applyTheme() {
    const root = document.documentElement

    if (currentTheme.value === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      isDark.value = prefersDark
      root.classList.toggle('dark', prefersDark)
    } else {
      isDark.value = currentTheme.value === 'dark'
      root.classList.toggle('dark', currentTheme.value === 'dark')
    }
  }

  function setTheme(theme: Theme) {
    currentTheme.value = theme
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme()
  }

  onMounted(() => {
    initTheme()

    // 監聽系統主題變化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (currentTheme.value === 'system') {
        applyTheme()
      }
    }
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  })

  return {
    currentTheme,
    isDark,
    setTheme,
    initTheme
  }
}
