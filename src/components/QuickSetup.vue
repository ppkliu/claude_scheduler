<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import { useToast } from '@/composables/useToast'
import { Zap, Clock } from 'lucide-vue-next'

const { t } = useI18n()
const store = useSchedulerStore()
const { success, error: showError } = useToast()
const startHour = ref(3)
const setting = ref(false)

const previewHours = computed(() => {
  const hours: number[] = []
  for (let i = 0; i < 5; i++) {
    hours.push((startHour.value + i * 5) % 24)
  }
  return hours.sort((a, b) => a - b)
})

async function handleSetup() {
  setting.value = true
  try {
    const result = await store.setup5HourPreset(startHour.value)

    if (result.success) {
      success(t('quickSetup.success'))
      // Wait for schedules to be fetched
      await new Promise(resolve => setTimeout(resolve, 500))
    } else {
      showError(result.error || t('quickSetup.error'))
    }
  } catch (e) {
    showError(t('quickSetup.error'))
  } finally {
    setting.value = false
  }
}
</script>

<template>
  <div class="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6">
    <div class="flex flex-col lg:flex-row lg:items-center gap-6">
      <!-- Info -->
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <Zap class="w-5 h-5 text-primary" />
          <h2 class="text-lg font-semibold">{{ t('quickSetup.title') }}</h2>
        </div>
        <p class="text-sm text-muted-foreground mb-4">
          {{ t('quickSetup.description') }}
        </p>

        <!-- Preview -->
        <div class="flex flex-wrap gap-2">
          <span
            v-for="hour in previewHours"
            :key="hour"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card rounded-lg text-sm font-mono border border-border"
          >
            <Clock class="w-3.5 h-3.5 text-primary" />
            {{ hour.toString().padStart(2, '0') }}:00
          </span>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-end gap-4">
        <div>
          <label class="block text-sm font-medium mb-2">{{ t('quickSetup.startTime') }}</label>
          <select
            v-model.number="startHour"
            class="w-32 px-3 py-2 bg-card border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option v-for="h in 24" :key="h - 1" :value="h - 1">
              {{ (h - 1).toString().padStart(2, '0') }}:00
            </option>
          </select>
        </div>

        <button
          @click="handleSetup"
          :disabled="setting"
          :class="[
            'px-6 py-2 rounded-lg font-medium transition-all',
            setting
              ? 'bg-primary/50 text-primary-foreground cursor-wait'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          ]"
        >
          {{ setting ? t('quickSetup.applying') : t('quickSetup.apply') }}
        </button>
      </div>
    </div>
  </div>
</template>
