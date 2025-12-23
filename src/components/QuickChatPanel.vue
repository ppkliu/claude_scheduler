<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import { Send, Loader, AlertCircle, Check } from 'lucide-vue-next'

const { t } = useI18n()
const store = useSchedulerStore()

const prompt = ref('hi')
const executing = ref(false)
const response = ref<{
  response: string
  tokens: number
  cost: number
  duration: number
} | null>(null)
const error = ref<string | null>(null)

async function executeChat() {
  if (!prompt.value.trim()) return

  executing.value = true
  error.value = null
  response.value = null

  const result = await store.quickChat(prompt.value)

  executing.value = false

  if (result.success) {
    response.value = result.data
  } else {
    error.value = result.error || 'Failed to execute chat'
  }
}

function clearPrompt() {
  prompt.value = 'hi'
  response.value = null
  error.value = null
}
</script>

<template>
  <div class="border border-border rounded-lg bg-card p-6 space-y-4">
    <div class="space-y-2">
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <Send class="w-5 h-5 text-primary" />
        {{ t('quickChat.title') }}
      </h3>
      <p class="text-sm text-muted-foreground">{{ t('quickChat.description') }}</p>
    </div>

    <!-- Input Area -->
    <div class="space-y-3">
      <div class="flex gap-2">
        <textarea
          v-model="prompt"
          :disabled="executing"
          :placeholder="t('quickChat.placeholder')"
          class="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          rows="3"
        />
      </div>

      <div class="flex gap-2">
        <button
          @click="executeChat"
          :disabled="executing || !prompt.trim()"
          class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Loader v-if="executing" class="w-4 h-4 animate-spin" />
          <Send v-else class="w-4 h-4" />
          {{ executing ? t('quickChat.executing') : t('quickChat.execute') }}
        </button>

        <button
          @click="clearPrompt"
          :disabled="executing"
          class="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {{ t('quickChat.clear') }}
        </button>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex gap-3">
      <AlertCircle class="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
      <div class="text-sm text-destructive">{{ error }}</div>
    </div>

    <!-- Response State -->
    <div v-if="response" class="space-y-3">
      <!-- Success Header -->
      <div class="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-500">
        <Check class="w-4 h-4" />
        {{ t('quickChat.success') }}
      </div>

      <!-- Response Output -->
      <div class="bg-muted/50 rounded-lg p-4 border border-border">
        <p class="text-sm text-muted-foreground mb-2 font-medium">{{ t('quickChat.response') }}</p>
        <div class="bg-background rounded p-3 text-sm text-foreground max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
          {{ response.response }}
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-muted/30 rounded-lg p-3 border border-border/50">
          <p class="text-xs text-muted-foreground font-medium mb-1">{{ t('quickChat.tokens') }}</p>
          <p class="text-lg font-semibold text-foreground">{{ response.tokens }}</p>
        </div>

        <div class="bg-muted/30 rounded-lg p-3 border border-border/50">
          <p class="text-xs text-muted-foreground font-medium mb-1">{{ t('quickChat.cost') }}</p>
          <p class="text-lg font-semibold text-foreground">${{ response.cost.toFixed(6) }}</p>
        </div>

        <div class="bg-muted/30 rounded-lg p-3 border border-border/50">
          <p class="text-xs text-muted-foreground font-medium mb-1">{{ t('quickChat.duration') }}</p>
          <p class="text-lg font-semibold text-foreground">{{ response.duration }}ms</p>
        </div>
      </div>
    </div>
  </div>
</template>
