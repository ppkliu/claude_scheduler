<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import type { ScheduleConfig } from '@/types'
import { formatTime } from '@/lib/utils'
import { Play, Trash2, Power, PowerOff, MoreVertical } from 'lucide-vue-next'

const props = defineProps<{
  schedule: ScheduleConfig
}>()

const { t } = useI18n()
const store = useSchedulerStore()
const showMenu = ref(false)
const executing = ref(false)

async function handleToggle() {
  await store.updateSchedule(props.schedule.id, {
    enabled: !props.schedule.enabled
  })
}

async function handleExecute() {
  executing.value = true
  await store.executeNow(props.schedule.id)
  setTimeout(() => {
    executing.value = false
  }, 2000)
}

async function handleDelete() {
  if (confirm(t('schedule.confirmDelete', { name: props.schedule.name }))) {
    await store.deleteSchedule(props.schedule.id)
  }
  showMenu.value = false
}
</script>

<template>
  <div 
    :class="[
      'bg-card border rounded-xl p-5 transition-all duration-300',
      schedule.enabled 
        ? 'border-primary/30 shadow-lg shadow-primary/5' 
        : 'border-border opacity-60'
    ]"
  >
    <!-- Header -->
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3">
        <div 
          :class="[
            'w-12 h-12 rounded-xl flex items-center justify-center font-mono text-lg font-bold',
            schedule.enabled 
              ? 'bg-primary/10 text-primary' 
              : 'bg-muted text-muted-foreground'
          ]"
        >
          {{ formatTime(schedule.hour, schedule.minute) }}
        </div>
        <div>
          <h3 class="font-semibold">{{ schedule.name }}</h3>
          <p class="text-xs text-muted-foreground font-mono">{{ schedule.cronExpression }}</p>
        </div>
      </div>

      <!-- Menu -->
      <div class="relative">
        <button 
          @click="showMenu = !showMenu"
          class="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <MoreVertical class="w-4 h-4 text-muted-foreground" />
        </button>
        
        <div 
          v-if="showMenu"
          class="absolute right-0 top-10 w-40 bg-card border border-border rounded-lg shadow-xl py-1 z-10"
          @mouseleave="showMenu = false"
        >
          <button
            @click="handleDelete"
            class="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
          >
            <Trash2 class="w-4 h-4" />
            {{ t('schedule.delete') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Prompt Preview -->
    <div class="mb-4 p-3 bg-muted/50 rounded-lg">
      <p class="text-xs text-muted-foreground mb-1">{{ t('schedule.prompt') }}</p>
      <p class="text-sm font-mono truncate">{{ schedule.prompt }}</p>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      <button
        @click="handleToggle"
        :class="[
          'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          schedule.enabled
            ? 'bg-muted hover:bg-muted/80 text-foreground'
            : 'bg-primary/10 hover:bg-primary/20 text-primary'
        ]"
      >
        <Power v-if="!schedule.enabled" class="w-4 h-4" />
        <PowerOff v-else class="w-4 h-4" />
        {{ schedule.enabled ? t('schedule.disable') : t('schedule.enable') }}
      </button>
      
      <button
        @click="handleExecute"
        :disabled="executing"
        :class="[
          'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
          executing
            ? 'bg-primary/50 text-primary-foreground cursor-wait'
            : 'bg-primary hover:bg-primary/90 text-primary-foreground'
        ]"
      >
        <Play :class="['w-4 h-4', executing && 'animate-pulse']" />
        {{ executing ? t('schedule.executing') : t('schedule.executeNow') }}
      </button>
    </div>

    <!-- Status Indicator -->
    <div 
      v-if="schedule.enabled"
      class="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-pulse-glow"
    />
  </div>
</template>
