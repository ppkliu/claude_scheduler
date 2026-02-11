<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal, Play, Loader, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-vue-next'

const { t } = useI18n()

interface ScriptFile {
  name: string
  size: number
  mtime: string
}

interface ExecutionResult {
  executionId: string
  scriptName: string
  status: 'running' | 'completed' | 'failed' | 'timeout'
  output: string
  error: string
  startedAt: string
  exitCode: number | null
}

const scripts = ref<ScriptFile[]>([])
const scriptsAvailable = ref(false)
const scriptsDir = ref('')
const scriptsLoading = ref(false)
const executions = ref<Map<string, ExecutionResult>>(new Map())
const pollIntervals = ref<Map<string, ReturnType<typeof setInterval>>>(new Map())

async function fetchScripts() {
  scriptsLoading.value = true
  try {
    const res = await fetch('/api/scripts')
    const data = await res.json()
    if (data.success) {
      scripts.value = data.data.scripts
      scriptsAvailable.value = data.data.available
      scriptsDir.value = data.data.scriptsDir
    }
  } catch (e) {
    console.error('Failed to fetch scripts:', e)
  } finally {
    scriptsLoading.value = false
  }
}

async function executeScript(scriptName: string) {
  try {
    const res = await fetch('/api/scripts/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptName })
    })
    const data = await res.json()
    if (data.success) {
      const executionId = data.data.executionId
      executions.value.set(scriptName, {
        executionId,
        scriptName,
        status: 'running',
        output: '',
        error: '',
        startedAt: new Date().toISOString(),
        exitCode: null
      })
      startPolling(executionId, scriptName)
    }
  } catch (e) {
    console.error('Failed to execute script:', e)
  }
}

function startPolling(executionId: string, scriptName: string) {
  stopPolling(scriptName)
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/scripts/execution/${executionId}`)
      const data = await res.json()
      if (data.success) {
        executions.value.set(scriptName, data.data)
        if (data.data.status !== 'running') {
          stopPolling(scriptName)
        }
      }
    } catch (e) {
      console.error('Failed to poll execution:', e)
    }
  }, 2000)
  pollIntervals.value.set(scriptName, interval)
}

function stopPolling(scriptName: string) {
  const interval = pollIntervals.value.get(scriptName)
  if (interval) {
    clearInterval(interval)
    pollIntervals.value.delete(scriptName)
  }
}

function isExecuting(scriptName: string): boolean {
  const exec = executions.value.get(scriptName)
  return exec?.status === 'running'
}

function getExecution(scriptName: string): ExecutionResult | undefined {
  return executions.value.get(scriptName)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

onMounted(() => {
  fetchScripts()
})

onUnmounted(() => {
  for (const scriptName of pollIntervals.value.keys()) {
    stopPolling(scriptName)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-card border border-border rounded-xl p-6">
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <Terminal class="w-5 h-5 text-primary" />
            {{ t('scripts.title') }}
          </h3>
          <p class="text-sm text-muted-foreground">{{ t('scripts.description') }}</p>
        </div>
        <button
          @click="fetchScripts"
          :disabled="scriptsLoading"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm hover:bg-accent disabled:opacity-50 transition-colors"
        >
          <RefreshCw :class="['w-4 h-4', scriptsLoading && 'animate-spin']" />
          {{ t('scripts.refresh') }}
        </button>
      </div>
    </div>

    <!-- Not Available Warning -->
    <div v-if="!scriptsAvailable && !scriptsLoading"
         class="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-3">
      <AlertTriangle class="w-5 h-5 flex-shrink-0" />
      {{ t('scripts.notAvailable') }}
    </div>

    <!-- Loading -->
    <div v-else-if="scriptsLoading" class="flex items-center justify-center py-12 text-muted-foreground">
      <Loader class="w-6 h-6 animate-spin mr-2" />
      {{ t('common.loading') }}
    </div>

    <!-- Empty State -->
    <div v-else-if="scripts.length === 0"
         class="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Terminal class="w-12 h-12 mb-4 opacity-50" />
      <p class="text-lg font-medium">{{ t('scripts.noScripts') }}</p>
      <p class="text-sm mt-1">{{ scriptsDir }}</p>
    </div>

    <!-- Script List -->
    <div v-else class="space-y-4">
      <div v-for="script in scripts" :key="script.name"
           class="bg-card border border-border rounded-xl overflow-hidden">
        <!-- Script Header -->
        <div class="p-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <Terminal class="w-4 h-4 text-muted-foreground" />
            <div>
              <p class="font-mono text-sm font-medium">{{ script.name }}</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ formatSize(script.size) }} · {{ formatDate(script.mtime) }}
              </p>
            </div>
          </div>
          <button
            @click="executeScript(script.name)"
            :disabled="isExecuting(script.name)"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Loader v-if="isExecuting(script.name)" class="w-4 h-4 animate-spin" />
            <Play v-else class="w-4 h-4" />
            {{ isExecuting(script.name) ? t('scripts.running') : t('scripts.execute') }}
          </button>
        </div>

        <!-- Execution Output -->
        <div v-if="getExecution(script.name)"
             class="border-t border-border p-4 bg-muted/20">
          <!-- Status Badge -->
          <div class="flex items-center gap-2 mb-3">
            <div v-if="getExecution(script.name)!.status === 'running'"
                 class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium">
              <Loader class="w-3 h-3 animate-spin" />
              {{ t('scripts.running') }}
            </div>
            <div v-else-if="getExecution(script.name)!.status === 'completed'"
                 class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium">
              <CheckCircle class="w-3 h-3" />
              {{ t('scripts.completed') }}
            </div>
            <div v-else-if="getExecution(script.name)!.status === 'failed'"
                 class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
              <XCircle class="w-3 h-3" />
              {{ t('scripts.failed') }}
            </div>
            <div v-else-if="getExecution(script.name)!.status === 'timeout'"
                 class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs font-medium">
              <Clock class="w-3 h-3" />
              {{ t('scripts.timeout') }}
            </div>

            <span v-if="getExecution(script.name)!.exitCode !== null" class="text-xs text-muted-foreground">
              {{ t('scripts.exitCode') }}: {{ getExecution(script.name)!.exitCode }}
            </span>
          </div>

          <!-- Output -->
          <div v-if="getExecution(script.name)!.output" class="mb-2">
            <p class="text-xs text-muted-foreground font-medium mb-1">{{ t('scripts.output') }}</p>
            <pre class="bg-background rounded-lg p-3 text-sm overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words border border-border">{{ getExecution(script.name)!.output }}</pre>
          </div>

          <!-- Errors -->
          <div v-if="getExecution(script.name)!.error">
            <p class="text-xs text-muted-foreground font-medium mb-1">{{ t('scripts.errors') }}</p>
            <pre class="bg-destructive/5 rounded-lg p-3 text-sm text-destructive overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words border border-destructive/20">{{ getExecution(script.name)!.error }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
