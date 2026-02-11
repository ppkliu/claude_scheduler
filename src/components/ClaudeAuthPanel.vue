<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Shield, ShieldCheck, ShieldAlert, Loader, ExternalLink, X, RefreshCw } from 'lucide-vue-next'

const { t } = useI18n()

const authStatus = ref<{
  cliAvailable: boolean
  authenticated: boolean
  accountInfo: { email?: string; expiresAt?: string }
} | null>(null)

const loginState = ref<{
  status: 'idle' | 'waiting_for_url' | 'waiting_for_auth' | 'success' | 'failed'
  authUrl: string | null
  error: string | null
}>({ status: 'idle', authUrl: null, error: null })

const loading = ref(false)
let pollInterval: ReturnType<typeof setInterval> | null = null

async function fetchAuthStatus() {
  loading.value = true
  try {
    const res = await fetch('/api/claude/auth-status')
    const data = await res.json()
    if (data.success) {
      authStatus.value = {
        cliAvailable: data.data.cliAvailable,
        authenticated: data.data.authenticated,
        accountInfo: data.data.accountInfo || {}
      }
    }
  } catch (e) {
    console.error('Failed to fetch auth status:', e)
  } finally {
    loading.value = false
  }
}

async function startLogin() {
  loginState.value = { status: 'waiting_for_url', authUrl: null, error: null }
  try {
    await fetch('/api/claude/login', { method: 'POST' })
    startPolling()
  } catch (e) {
    loginState.value.status = 'failed'
    loginState.value.error = 'Failed to start login process'
  }
}

function startPolling() {
  stopPolling()
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/claude/login-status')
      const data = await res.json()
      if (data.success) {
        loginState.value.status = data.data.status
        loginState.value.authUrl = data.data.authUrl
        loginState.value.error = data.data.error

        if (data.data.status === 'success' || data.data.status === 'failed') {
          stopPolling()
          if (data.data.status === 'success') {
            await fetchAuthStatus()
          }
        }
      }
    } catch (e) {
      console.error('Failed to poll login status:', e)
    }
  }, 2000)
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

async function cancelLogin() {
  stopPolling()
  try {
    await fetch('/api/claude/login-cancel', { method: 'POST' })
  } catch (e) {
    console.error('Failed to cancel login:', e)
  }
  loginState.value = { status: 'idle', authUrl: null, error: null }
}

function copyUrl() {
  if (loginState.value.authUrl) {
    navigator.clipboard.writeText(loginState.value.authUrl)
  }
}

onMounted(() => {
  fetchAuthStatus()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="border border-border rounded-lg bg-card p-6 space-y-4">
    <div class="space-y-2">
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <Shield class="w-5 h-5 text-primary" />
        {{ t('claudeAuth.title') }}
      </h3>
      <p class="text-sm text-muted-foreground">{{ t('claudeAuth.description') }}</p>
    </div>

    <!-- Loading -->
    <div v-if="loading && !authStatus" class="flex items-center gap-2 text-muted-foreground">
      <Loader class="w-4 h-4 animate-spin" />
      {{ t('common.loading') }}
    </div>

    <template v-else-if="authStatus">
      <!-- Auth Status Display -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <!-- Status indicator -->
          <div v-if="!authStatus.cliAvailable"
               class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium">
            <ShieldAlert class="w-4 h-4" />
            {{ t('claudeAuth.cliNotFound') }}
          </div>
          <div v-else-if="authStatus.authenticated"
               class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium">
            <ShieldCheck class="w-4 h-4" />
            {{ t('claudeAuth.authenticated') }}
          </div>
          <div v-else
               class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-sm font-medium">
            <ShieldAlert class="w-4 h-4" />
            {{ t('claudeAuth.notAuthenticated') }}
          </div>

          <!-- Account email -->
          <span v-if="authStatus.accountInfo?.email" class="text-sm text-muted-foreground">
            {{ authStatus.accountInfo.email }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="fetchAuthStatus"
            class="p-2 rounded-lg hover:bg-muted transition-colors"
            :title="t('claudeAuth.refresh')"
          >
            <RefreshCw class="w-4 h-4 text-muted-foreground" />
          </button>

          <!-- Login button (only if CLI available and not authenticated) -->
          <button
            v-if="authStatus.cliAvailable && !authStatus.authenticated && loginState.status === 'idle'"
            @click="startLogin"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            {{ t('claudeAuth.login') }}
          </button>
        </div>
      </div>

      <!-- Login In Progress -->
      <div v-if="loginState.status !== 'idle' && loginState.status !== 'success'" class="space-y-3 p-4 rounded-lg bg-muted/50 border border-border">
        <!-- Waiting for URL -->
        <div v-if="loginState.status === 'waiting_for_url'" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader class="w-4 h-4 animate-spin" />
          {{ t('claudeAuth.waitingForUrl') }}
        </div>

        <!-- Auth URL available -->
        <div v-if="loginState.authUrl" class="space-y-2">
          <p class="text-sm font-medium">{{ t('claudeAuth.openUrl') }}</p>
          <div class="flex items-center gap-2">
            <a :href="loginState.authUrl" target="_blank" rel="noopener noreferrer"
               class="flex-1 text-sm text-primary hover:underline break-all flex items-center gap-1">
              <ExternalLink class="w-3 h-3 flex-shrink-0" />
              {{ loginState.authUrl }}
            </a>
            <button
              @click="copyUrl"
              class="px-3 py-1 rounded border border-border bg-card text-xs hover:bg-accent transition-colors"
            >
              {{ t('claudeAuth.copyUrl') }}
            </button>
          </div>
        </div>

        <!-- Waiting for auth completion -->
        <div v-if="loginState.status === 'waiting_for_auth'" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader class="w-4 h-4 animate-spin" />
          {{ t('claudeAuth.waitingForAuth') }}
        </div>

        <!-- Failed -->
        <div v-if="loginState.status === 'failed'" class="text-sm text-destructive">
          {{ loginState.error || t('claudeAuth.failed') }}
        </div>

        <!-- Cancel button -->
        <button
          @click="cancelLogin"
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm hover:bg-accent transition-colors"
        >
          <X class="w-3 h-3" />
          {{ t('claudeAuth.cancel') }}
        </button>
      </div>

      <!-- Login Success -->
      <div v-if="loginState.status === 'success'" class="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-500 p-3 rounded-lg bg-green-500/10">
        <ShieldCheck class="w-4 h-4" />
        {{ t('claudeAuth.success') }}
      </div>
    </template>
  </div>
</template>
