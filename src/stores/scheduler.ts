import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ScheduleConfig, ExecutionLog, SchedulerStatus, TokenUsage, Conversation, ConversationGroup, HistoryEntry, MergedConversation } from '@/types'

const API_BASE = '/api'

export const useSchedulerStore = defineStore('scheduler', () => {
  const schedules = ref<ScheduleConfig[]>([])
  const logs = ref<ExecutionLog[]>([])
  const status = ref<SchedulerStatus | null>(null)
  const usage = ref<TokenUsage[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Conversation state
  const conversations = ref<Conversation[]>([])
  const conversationGroups = ref<ConversationGroup[]>([])
  const historyEntries = ref<HistoryEntry[]>([])
  const mergedData = ref<MergedConversation[]>([])

  // Project management state
  const availableProjects = ref<Array<{ projectPath: string; decodedPath: string; displayName: string; conversationCount: number }>>([])
  const selectedProject = ref<string>('all')
  const conversationSortOrder = ref<'asc' | 'desc'>('desc')
  const conversationsLoading = ref(false)

  // Config state
  const historyPaths = ref<string[]>([])
  const currentHistoryPathIndex = ref<number>(0)

  // Computed
  const enabledSchedules = computed(() => 
    schedules.value.filter(s => s.enabled)
  )

  const todayTokens = computed(() => {
    const today = new Date().toISOString().split('T')[0]
    const todayUsage = usage.value.find(u => u.date === today)
    return todayUsage?.totalTokens ?? 0
  })

  const todayCost = computed(() => {
    const today = new Date().toISOString().split('T')[0]
    const todayUsage = usage.value.find(u => u.date === today)
    return todayUsage?.totalCostUsd ?? 0
  })

  // Actions
  async function fetchSchedules() {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/schedules`)
      const data = await res.json()
      if (data.success) {
        schedules.value = data.data.map((s: Record<string, unknown>) => ({
          id: s.id,
          name: s.name,
          cronExpression: s.cron_expression,
          hour: s.hour,
          minute: s.minute,
          enabled: Boolean(s.enabled),
          prompt: s.prompt,
          createdAt: s.created_at,
          updatedAt: s.updated_at
        }))
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch schedules'
    } finally {
      loading.value = false
    }
  }

  async function createSchedule(schedule: Partial<ScheduleConfig>) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
      })
      const data = await res.json()
      if (data.success) {
        await fetchSchedules()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create schedule'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function updateSchedule(id: number, updates: Partial<ScheduleConfig>) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      const data = await res.json()
      if (data.success) {
        await fetchSchedules()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update schedule'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function deleteSchedule(id: number) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/schedules/${id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        await fetchSchedules()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete schedule'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function executeNow(id: number) {
    try {
      const res = await fetch(`${API_BASE}/schedules/${id}/execute`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success) {
        // 稍後刷新 logs
        setTimeout(fetchLogs, 2000)
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to execute'
      return { success: false, error: error.value }
    }
  }

  async function setup5HourPreset(startHour: number) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/presets/5hour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startHour })
      })
      const data = await res.json()
      if (data.success) {
        await fetchSchedules()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to setup preset'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function fetchLogs(limit = 50) {
    try {
      const res = await fetch(`${API_BASE}/logs?limit=${limit}`)
      const data = await res.json()
      if (data.success) {
        logs.value = data.data.logs.map((l: Record<string, unknown>) => ({
          id: l.id,
          scheduleId: l.schedule_id,
          scheduleName: l.schedule_name,
          executedAt: l.executed_at,
          status: l.status,
          inputTokens: l.input_tokens,
          outputTokens: l.output_tokens,
          totalTokens: l.total_tokens,
          costUsd: l.cost_usd,
          durationMs: l.duration_ms,
          response: l.response,
          error: l.error
        }))
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch logs'
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_BASE}/stats`)
      const data = await res.json()
      if (data.success) {
        status.value = data.data
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch status'
    }
  }

  async function fetchUsage(days = 7) {
    try {
      const res = await fetch(`${API_BASE}/usage?days=${days}`)
      const data = await res.json()
      if (data.success) {
        usage.value = data.data.map((u: Record<string, unknown>) => ({
          date: u.date,
          totalInputTokens: u.total_input_tokens,
          totalOutputTokens: u.total_output_tokens,
          totalTokens: u.total_tokens,
          totalCostUsd: u.total_cost_usd,
          executionCount: u.execution_count
        }))
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch usage'
    }
  }

  async function quickChat(prompt = 'hi') {
    try {
      const res = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const data = await res.json()
      if (data.success) {
        // 稍後刷新 logs
        setTimeout(fetchLogs, 2000)
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to execute quick chat'
      return { success: false, error: error.value }
    }
  }

  // Conversation actions
  async function fetchConversations(filters?: {
    search?: string
    source?: string
    category?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (filters?.search) params.append('search', filters.search)
      if (filters?.source) params.append('source', filters.source)
      if (filters?.category) params.append('category', filters.category)
      if (filters?.startDate) params.append('startDate', filters.startDate)
      if (filters?.endDate) params.append('endDate', filters.endDate)
      if (filters?.limit) params.append('limit', filters.limit.toString())
      if (filters?.offset) params.append('offset', filters.offset.toString())

      const res = await fetch(`${API_BASE}/conversations?${params}`)
      const data = await res.json()
      if (data.success) {
        conversations.value = data.data.conversations
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch conversations'
    } finally {
      loading.value = false
    }
  }

  async function fetchConversationGroups(filters?: {
    search?: string
    source?: string
    category?: string
    projectPath?: string
    sortOrder?: 'asc' | 'desc'
  }) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (filters?.search) params.append('search', filters.search)
      if (filters?.source) params.append('source', filters.source)
      if (filters?.category) params.append('category', filters.category)
      if (filters?.projectPath) params.append('projectPath', filters.projectPath)
      if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder)

      const res = await fetch(`${API_BASE}/conversations/groups?${params}`)
      const data = await res.json()
      if (data.success) {
        // Debug logging - before transformation
        console.log('[fetchConversationGroups] API response:', {
          groupCount: data.data.groups.length,
          total: data.data.total,
          firstGroupSample: data.data.groups[0] ? {
            date: data.data.groups[0].date,
            conversationCount: data.data.groups[0].conversations.length,
            firstConvFields: Object.keys(data.data.groups[0].conversations[0] || {})
          } : null
        })

        // Transform snake_case to camelCase
        conversationGroups.value = data.data.groups.map((g: any) => ({
          date: g.date,
          label: g.label,
          count: g.count,
          conversations: g.conversations.map((c: Record<string, unknown>) => ({
            id: c.id,
            executionLogId: c.execution_log_id,
            sessionId: c.session_id,
            projectPath: c.project_path,
            userPrompt: c.user_prompt,
            assistantResponse: c.assistant_response,
            category: c.category,
            tags: c.tags,
            source: c.source,
            executedAt: c.executed_at,
            categorizedAt: c.categorized_at,
            inputTokens: c.input_tokens,
            outputTokens: c.output_tokens,
            totalTokens: c.total_tokens,
            costUsd: c.cost_usd,
            durationMs: c.duration_ms,
            createdAt: c.created_at
          }))
        }))

        // Debug logging - after transformation
        console.log('[fetchConversationGroups] Transformed data:', {
          groupCount: conversationGroups.value.length,
          firstGroupSample: conversationGroups.value[0] ? {
            date: conversationGroups.value[0].date,
            conversationCount: conversationGroups.value[0].conversations.length,
            firstConvFields: Object.keys(conversationGroups.value[0].conversations[0] || {}),
            firstConvUserPrompt: conversationGroups.value[0].conversations[0]?.userPrompt?.substring(0, 50)
          } : null
        })
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch conversation groups'
    } finally {
      loading.value = false
    }
  }

  async function importHistory(limit = 100, project?: string) {
    loading.value = true
    try {
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      if (project) params.append('project', project)

      const res = await fetch(`${API_BASE}/conversations/history-import?${params}`)
      const data = await res.json()
      if (data.success) {
        historyEntries.value = data.data.entries
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to import history'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function mergeHistoryWithLogs(timeWindowSeconds = 300) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/conversations/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeWindowSeconds })
      })
      const data = await res.json()
      if (data.success) {
        mergedData.value = data.data.merged
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to merge data'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function saveConversations(conversationsToSave: Array<Record<string, unknown>>) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversations: conversationsToSave })
      })
      const data = await res.json()
      if (data.success) {
        await fetchConversationGroups()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save conversations'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function updateConversation(id: number, updates: { category?: string; tags?: string[] }) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      const data = await res.json()
      if (data.success) {
        await fetchConversationGroups()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update conversation'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function deleteConversation(id: number) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        await fetchConversationGroups()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete conversation'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function importFromProjects(projectPath?: string, limit = 100, incrementalOnly = false) {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/conversations/import-from-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, limit, incrementalOnly })
      })
      const data = await res.json()
      if (data.success) {
        await fetchAvailableProjects()
        await fetchConversationGroups()
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to import from projects'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function checkForNewConversations(projectPath?: string) {
    try {
      const params = new URLSearchParams()
      if (projectPath) params.append('projectPath', projectPath)

      const res = await fetch(`${API_BASE}/conversations/check-new?${params}`)
      return await res.json()
    } catch (e) {
      console.error('[Store] Failed to check for new conversations:', e)
      return { success: false, error: e instanceof Error ? e.message : 'Check failed' }
    }
  }

  async function fetchAvailableProjects() {
    try {
      const res = await fetch(`${API_BASE}/conversations/projects/list`)
      const data = await res.json()
      if (data.success) {
        availableProjects.value = [
          { projectPath: 'all', displayName: 'All Projects', decodedPath: '', conversationCount: 0 },
          ...data.data
        ]
      }
    } catch (e) {
      console.error('Failed to fetch available projects:', e)
    }
  }

  function setSelectedProject(projectPath: string) {
    selectedProject.value = projectPath
  }

  function toggleSortOrder() {
    conversationSortOrder.value = conversationSortOrder.value === 'asc' ? 'desc' : 'asc'
  }

  // Config actions
  async function getHistoryPaths() {
    try {
      const res = await fetch(`${API_BASE}/config/history-paths`)
      const data = await res.json()
      if (data.success) {
        historyPaths.value = data.data.paths
        currentHistoryPathIndex.value = data.data.currentIndex
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get history paths'
      return { success: false, error: error.value }
    }
  }

  async function addHistoryPath(newPath: string) {
    try {
      const res = await fetch(`${API_BASE}/config/history-paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath })
      })
      const data = await res.json()
      if (data.success) {
        historyPaths.value = data.data.paths
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to add history path'
      return { success: false, error: error.value }
    }
  }

  async function removeHistoryPath(index: number) {
    try {
      const res = await fetch(`${API_BASE}/config/history-paths/${index}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        historyPaths.value = data.data.paths
        currentHistoryPathIndex.value = data.data.currentIndex
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to remove history path'
      return { success: false, error: error.value }
    }
  }

  async function selectHistoryPath(index: number) {
    try {
      const res = await fetch(`${API_BASE}/config/history-paths/${index}/select`, {
        method: 'PUT'
      })
      const data = await res.json()
      if (data.success) {
        currentHistoryPathIndex.value = data.data.currentIndex
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to select history path'
      return { success: false, error: error.value }
    }
  }

  async function clearConversations() {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/conversations/clear`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        conversations.value = []
        conversationGroups.value = []
      }
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to clear conversations'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    schedules,
    logs,
    status,
    usage,
    loading,
    error,
    // Conversation state
    conversations,
    conversationGroups,
    historyEntries,
    mergedData,
    // Config state
    historyPaths,
    currentHistoryPathIndex,
    // Computed
    enabledSchedules,
    todayTokens,
    todayCost,
    // Actions
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    executeNow,
    setup5HourPreset,
    fetchLogs,
    fetchStatus,
    fetchUsage,
    quickChat,
    // Conversation actions
    fetchConversations,
    fetchConversationGroups,
    importHistory,
    mergeHistoryWithLogs,
    saveConversations,
    updateConversation,
    deleteConversation,
    importFromProjects,
    checkForNewConversations,
    clearConversations,
    // Project management actions
    fetchAvailableProjects,
    setSelectedProject,
    toggleSortOrder,
    // Project management state
    availableProjects,
    selectedProject,
    conversationSortOrder,
    conversationsLoading,
    // Config actions
    getHistoryPaths,
    addHistoryPath,
    removeHistoryPath,
    selectHistoryPath
  }
})
