/**
 * Deployment System Pinia Store
 * Manages all deployment-related state and API interactions
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  BuildRecord,
  DependencyStatus,
  SystemMetrics,
  GitStatus,
  DeploymentConfig,
  DependenciesSummary,
  ToastNotification
} from '@/types/deployment'

const API_BASE = '/api'

export const useDeploymentStore = defineStore('deployment', () => {
  // State
  const builds = ref<BuildRecord[]>([])
  const currentBuild = ref<BuildRecord | null>(null)
  const liveOutput = ref('')
  const dependencies = ref<DependencyStatus[]>([])
  const currentMetrics = ref<SystemMetrics | null>(null)
  const metricsHistory = ref<SystemMetrics[]>([])
  const gitStatus = ref<GitStatus | null>(null)
  const gitHistory = ref<GitStatus[]>([])
  const config = ref<DeploymentConfig | null>(null)
  const wsConnected = ref(false)
  const wsConnectionRetries = ref(0)
  const deploymentEnabled = ref(true)
  const loading = ref(false)
  const toasts = ref<ToastNotification[]>([])

  let wsConnection: WebSocket | null = null
  let metricsInterval: NodeJS.Timeout | null = null
  let wsReconnectTimeout: NodeJS.Timeout | null = null

  // Computed
  const dependenciesSummary = computed((): DependenciesSummary => {
    return dependencies.value.reduce(
      (acc, dep) => {
        acc.total++
        if (dep.updateType === 'major') acc.major++
        else if (dep.updateType === 'minor') acc.minor++
        else if (dep.updateType === 'patch') acc.patch++

        if (dep.hasSecurityIssues) acc.security++
        return acc
      },
      { total: 0, major: 0, minor: 0, patch: 0, security: 0 }
    )
  })

  const buildStats = computed(() => {
    const total = builds.value.length
    const successful = builds.value.filter(b => b.status === 'success').length
    const failed = builds.value.filter(b => b.status === 'failed').length
    const avgDuration =
      builds.value.reduce((sum, b) => sum + (b.durationMs || 0), 0) / Math.max(total, 1)

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : '0',
      avgDuration: Math.round(avgDuration)
    }
  })

  // Actions - Builds
  async function fetchBuilds(limit: number = 20, offset: number = 0) {
    try {
      const res = await fetch(`${API_BASE}/deployment/builds?limit=${limit}&offset=${offset}`)
      const data = await res.json()
      if (data.success) {
        builds.value = data.data.builds.map(transformBuildRecord)
      }
      return data
    } catch (error) {
      console.error('[DeploymentStore] Fetch builds error:', error)
      return { success: false, error: String(error) }
    }
  }

  async function fetchBuild(id: number) {
    try {
      const res = await fetch(`${API_BASE}/deployment/builds/${id}`)
      const data = await res.json()
      if (data.success) {
        currentBuild.value = transformBuildRecord(data.data)
      }
      return data
    } catch (error) {
      console.error('[DeploymentStore] Fetch build error:', error)
      return { success: false }
    }
  }

  async function triggerBuild(reason?: string) {
    try {
      loading.value = true
      const res = await fetch(`${API_BASE}/deployment/builds/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Manual trigger' })
      })
      const data = await res.json()
      if (data.success) {
        addToast('success', 'Build Triggered', 'Build started successfully')
        await fetchBuilds(20)
      }
      return data
    } catch (error) {
      addToast('error', 'Build Failed', String(error))
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  // Actions - Dependencies
  async function fetchDependencies() {
    try {
      const res = await fetch(`${API_BASE}/dependencies/status`)
      const data = await res.json()
      if (data.success) {
        dependencies.value = data.data.dependencies.map(transformDependency)
      }
      return data
    } catch (error) {
      console.error('[DeploymentStore] Fetch dependencies error:', error)
      return { success: false }
    }
  }

  async function checkDependencies() {
    try {
      loading.value = true
      const res = await fetch(`${API_BASE}/dependencies/status`)
      const data = await res.json()
      if (data.success) {
        dependencies.value = data.data.dependencies.map(transformDependency)
        addToast(
          'success',
          'Check Complete',
          `Found ${dependenciesSummary.value.major} major, ${dependenciesSummary.value.minor} minor updates`
        )
      }
      return data
    } catch (error) {
      addToast('error', 'Check Failed', String(error))
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  // Actions - Metrics
  async function fetchCurrentMetrics() {
    try {
      const res = await fetch(`${API_BASE}/monitor/metrics/current`)
      const data = await res.json()
      if (data.success) {
        currentMetrics.value = transformMetrics(data.data)
      }
      return data
    } catch (error) {
      console.error('[DeploymentStore] Fetch metrics error:', error)
      return { success: false }
    }
  }

  async function fetchMetricsHistory(range: '1h' | '6h' | '24h' | '7d' = '24h') {
    try {
      const res = await fetch(`${API_BASE}/monitor/metrics/history?range=${range}`)
      const data = await res.json()
      if (data.success) {
        metricsHistory.value = data.data.map(transformMetrics)
      }
      return data
    } catch (error) {
      console.error('[DeploymentStore] Fetch metrics history error:', error)
      return { success: false }
    }
  }

  // Actions - Git
  async function fetchGitStatus() {
    try {
      const res = await fetch(`${API_BASE}/monitor/git/status`)
      const data = await res.json()
      if (data.success) {
        gitStatus.value = transformGitStatus(data.data)
      }
      return data
    } catch (error) {
      console.error('[DeploymentStore] Fetch git status error:', error)
      return { success: false }
    }
  }

  // Actions - Config
  async function fetchConfig() {
    try {
      const res = await fetch(`${API_BASE}/deployment/config`)
      const data = await res.json()
      if (data.success) {
        config.value = data.data
        deploymentEnabled.value = data.data.monitorEnabled
      }
      return data.data
    } catch (error) {
      console.error('[DeploymentStore] Fetch config error:', error)
      return null
    }
  }

  // WebSocket Management
  function connectWebSocket() {
    if (wsConnected.value) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/deployment`

    console.log('[WebSocket] Connecting to', wsUrl)

    wsConnection = new WebSocket(wsUrl)

    wsConnection.onopen = () => {
      console.log('[WebSocket] Connected')
      wsConnected.value = true
      wsConnectionRetries.value = 0
    }

    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        handleWebSocketMessage(message)
      } catch (error) {
        console.error('[WebSocket] Parse error:', error)
      }
    }

    wsConnection.onerror = (error) => {
      console.error('[WebSocket] Error:', error)
    }

    wsConnection.onclose = () => {
      console.log('[WebSocket] Disconnected')
      wsConnected.value = false

      // Auto-reconnect after 3 seconds
      if (wsConnectionRetries.value < 5) {
        wsConnectionRetries.value++
        wsReconnectTimeout = setTimeout(() => {
          connectWebSocket()
        }, 3000)
      } else {
        addToast('warning', 'Connection Lost', 'Failed to reconnect to WebSocket')
      }
    }
  }

  function disconnectWebSocket() {
    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout)
    }
    if (wsConnection) {
      wsConnection.close()
      wsConnection = null
    }
    wsConnected.value = false
  }

  function handleWebSocketMessage(message: any) {
    const { event, data } = message

    switch (event) {
      case 'connection:established':
        console.log('[WebSocket] Connection established', data)
        break

      case 'build:output':
        liveOutput.value += data.output || ''
        break

      case 'build:error':
        liveOutput.value += `\n❌ ${data.error || 'Unknown error'}\n`
        break

      case 'build:complete':
        liveOutput.value += `\n✅ Build ${data.success ? 'succeeded' : 'failed'}\n`
        fetchBuilds(20)
        break

      case 'metrics:update':
        currentMetrics.value = transformMetrics(data)
        break

      case 'event:*':
        console.log('[WebSocket] Event:', event, data)
        break

      default:
        console.log('[WebSocket] Unknown event:', event)
    }
  }

  // Notifications
  function addToast(
    type: 'success' | 'error' | 'warning' | 'info',
    title: string,
    message: string,
    duration: number = 4000
  ) {
    const id = `toast-${Date.now()}`
    const toast: ToastNotification = {
      id,
      type,
      title,
      message,
      duration,
      autoClose: true
    }

    toasts.value.push(toast)

    if (duration && duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    // Browser notification if available
    if (type === 'error' || type === 'warning') {
      sendBrowserNotification(title, message)
    }
  }

  function removeToast(id: string) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  function sendBrowserNotification(title: string, body: string) {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico'
        })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(title, { body, icon: '/favicon.ico' })
          }
        })
      }
    }
  }

  // Initialize monitoring
  async function initializeMonitoring() {
    try {
      await fetchConfig()
      await fetchBuilds(20)
      await fetchDependencies()
      await fetchCurrentMetrics()
      await fetchGitStatus()

      connectWebSocket()

      // Poll for metrics every 30 seconds
      if (metricsInterval) clearInterval(metricsInterval)
      metricsInterval = setInterval(() => {
        fetchCurrentMetrics()
      }, 30000)
    } catch (error) {
      console.error('[DeploymentStore] Initialize error:', error)
    }
  }

  // Transform functions (snake_case to camelCase)
  function transformBuildRecord(record: any): BuildRecord {
    return {
      id: record.id,
      triggerType: record.trigger_type,
      triggerSource: record.trigger_source,
      startedAt: record.started_at,
      completedAt: record.completed_at,
      status: record.status,
      buildOutput: record.build_output,
      exitCode: record.exit_code,
      durationMs: record.duration_ms,
      changedFiles: record.changed_files ? JSON.parse(record.changed_files) : [],
      errorMessage: record.error_message,
      environment: record.environment
    }
  }

  function transformDependency(dep: any): DependencyStatus {
    return {
      packageName: dep.package_name,
      currentVersion: dep.current_version,
      latestVersion: dep.latest_version,
      wantedVersion: dep.wanted_version,
      updateType: dep.update_type,
      isDevDependency: Boolean(dep.is_dev_dependency),
      hasSecurityIssues: Boolean(dep.has_security_issues),
      securityVulnerabilities: dep.security_vulnerabilities ? JSON.parse(dep.security_vulnerabilities) : [],
      lastCheckedAt: dep.last_checked_at,
      lastUpdatedAt: dep.last_updated_at,
      homepage: dep.homepage,
      description: dep.description
    }
  }

  function transformMetrics(m: any): SystemMetrics {
    return {
      timestamp: m.timestamp,
      cpuUsagePercent: m.cpu_usage_percent || 0,
      memoryTotalMb: m.memory_total_mb || 0,
      memoryUsedMb: m.memory_used_mb || 0,
      memoryFreeMb: m.memory_free_mb || 0,
      diskTotalGb: m.disk_total_gb || 0,
      diskUsedGb: m.disk_used_gb || 0,
      diskFreeGb: m.disk_free_gb || 0,
      uptimeSeconds: m.uptime_seconds || 0
    }
  }

  function transformGitStatus(g: any): GitStatus {
    return {
      timestamp: g.timestamp,
      branch: g.branch,
      latestCommitHash: g.latest_commit_hash,
      latestCommitMessage: g.latest_commit_message,
      latestCommitAuthor: g.latest_commit_author,
      latestCommitDate: g.latest_commit_date,
      uncommittedChangesCount: g.uncommitted_changes_count || 0,
      uncommittedFiles: g.uncommitted_files || '[]',
      remoteStatus: g.remote_status || 'unknown',
      commitsAhead: g.commits_ahead || 0,
      commitsBehind: g.commits_behind || 0
    }
  }

  return {
    // State
    builds,
    currentBuild,
    liveOutput,
    dependencies,
    currentMetrics,
    metricsHistory,
    gitStatus,
    gitHistory,
    config,
    wsConnected,
    wsConnectionRetries,
    deploymentEnabled,
    loading,
    toasts,

    // Computed
    dependenciesSummary,
    buildStats,

    // Actions
    fetchBuilds,
    fetchBuild,
    triggerBuild,
    fetchDependencies,
    checkDependencies,
    fetchCurrentMetrics,
    fetchMetricsHistory,
    fetchGitStatus,
    fetchConfig,
    connectWebSocket,
    disconnectWebSocket,
    initializeMonitoring,
    addToast,
    removeToast,
    sendBrowserNotification
  }
})
