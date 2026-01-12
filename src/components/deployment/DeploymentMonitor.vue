<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeploymentStore } from '@/stores/deployment'
import { Activity, Package, GitBranch, Wifi, WifiOff } from 'lucide-vue-next'

const { t } = useI18n()
const store = useDeploymentStore()

const activeTab = ref<'builds' | 'metrics' | 'dependencies' | 'git'>('builds')

const wsStatusText = computed(() => (store.wsConnected ? 'Connected' : 'Disconnected'))
const wsStatusColor = computed(() => (store.wsConnected ? 'text-green-500' : 'text-red-500'))

onMounted(async () => {
  await store.initializeMonitoring()
})

onUnmounted(() => {
  store.disconnectWebSocket()
})

async function triggerBuild() {
  await store.triggerBuild('Manual trigger from monitoring panel')
}
</script>

<template>
  <div class="deployment-monitor bg-white rounded-lg border border-border">
    <!-- Header -->
    <div class="border-b border-border p-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold tracking-tight">{{ t('nav.deployment') }}</h2>
          <p class="text-sm text-muted-foreground mt-1">
            {{ t('app.subtitle') }}
          </p>
        </div>
        <div class="flex items-center gap-4">
          <button
            @click="triggerBuild"
            :disabled="store.loading"
            class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <Activity class="w-4 h-4 inline mr-2" />
            Trigger Build
          </button>
          <div :class="['flex items-center gap-2', wsStatusColor]">
            <component :is="store.wsConnected ? Wifi : WifiOff" class="w-4 h-4" />
            <span class="text-sm font-medium">{{ wsStatusText }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-border flex">
      <button
        @click="activeTab = 'builds'"
        :class="[
          'flex-1 px-4 py-3 text-center font-medium border-b-2 transition-colors',
          activeTab === 'builds'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        ]"
      >
        <Activity class="w-4 h-4 inline mr-2" />
        Builds
      </button>
      <button
        @click="activeTab = 'metrics'"
        :class="[
          'flex-1 px-4 py-3 text-center font-medium border-b-2 transition-colors',
          activeTab === 'metrics'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        ]"
      >
        <Activity class="w-4 h-4 inline mr-2" />
        Metrics
      </button>
      <button
        @click="activeTab = 'dependencies'"
        :class="[
          'flex-1 px-4 py-3 text-center font-medium border-b-2 transition-colors',
          activeTab === 'dependencies'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        ]"
      >
        <Package class="w-4 h-4 inline mr-2" />
        Dependencies
      </button>
      <button
        @click="activeTab = 'git'"
        :class="[
          'flex-1 px-4 py-3 text-center font-medium border-b-2 transition-colors',
          activeTab === 'git'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        ]"
      >
        <GitBranch class="w-4 h-4 inline mr-2" />
        Git
      </button>
    </div>

    <!-- Content -->
    <div class="p-6">
      <!-- Builds Tab -->
      <div v-if="activeTab === 'builds'" class="space-y-4">
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Total Builds</div>
            <div class="text-2xl font-bold">{{ store.buildStats.total }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Successful</div>
            <div class="text-2xl font-bold text-green-600">{{ store.buildStats.successful }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Failed</div>
            <div class="text-2xl font-bold text-red-600">{{ store.buildStats.failed }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Success Rate</div>
            <div class="text-2xl font-bold">{{ store.buildStats.successRate }}%</div>
          </div>
        </div>

        <!-- Live Logs -->
        <div class="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-sm overflow-auto max-h-[400px]">
          <pre v-if="store.liveOutput">{{ store.liveOutput }}</pre>
          <div v-else class="text-slate-500">{{ t('deployment.noLogs') || 'No logs yet' }}</div>
        </div>

        <!-- Build History -->
        <div class="space-y-2">
          <h3 class="font-semibold">Recent Builds</h3>
          <div v-for="build in store.builds.slice(0, 5)" :key="build.id" class="border rounded-lg p-3 text-sm">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">#{{ build.id }} - {{ build.triggerType }}</div>
                <div class="text-xs text-muted-foreground">{{ build.triggerSource }}</div>
              </div>
              <div :class="['px-2 py-1 rounded text-xs font-medium', build.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800']">
                {{ build.status }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Metrics Tab -->
      <div v-if="activeTab === 'metrics'" class="space-y-4">
        <div v-if="store.currentMetrics" class="grid grid-cols-3 gap-4">
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">CPU Usage</div>
            <div class="text-3xl font-bold">{{ store.currentMetrics.cpuUsagePercent.toFixed(1) }}%</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Memory</div>
            <div class="text-3xl font-bold">
              {{ store.currentMetrics.memoryUsedMb }} / {{ store.currentMetrics.memoryTotalMb }} MB
            </div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Disk</div>
            <div class="text-3xl font-bold">
              {{ store.currentMetrics.diskUsedGb }} / {{ store.currentMetrics.diskTotalGb }} GB
            </div>
          </div>
        </div>
      </div>

      <!-- Dependencies Tab -->
      <div v-if="activeTab === 'dependencies'" class="space-y-4">
        <div class="grid grid-cols-5 gap-4 mb-6">
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Total</div>
            <div class="text-2xl font-bold">{{ store.dependenciesSummary.total }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Major</div>
            <div class="text-2xl font-bold text-red-600">{{ store.dependenciesSummary.major }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Minor</div>
            <div class="text-2xl font-bold text-yellow-600">{{ store.dependenciesSummary.minor }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Patch</div>
            <div class="text-2xl font-bold text-blue-600">{{ store.dependenciesSummary.patch }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground">Security</div>
            <div class="text-2xl font-bold text-orange-600">{{ store.dependenciesSummary.security }}</div>
          </div>
        </div>
      </div>

      <!-- Git Tab -->
      <div v-if="activeTab === 'git'" class="space-y-4">
        <div v-if="store.gitStatus" class="space-y-4">
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground mb-2">Current Branch</div>
            <div class="font-mono font-semibold">{{ store.gitStatus.branch }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground mb-2">Latest Commit</div>
            <div class="font-mono text-sm break-all">{{ store.gitStatus.latestCommitHash }}</div>
            <div class="text-sm mt-2">{{ store.gitStatus.latestCommitMessage }}</div>
          </div>
          <div class="bg-muted rounded-lg p-4">
            <div class="text-sm text-muted-foreground mb-2">Remote Status</div>
            <div class="font-semibold capitalize">{{ store.gitStatus.remoteStatus }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toasts -->
    <div class="fixed bottom-4 right-4 space-y-2 pointer-events-none">
      <div
        v-for="toast in store.toasts"
        :key="toast.id"
        :class="[
          'p-4 rounded-lg shadow-lg text-white pointer-events-auto max-w-sm',
          {
            'bg-green-500': toast.type === 'success',
            'bg-red-500': toast.type === 'error',
            'bg-yellow-500': toast.type === 'warning',
            'bg-blue-500': toast.type === 'info'
          }
        ]"
      >
        <div class="font-semibold">{{ toast.title }}</div>
        <div class="text-sm opacity-90">{{ toast.message }}</div>
      </div>
    </div>
  </div>
</template>
