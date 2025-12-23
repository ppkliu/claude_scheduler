<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')" />

    <div class="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-fade-in">
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 class="text-lg font-semibold">{{ t('settings.title') }}</h2>
        <button @click="emit('close')" class="p-2 rounded-lg hover:bg-muted transition-colors">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="p-6 space-y-6">
        <!-- Theme Settings -->
        <div>
          <label class="block text-sm font-medium mb-3">{{ t('settings.theme') }}</label>
          <div class="grid grid-cols-3 gap-3">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              @click="handleThemeChange(option.value)"
              :class="[
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                currentTheme === option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              ]"
            >
              <component :is="option.icon" class="w-5 h-5" />
              <span class="text-sm font-medium">{{ t(option.label) }}</span>
            </button>
          </div>
        </div>

        <!-- Language Settings -->
        <div>
          <label class="block text-sm font-medium mb-3">{{ t('settings.language') }}</label>
          <div class="space-y-2">
            <button
              v-for="lang in languageOptions"
              :key="lang.value"
              @click="handleLanguageChange(lang.value)"
              :class="[
                'w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all',
                locale === lang.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              ]"
            >
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ lang.flag }}</span>
                <span class="font-medium">{{ t(lang.label) }}</span>
              </div>
              <Check v-if="locale === lang.value" class="w-5 h-5 text-primary" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useTheme, type Theme } from '@/composables/useTheme'
import { useLocale, type Locale } from '@/composables/useLocale'
import { X, Sun, Moon, Monitor, Check } from 'lucide-vue-next'

const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const { currentTheme, setTheme } = useTheme()
const { setLocale } = useLocale()

const themeOptions = [
  { value: 'light' as Theme, label: 'settings.themeLight', icon: Sun },
  { value: 'dark' as Theme, label: 'settings.themeDark', icon: Moon },
  { value: 'system' as Theme, label: 'settings.themeSystem', icon: Monitor }
]

const languageOptions = [
  { value: 'en' as Locale, label: 'settings.languageEn', flag: '🇺🇸' },
  { value: 'zh-TW' as Locale, label: 'settings.languageZhTW', flag: '🇹🇼' },
  { value: 'zh-CN' as Locale, label: 'settings.languageZhCN', flag: '🇨🇳' }
]

function handleThemeChange(theme: Theme) {
  setTheme(theme)
}

function handleLanguageChange(lang: Locale) {
  setLocale(lang)
}
</script>
