<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import { formatDateTime, formatTokens } from '@/lib/utils'
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-vue-next'

const { t } = useI18n()
const store = useSchedulerStore()

function getStatusIcon(status: string) {
  switch (status) {
    case 'success': return CheckCircle2
    case 'failed': return XCircle
    case 'pending': return Loader2
    default: return Clock
  }
}

function getStatusClass(status: string) {
  switch (status) {
    case 'success': return 'text-emerald-500 bg-emerald-500/10'
    case 'failed': return 'text-destructive bg-destructive/10'
    case 'pending': return 'text-yellow-500 bg-yellow-500/10'
    default: return 'text-muted-foreground bg-muted'
  }
}
</script>

<template>
  <div class="bg-card border border-border rounded-xl overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-border">
      <h3 class="font-semibold">{{ t('logs.title') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('logs.recent', { count: store.logs.length }) }}</p>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border bg-muted/30">
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ t('logs.status') }}</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ t('logs.schedule') }}</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ t('logs.time') }}</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ t('logs.tokens') }}</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">{{ t('logs.duration') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr
            v-for="log in store.logs"
            :key="log.id"
            class="hover:bg-muted/20 transition-colors"
          >
            <!-- Status -->
            <td class="px-6 py-4">
              <span
                :class="[
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                  getStatusClass(log.status)
                ]"
              >
                <component
                  :is="getStatusIcon(log.status)"
                  :class="['w-3.5 h-3.5', log.status === 'pending' && 'animate-spin']"
                />
                {{ log.status === 'success' ? t('logs.statusSuccess') : log.status === 'failed' ? t('logs.statusFailed') : t('logs.statusPending') }}
              </span>
            </td>

            <!-- Schedule Name -->
            <td class="px-6 py-4">
              <p class="font-medium">{{ log.scheduleName }}</p>
            </td>

            <!-- Time -->
            <td class="px-6 py-4">
              <p class="text-sm font-mono text-muted-foreground">{{ formatDateTime(log.executedAt) }}</p>
            </td>

            <!-- Tokens -->
            <td class="px-6 py-4 text-right">
              <p class="text-sm font-mono">{{ formatTokens(log.totalTokens) }}</p>
              <p class="text-xs text-muted-foreground">
                {{ formatTokens(log.inputTokens) }} / {{ formatTokens(log.outputTokens) }}
              </p>
            </td>

            <!-- Duration -->
            <td class="px-6 py-4 text-right">
              <p class="text-sm font-mono text-muted-foreground">{{ log.durationMs }}ms</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty State -->
    <div
      v-if="store.logs.length === 0"
      class="px-6 py-16 text-center text-muted-foreground"
    >
      <Clock class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">{{ t('logs.noLogs') }}</p>
      <p class="text-sm">{{ t('logs.noLogsHint') }}</p>
    </div>
  </div>
</template>
