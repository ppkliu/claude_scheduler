import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import i18n from './locales'
import './style.css'

// Initialize theme before mounting to avoid flash
function initTheme() {
  const STORAGE_KEY = 'claude-scheduler-theme'
  const stored = localStorage.getItem(STORAGE_KEY) || 'system'
  const root = document.documentElement

  if (stored === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', stored === 'dark')
  }
}

initTheme()

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.mount('#app')
