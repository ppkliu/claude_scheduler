<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from './stores/scheduler'
import { useLocale } from './composables/useLocale'
import ScheduleCard from './components/ScheduleCard.vue'
import StatusPanel from './components/StatusPanel.vue'
import LogsPanel from './components/LogsPanel.vue'
import QuickSetup from './components/QuickSetup.vue'
import QuickChatPanel from './components/QuickChatPanel.vue'
import AddScheduleModal from './components/AddScheduleModal.vue'
import ConversationPanel from './components/ConversationPanel.vue'
import SettingsModal from './components/SettingsModal.vue'
import ToastContainer from './components/ToastContainer.vue'
import PlanPanel from './components/PlanPanel.vue'
import { Clock, Plus, Zap, MessageCircle, Calendar, Settings, FileText } from 'lucide-vue-next'

const { t } = useI18n()
const { initLocale } = useLocale()
const store = useSchedulerStore()
const showAddModal = ref(false)
const showSettingsModal = ref(false)
const mainTab = ref<'scheduler' | 'conversations' | 'plans'>('scheduler')
const schedulerSubTab = ref<'schedules' | 'logs'>('schedules')

onMounted(async () => {
  initLocale()

  await Promise.all([
    store.fetchSchedules(),
    store.fetchStatus(),
    store.fetchLogs(),
    store.fetchUsage()
  ])

  // 定期刷新狀態
  setInterval(() => {
    store.fetchStatus()
    store.fetchLogs(20)
  }, 30000)
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Toast Container -->
    <ToastContainer />

    <!-- Header (contextual) -->
    <header class="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
              <component :is="mainTab === 'scheduler' ? Calendar : mainTab === 'conversations' ? MessageCircle : FileText" class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 class="text-lg font-semibold tracking-tight">
                {{ mainTab === 'scheduler' ? t('app.title') : mainTab === 'conversations' ? t('app.conversationsTitle') : t('app.plansTitle') }}
              </h1>
              <p class="text-xs text-muted-foreground">
                {{ mainTab === 'scheduler' ? t('app.subtitle') : mainTab === 'conversations' ? t('app.conversationsSubtitle') : t('app.plansSubtitle') }}
              </p>
            </div>
          </div>

          <!-- Contextual action buttons -->
          <div class="flex items-center gap-3">
            <button
              @click="showSettingsModal = true"
              class="p-2 rounded-lg hover:bg-muted transition-colors"
              :title="t('settings.title')"
            >
              <Settings class="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              v-if="mainTab === 'scheduler'"
              @click="showAddModal = true"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              <Plus class="w-4 h-4" />
              {{ t('nav.addSchedule') }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Primary Tab Navigation -->
    <div class="border-b border-border bg-card/30 sticky top-16 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex gap-2 -mb-px">
          <button
            @click="mainTab = 'scheduler'"
            :class="[
              'inline-flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-all',
              mainTab === 'scheduler'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            ]"
          >
            <Calendar class="w-5 h-5" />
            {{ t('nav.scheduler') }}
          </button>
          <button
            @click="mainTab = 'conversations'"
            :class="[
              'inline-flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-all',
              mainTab === 'conversations'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            ]"
          >
            <MessageCircle class="w-5 h-5" />
            {{ t('nav.conversations') }}
          </button>
          <button
            @click="mainTab = 'plans'"
            :class="[
              'inline-flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-all',
              mainTab === 'plans'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            ]"
          >
            <FileText class="w-5 h-5" />
            {{ t('nav.plans') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- SCHEDULER TAB CONTENT -->
      <div v-if="mainTab === 'scheduler'" class="space-y-8 animate-fade-in">
        <!-- Status Overview -->
        <StatusPanel />

        <!-- Quick Chat -->
        <QuickChatPanel />

        <!-- Quick Setup -->
        <QuickSetup />

        <!-- Scheduler Sub-Tabs -->
        <div class="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
          <button
            @click="schedulerSubTab = 'schedules'"
            :class="[
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              schedulerSubTab === 'schedules'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            ]"
          >
            <Clock class="w-4 h-4 inline-block mr-2" />
            {{ t('logs.scheduleList') }}
          </button>
          <button
            @click="schedulerSubTab = 'logs'"
            :class="[
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              schedulerSubTab === 'logs'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            ]"
          >
            <Zap class="w-4 h-4 inline-block mr-2" />
            {{ t('logs.executionLogs') }}
          </button>
        </div>

        <!-- Schedules Grid -->
        <div v-if="schedulerSubTab === 'schedules'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
          <ScheduleCard
            v-for="schedule in store.schedules"
            :key="schedule.id"
            :schedule="schedule"
          />

          <div
            v-if="store.schedules.length === 0 && !store.loading"
            class="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground"
          >
            <Clock class="w-12 h-12 mb-4 opacity-50" />
            <p class="text-lg font-medium">{{ t('schedule.noSchedules') }}</p>
            <p class="text-sm">{{ t('schedule.noSchedulesHint') }}</p>
          </div>
        </div>

        <!-- Logs Panel -->
        <LogsPanel v-else-if="schedulerSubTab === 'logs'" class="animate-fade-in" />
      </div>

      <!-- CONVERSATIONS TAB CONTENT -->
      <div v-else-if="mainTab === 'conversations'" class="animate-fade-in">
        <ConversationPanel />
      </div>

      <!-- PLANS TAB CONTENT -->
      <div v-else-if="mainTab === 'plans'" class="animate-fade-in">
        <PlanPanel />
      </div>
    </main>

    <!-- Add Schedule Modal -->
    <AddScheduleModal
      v-if="showAddModal"
      @close="showAddModal = false"
    />

    <!-- Settings Modal -->
    <SettingsModal
      v-if="showSettingsModal"
      @close="showSettingsModal = false"
    />
  </div>
</template>
