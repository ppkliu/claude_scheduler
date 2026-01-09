<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import { X } from 'lucide-vue-next'

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const store = useSchedulerStore()

const name = ref('')
const hour = ref(9)
const minute = ref(0)
const prompt = ref('hi')
const saving = ref(false)

async function handleSubmit() {
  if (!name.value.trim()) return

  saving.value = true
  const result = await store.createSchedule({
    name: name.value,
    hour: hour.value,
    minute: minute.value,
    prompt: prompt.value || 'hi',
    enabled: true
  })

  if (result.success) {
    emit('close')
  }
  saving.value = false
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      @click="emit('close')"
    />

    <!-- Modal -->
    <div class="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-fade-in">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 class="text-lg font-semibold">{{ t('addSchedule.title') }}</h2>
        <button
          @click="emit('close')"
          class="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="p-6 space-y-5">
        <!-- Name -->
        <div>
          <label class="block text-sm font-medium mb-2">{{ t('addSchedule.name') }}</label>
          <input
            v-model="name"
            type="text"
            :placeholder="t('addSchedule.namePlaceholder')"
            class="w-full px-4 py-2.5 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <!-- Time -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{ t('addSchedule.hour') }}</label>
            <select
              v-model.number="hour"
              class="w-full px-4 py-2.5 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            >
              <option v-for="h in 24" :key="h - 1" :value="h - 1">
                {{ (h - 1).toString().padStart(2, '0') }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">{{ t('addSchedule.minute') }}</label>
            <select
              v-model.number="minute"
              class="w-full px-4 py-2.5 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            >
              <option v-for="m in [0, 15, 30, 45]" :key="m" :value="m">
                {{ m.toString().padStart(2, '0') }}
              </option>
            </select>
          </div>
        </div>

        <!-- Prompt -->
        <div>
          <label class="block text-sm font-medium mb-2">
            {{ t('addSchedule.promptLabel') }}
          </label>
          <input
            v-model="prompt"
            type="text"
            placeholder="hi"
            class="w-full px-4 py-2.5 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
          />
          <p class="mt-1.5 text-xs text-muted-foreground">
            {{ t('addSchedule.promptHint') }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <button
            type="button"
            @click="emit('close')"
            class="flex-1 px-4 py-2.5 rounded-lg bg-muted hover:bg-muted/80 font-medium transition-colors"
          >
            {{ t('addSchedule.cancel') }}
          </button>
          <button
            type="submit"
            :disabled="saving || !name.trim()"
            :class="[
              'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
              saving || !name.trim()
                ? 'bg-primary/50 text-primary-foreground cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            ]"
          >
            {{ saving ? t('addSchedule.creating') : t('addSchedule.create') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
