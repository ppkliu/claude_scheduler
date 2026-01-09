<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import { formatRelativeTime, formatTokens } from '@/lib/utils'
import { Activity, Coins, Clock } from 'lucide-vue-next'

const { t } = useI18n()
const store = useSchedulerStore()

const nextExecutionTime = computed(() => {
  if (!store.status?.nextExecution?.time) return null
  return formatRelativeTime(store.status.nextExecution.time)
})
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <!-- Active Schedules -->
    <div class="bg-card border border-border rounded-xl p-5">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Activity class="w-5 h-5 text-primary" />
        </div>
        <div>
          <p class="text-2xl font-bold font-mono">{{ store.status?.activeSchedules ?? 0 }}</p>
          <p class="text-sm text-muted-foreground">{{ t('status.activeSchedules') }}</p>
        </div>
      </div>
    </div>

    <!-- Next Execution -->
    <div class="bg-card border border-border rounded-xl p-5">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
          <Clock class="w-5 h-5 text-yellow-500" />
        </div>
        <div>
          <p class="text-lg font-semibold">
            {{ nextExecutionTime || '—' }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ store.status?.nextExecution?.scheduleName || t('status.nextExecution') }}
          </p>
        </div>
      </div>
    </div>

    <!-- Today Tokens -->
    <div class="bg-card border border-border rounded-xl p-5">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Coins class="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <p class="text-2xl font-bold font-mono">{{ formatTokens(store.todayTokens) }}</p>
          <p class="text-sm text-muted-foreground">{{ t('status.todayTokens') }}</p>
        </div>
      </div>
    </div>

  </div>
</template>
