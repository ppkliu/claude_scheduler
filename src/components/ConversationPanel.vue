<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import { MessageCircle, Search, Save, ChevronDown, ChevronUp, User, Bot, AlertCircle, Loader, Trash2, FolderOpen, ArrowUp, ArrowDown, RotateCw } from 'lucide-vue-next'
import { formatDateTime, formatCost, formatTokens } from '@/lib/utils'
import { useDebounceFn } from '@vueuse/core'
import MarkdownRenderer from './MarkdownRenderer.vue'
import ConversationAnalysisView from './ConversationAnalysisView.vue'
import ConversationProjectView from './ConversationProjectView.vue'

const { t } = useI18n()
const store = useSchedulerStore()
const searchQuery = ref('')
const selectedSource = ref<string>('')
const selectedCategory = ref<string>('')
const selectedProject = ref<string>('all')
const expandedMessages = ref<Set<number>>(new Set())
const showImportModal = ref(false)
const isImporting = ref(false)
const showAddPathInput = ref(false)
const newPathInput = ref('')
const addingPath = ref(false)
const viewMode = ref<'list' | 'analysis' | 'project'>('list')
const expandedProjects = ref<Set<string>>(new Set())
const isRefreshing = ref(false)

// Auto-detection state for new conversations
const newConversationsAvailable = ref(false)
const newFileCount = ref(0)
const checkingForNew = ref(false)
const autoCheckInterval = ref<number | null>(null)

// Toast notification state
const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error' | 'warning' | 'info'>('success')

function showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true

  // Auto-dismiss for success, warning, and info (not error)
  if (type !== 'error') {
    setTimeout(() => {
      showToast.value = false
    }, 3000)
  }
}

function dismissToast() {
  showToast.value = false
}

function toggleProjectExpand(projectPath: string) {
  if (expandedProjects.value.has(projectPath)) {
    expandedProjects.value.delete(projectPath)
  } else {
    expandedProjects.value.add(projectPath)
  }
}

const MESSAGE_COLLAPSE_THRESHOLD = 100

// Pagination state
const currentPage = ref(1)
const conversationsPerPage = 50

// Conversation collapse state - all conversations collapsed by default
const expandedConversations = ref<Set<number>>(new Set())

// Helper function to re-group conversations by day
function groupConversationsByDay(conversations: any[]) {
  const groups = new Map<string, any[]>()

  for (const conv of conversations) {
    const date = conv.executedAt.split('T')[0]
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(conv)
  }

  return Array.from(groups.entries())
    .map(([date, convs]) => ({
      date,
      label: getDayLabel(date),
      conversations: convs,
      count: convs.length
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - date.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays <= 7) return `${diffDays}天前`
  if (diffDays <= 30) return `${Math.floor(diffDays / 7)}週前`
  return `${Math.floor(diffDays / 30)}個月前`
}

// Computed properties for pagination
const allConversations = computed(() => {
  return store.conversationGroups.flatMap(g =>
    (g.conversations as any[]).map(conv => ({
      ...conv,
      groupDate: g.date,
      groupLabel: g.label
    }))
  )
})

const paginatedConversations = computed(() => {
  const startIndex = (currentPage.value - 1) * conversationsPerPage
  const endIndex = startIndex + conversationsPerPage
  return allConversations.value.slice(startIndex, endIndex)
})

const paginatedGroups = computed(() => {
  return groupConversationsByDay(paginatedConversations.value)
})

const totalPages = computed(() => {
  return Math.ceil(allConversations.value.length / conversationsPerPage)
})

const totalConversations = computed(() => {
  return store.conversationGroups.reduce((sum, g) => sum + g.count, 0)
})

const visiblePages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const delta = 2 // Show 2 pages on each side of current

  if (total <= 7) {
    // Show all pages if total is small
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: number[] = []

  // Always show first page
  pages.push(1)

  // Calculate range around current page
  const rangeStart = Math.max(2, current - delta)
  const rangeEnd = Math.min(total - 1, current + delta)

  // Add ellipsis if needed
  if (rangeStart > 2) {
    pages.push(-1) // -1 represents ellipsis
  }

  // Add range
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i)
  }

  // Add ellipsis if needed
  if (rangeEnd < total - 1) {
    pages.push(-2) // -2 represents ellipsis
  }

  // Always show last page
  if (total > 1) {
    pages.push(total)
  }

  return pages
})

// Get latest message timestamp for refresh
const latestMessageTimestamp = computed(() => {
  if (allConversations.value.length === 0) return null
  // Get the latest timestamp from all conversations
  const timestamps = allConversations.value
    .map(conv => new Date(conv.executedAt).getTime())
    .filter(ts => !isNaN(ts))
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null
})

// Pagination control functions
function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function goToPage(page: number) {
  currentPage.value = page
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 載入對話（防止重複調用）
async function loadConversations() {
  if (store.conversationsLoading) {
    console.log('[ConversationPanel] Already loading conversations, skipping...')
    return
  }

  console.log('[ConversationPanel] Loading conversations with filters:', {
    search: searchQuery.value,
    source: selectedSource.value,
    category: selectedCategory.value,
    project: selectedProject.value,
    sortOrder: store.conversationSortOrder
  })

  await store.fetchConversationGroups({
    search: searchQuery.value || undefined,
    source: selectedSource.value || undefined,
    category: selectedCategory.value || undefined,
    projectPath: selectedProject.value || undefined,
    sortOrder: store.conversationSortOrder
  })
}

// 搜索使用 debounce
const debouncedSearch = useDebounceFn(() => {
  loadConversations()
}, 300)

onMounted(async () => {
  await store.fetchAvailableProjects()
  await loadConversations()
  // Load current history paths configuration
  await store.getHistoryPaths()

  // Launch auto-check for new conversations (every 30 seconds)
  autoCheckInterval.value = window.setInterval(() => {
    checkForNewConversations()
  }, 30000)

  // Run first check immediately
  checkForNewConversations()
})

onUnmounted(() => {
  if (autoCheckInterval.value) {
    clearInterval(autoCheckInterval.value)
    autoCheckInterval.value = null
  }
})

// Watch search/filters
watch(searchQuery, () => {
  debouncedSearch()
})

watch([selectedSource, selectedCategory, selectedProject], () => {
  loadConversations()
})

// Watch sort order changes
watch(() => store.conversationSortOrder, () => {
  loadConversations()
})

function toggleExpanded(id: number) {
  if (expandedMessages.value.has(id)) {
    expandedMessages.value.delete(id)
  } else {
    expandedMessages.value.add(id)
  }
}

function toggleConversationExpand(id: number) {
  if (expandedConversations.value.has(id)) {
    expandedConversations.value.delete(id)
  } else {
    expandedConversations.value.add(id)
  }
}

function isConversationExpanded(id: number): boolean {
  return expandedConversations.value.has(id)
}

function getConversationPreview(text: string, maxLength = 80): string {
  if (!text) return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

function isLongMessage(text: string | undefined): boolean {
  return (text?.length ?? 0) > MESSAGE_COLLAPSE_THRESHOLD
}

function getTruncatedText(text: string | undefined): string {
  if (!text) return ''
  return text.substring(0, MESSAGE_COLLAPSE_THRESHOLD) + '...'
}

async function performImport() {
  isImporting.value = true
  store.error = null // Clear previous errors

  try {
    // Step 1: Import history
    await store.importHistory(100)

    if (!store.historyEntries || store.historyEntries.length === 0) {
      showNotification('沒有找到可匯入的對話記錄，請檢查歷史文件路徑是否正確', 'warning')
      return
    }

    // Step 2: Merge with logs
    await store.mergeHistoryWithLogs(300)

    // DEBUG: Log merged data structure to verify it contains historyEntry
    console.log('[Import] Merged data sample:', {
      total: store.mergedData.length,
      firstEntry: {
        hasHistoryEntry: !!store.mergedData[0]?.historyEntry,
        historyDisplay: store.mergedData[0]?.historyEntry?.display?.substring(0, 100),
        historyTimestamp: store.mergedData[0]?.historyEntry?.timestamp,
        hasExecutionLog: !!store.mergedData[0]?.executionLog,
        executionResponse: store.mergedData[0]?.executionLog?.response?.substring(0, 100)
      }
    })

    // Step 3: Transform merged data for saving
    // CRITICAL FIX: Filter out entries without display text to prevent corrupted data
    const conversationsToSave = store.mergedData
      .filter(m => {
        // Only save if we have a history entry with display text
        if (!m.historyEntry?.display || m.historyEntry.display.trim() === '') {
          console.warn('[Import] Skipping entry without display text:', m)
          return false
        }
        return true
      })
      .map(m => {
        const executedAt = m.historyEntry
          ? new Date(m.historyEntry.timestamp).toISOString()
          : m.executionLog?.executedAt || new Date().toISOString()

        // FIX: Correctly assign source - pure history entries should be 'history_import'
        const source = m.executionLog?.scheduleId
          ? 'scheduled'
          : m.executionLog
            ? 'quick_chat'
            : 'history_import'  // NEW: Correct source for pure history entries

        return {
          userPrompt: m.historyEntry!.display,  // Use non-null assertion since we filtered above
          assistantResponse: m.executionLog?.response || null,
          executedAt,
          category: 'uncategorized',
          tags: [],
          source,
          executionLogId: m.executionLog?.id || null,
          sessionId: m.historyEntry?.sessionId,
          projectPath: m.historyEntry?.project,
          inputTokens: m.executionLog?.inputTokens || 0,
          outputTokens: m.executionLog?.outputTokens || 0,
          totalTokens: m.executionLog?.totalTokens || 0,
          costUsd: m.executionLog?.costUsd || 0,
          durationMs: m.executionLog?.durationMs || 0
        }
      })

    // DEBUG: Log prepared conversations before saving
    console.log('[Import] Prepared conversations for saving:', {
      total: conversationsToSave.length,
      firstSample: {
        userPrompt: conversationsToSave[0]?.userPrompt?.substring(0, 100),
        executedAt: conversationsToSave[0]?.executedAt,
        source: conversationsToSave[0]?.source
      }
    })

    if (conversationsToSave.length === 0) {
      showNotification('沒有新的對話需要匯入', 'warning')
      return
    }

    // Step 4: Save to database
    const result = await store.saveConversations(conversationsToSave)

    if (result.success) {
      const insertedCount = result.data?.inserted || 0
      const failedCount = result.data?.failed || 0

      showImportModal.value = false
      await store.fetchConversationGroups()
      console.log('[Frontend] Conversation groups after import:', store.conversationGroups)
      console.log('[Frontend] Total conversations loaded:', store.conversationGroups.reduce((sum, g) => sum + g.count, 0))

      if (failedCount > 0) {
        showNotification(
          `成功匯入 ${insertedCount} 筆對話，${failedCount} 筆失敗`,
          'warning'
        )
      } else {
        showNotification(
          `✓ 成功匯入 ${insertedCount} 筆對話`,
          'success'
        )
      }
    } else {
      showNotification(
        `匯入失敗: ${result.error || '未知錯誤'}`,
        'error'
      )
    }
  } catch (error) {
    console.error('Import failed:', error)
    const errorMessage = error instanceof Error ? error.message : 'Import failed'
    showNotification(`匯入過程發生錯誤: ${errorMessage}`, 'error')
  } finally {
    isImporting.value = false
  }
}

// Check for new conversations from project files
async function checkForNewConversations() {
  if (checkingForNew.value) return

  checkingForNew.value = true
  try {
    const result = await store.checkForNewConversations(
      selectedProject.value !== 'all' ? selectedProject.value : undefined
    )

    if (result.success && result.data.hasNewConversations) {
      newConversationsAvailable.value = true
      newFileCount.value = result.data.newFileCount
      console.log('[ConversationPanel] New conversations detected:', {
        count: newFileCount.value,
        project: selectedProject.value
      })
    } else {
      newConversationsAvailable.value = false
      newFileCount.value = 0
    }
  } catch (e) {
    console.error('[ConversationPanel] Failed to check for new conversations:', e)
    newConversationsAvailable.value = false
  } finally {
    checkingForNew.value = false
  }
}

async function importFromProjects() {
  isImporting.value = true
  store.error = null

  // Reset new conversation badge before importing
  newConversationsAvailable.value = false
  newFileCount.value = 0

  try {
    const result = await store.importFromProjects(
      selectedProject.value !== 'all' ? selectedProject.value : undefined,
      100,
      true  // incrementalOnly - only import new conversations
    )

    if (result.success) {
      const { inserted, duplicates = 0, failed, total } = result.data

      if (duplicates > 0 && failed > 0) {
        showNotification(
          `匯入 ${inserted} 筆新對話，${duplicates} 筆重複已略過，${failed} 筆失敗`,
          'warning'
        )
      } else if (duplicates > 0) {
        showNotification(
          `匯入 ${inserted} 筆新對話，${duplicates} 筆重複已略過`,
          'success'
        )
      } else if (failed > 0) {
        showNotification(
          `成功從 Projects 匯入 ${inserted} 筆對話，${failed} 筆失敗（共 ${total} 筆）`,
          'warning'
        )
      } else {
        showNotification(
          `✓ 成功從 Projects 匯入 ${inserted} 筆新對話（共 ${total} 筆）`,
          'success'
        )
      }

      // 重新載入對話
      await store.fetchConversationGroups()
    } else {
      showNotification(
        `匯入失敗: ${result.error || '未知錯誤'}`,
        'error'
      )
    }
  } catch (error) {
    console.error('Import from projects failed:', error)
    showNotification(
      `匯入過程發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`,
      'error'
    )
  } finally {
    isImporting.value = false
  }
}

// Refresh conversations from latest message timestamp
async function refreshConversations() {
  if (isRefreshing.value || totalConversations.value === 0) return

  isRefreshing.value = true
  try {
    // Get the latest timestamp from current conversations
    if (!latestMessageTimestamp.value) {
      showNotification('沒有可刷新的對話', 'info')
      return
    }

    // Reload conversations with current filters
    const filters = {
      search: searchQuery.value || undefined,
      source: selectedSource.value || undefined,
      category: selectedCategory.value || undefined,
      projectPath: selectedProject.value !== 'all' ? selectedProject.value : undefined,
      sortOrder: store.conversationSortOrder as 'asc' | 'desc'
    }

    // Remove undefined values
    const cleanFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v !== undefined)
    )

    await store.fetchConversationGroups(cleanFilters)
    showNotification('✓ 已更新最新對話', 'success')
  } catch (error) {
    console.error('Refresh failed:', error)
    showNotification(
      `刷新失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
      'error'
    )
  } finally {
    isRefreshing.value = false
  }
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'scheduled':
      return '排程'
    case 'quick_chat':
      return '快速'
    case 'manual':
      return '手動'
    default:
      return source
  }
}

function getSourceColor(source: string): string {
  switch (source) {
    case 'scheduled':
      return 'bg-blue-500/10 text-blue-500'
    case 'quick_chat':
      return 'bg-green-500/10 text-green-500'
    case 'manual':
      return 'bg-orange-500/10 text-orange-500'
    default:
      return 'bg-gray-500/10 text-gray-500'
  }
}

async function handleAddPath() {
  if (!newPathInput.value.trim()) {
    store.error = 'Please provide a valid path'
    return
  }

  addingPath.value = true
  try {
    const result = await store.addHistoryPath(newPathInput.value)
    if (result.success) {
      newPathInput.value = ''
      showAddPathInput.value = false
      // Auto-select the newly added path
      await store.selectHistoryPath(result.data.paths.length - 1)
    }
  } catch (error) {
    console.error('Failed to add history path:', error)
  } finally {
    addingPath.value = false
  }
}

async function handleSelectPath(index: number) {
  try {
    await store.selectHistoryPath(index)
  } catch (error) {
    console.error('Failed to select history path:', error)
  }
}

async function clearAllConversations() {
  // Show confirmation dialog
  if (!confirm('⚠️ 確定要清除所有對話記錄嗎？此操作無法撤銷！')) {
    return
  }

  try {
    const result = await store.clearConversations()
    if (result.success) {
      showNotification(`✅ 已清除 ${result.data.deletedCount} 筆對話記錄`, 'success')
      // Clear filters and reset to first page
      searchQuery.value = ''
      selectedSource.value = ''
      selectedCategory.value = ''
      currentPage.value = 1
      // Refresh the conversation groups
      await store.fetchConversationGroups()
    } else {
      showNotification(`清除失敗: ${result.error}`, 'error')
    }
  } catch (error) {
    console.error('Failed to clear conversations:', error)
    showNotification(`清除過程發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`, 'error')
  }
}

async function handleRemovePath(index: number) {
  if (confirm('Are you sure you want to delete this path?')) {
    try {
      await store.removeHistoryPath(index)
    } catch (error) {
      console.error('Failed to remove history path:', error)
    }
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header & Search -->
    <div class="bg-card border border-border rounded-xl p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold">{{ t('conversations.title') }}</h3>
          <p class="text-sm text-muted-foreground">
            {{ t('conversations.total', { count: totalConversations }) }}<span v-if="totalPages > 1"> ({{ t('conversations.page', { current: currentPage, total: totalPages }) }})</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="showImportModal = true"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            <Save class="w-4 h-4" />
            {{ t('conversations.importHistory') }}
          </button>
          <button
            @click="importFromProjects"
            :disabled="isImporting"
            class="relative inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <!-- New conversations notification badge -->
            <span
              v-if="newConversationsAvailable"
              class="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse"
            >
              {{ newFileCount > 99 ? '99+' : newFileCount }}
            </span>

            <Loader v-if="isImporting" class="w-4 h-4 animate-spin" />
            <FolderOpen v-else class="w-4 h-4" />
            {{ isImporting ? t('conversations.importing') : t('conversations.importFromProjects') }}
          </button>
          <button
            v-if="totalConversations > 0"
            @click="refreshConversations"
            :disabled="isRefreshing"
            :title="`從 ${latestMessageTimestamp || '當前'} 更新最新對話`"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/10 text-blue-600 border border-blue-600/30 font-medium text-sm hover:bg-blue-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCw :class="['w-4 h-4', { 'animate-spin': isRefreshing }]" />
            {{ isRefreshing ? '更新中...' : '更新對話' }}
          </button>
          <button
            v-if="totalConversations > 0"
            @click="clearAllConversations"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 font-medium text-sm hover:bg-destructive/20 transition-colors"
          >
            <Trash2 class="w-4 h-4" />
            {{ t('conversations.clearAll') }}
          </button>
        </div>
      </div>

      <!-- Search & Filters -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('conversations.searchPlaceholder')"
            class="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <select
          v-model="selectedProject"
          class="px-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option v-for="project in store.availableProjects" :key="project.projectPath" :value="project.projectPath">
            {{ project.displayName }} ({{ project.conversationCount }})
          </option>
        </select>

        <select
          v-model="selectedSource"
          class="px-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{{ t('conversations.allSources') }}</option>
          <option value="scheduled">{{ t('conversations.sourceScheduled') }}</option>
          <option value="quick_chat">{{ t('conversations.sourceQuickChat') }}</option>
          <option value="manual">{{ t('conversations.sourceManual') }}</option>
        </select>

        <div class="flex gap-2">
          <select
            v-model="selectedCategory"
            class="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{{ t('conversations.allCategories') }}</option>
            <option value="uncategorized">{{ t('conversations.uncategorized') }}</option>
            <option value="work">Work</option>
            <option value="personal">Personal</option>
            <option value="test">Test</option>
          </select>

          <button
            @click="store.toggleSortOrder()"
            :title="store.conversationSortOrder === 'asc' ? '最舊優先' : '最新優先'"
            class="px-4 py-2 bg-background border border-border rounded-lg text-sm hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
          >
            <component
              :is="store.conversationSortOrder === 'asc' ? ArrowUp : ArrowDown"
              class="w-4 h-4"
            />
          </button>
        </div>
      </div>

      <!-- View Mode Toggle -->
      <div v-if="totalConversations > 0" class="flex gap-2">
        <button
          @click="viewMode = 'list'"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'list'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background border border-border hover:bg-secondary/50'
          ]"
        >
          {{ t('conversations.listView') || '列表視圖' }}
        </button>
        <button
          @click="viewMode = 'analysis'"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'analysis'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background border border-border hover:bg-secondary/50'
          ]"
        >
          {{ t('conversations.analysisView') || '分析視圖' }}
        </button>
        <button
          @click="viewMode = 'project'"
          :class="[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'project'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background border border-border hover:bg-secondary/50'
          ]"
        >
          {{ t('conversations.projectView') || '專案視圖' }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="store.loading"
      class="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground flex items-center justify-center gap-3"
    >
      <Loader class="w-5 h-5 animate-spin" />
      <span>{{ t('common.loading') }}</span>
    </div>

    <!-- Error State -->
    <div
      v-else-if="store.error"
      class="bg-card border border-destructive rounded-xl p-6 flex items-start gap-4"
    >
      <AlertCircle class="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
      <div>
        <h4 class="font-medium text-destructive">發生錯誤</h4>
        <p class="text-sm text-muted-foreground">{{ store.error }}</p>
      </div>
    </div>

    <!-- Conversation Groups -->
    <template v-else>
      <!-- List View -->
      <div v-if="viewMode === 'list'" class="space-y-4">
        <div
          v-for="group in paginatedGroups"
          :key="group.date"
          class="space-y-4"
        >
          <!-- Day Header -->
          <div class="flex items-center gap-3">
            <div class="h-px flex-1 bg-border"></div>
            <div class="px-4 py-1.5 bg-secondary/50 rounded-full text-sm font-medium text-muted-foreground">
              {{ group.label }} · {{ group.count }} 筆
            </div>
            <div class="h-px flex-1 bg-border"></div>
          </div>

          <!-- Conversations -->
          <div
            v-for="conv in (group.conversations as any[])"
            :key="conv.id"
            class="bg-card border border-border rounded-xl overflow-hidden"
          >
            <!-- Conversation Header - Always Visible & Clickable -->
            <button
              @click="toggleConversationExpand(conv.id)"
              class="w-full px-6 py-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
            >
              <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <User class="w-4 h-4 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <span class="text-xs font-medium text-muted-foreground">USER</span>
                  <span class="text-xs text-muted-foreground">{{ formatDateTime(conv.executedAt) }}</span>
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="getSourceColor(conv.source)"
                  >
                    {{ getSourceLabel(conv.source) }}
                  </span>
                  <span v-if="conv.totalTokens > 0" class="text-xs text-muted-foreground">
                    {{ formatTokens(conv.totalTokens) }}
                  </span>
                </div>
                <div class="text-sm text-foreground truncate">
                  {{ getConversationPreview(conv.userPrompt) }}
                </div>
              </div>
              <component
                :is="isConversationExpanded(conv.id) ? ChevronUp : ChevronDown"
                class="w-5 h-5 text-muted-foreground flex-shrink-0"
              />
            </button>

            <!-- Conversation Details - Expandable -->
            <div v-if="isConversationExpanded(conv.id)" class="px-6 pb-6 space-y-4 border-t border-border">
              <!-- Full User Message -->
              <div class="flex gap-3 pt-4">
                <div class="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <User class="w-4 h-4 text-primary" />
                </div>
                <div class="flex-1 space-y-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-medium text-muted-foreground">USER</span>
                  </div>
                  <div class="text-foreground whitespace-pre-wrap break-words">
                    {{ conv.userPrompt }}
                  </div>
                </div>
              </div>

              <!-- Assistant Message -->
              <div v-if="conv.assistantResponse" class="flex gap-3">
                <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <Bot class="w-4 h-4 text-emerald-500" />
                </div>
                <div class="flex-1 space-y-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-medium text-emerald-500">ASSISTANT</span>
                    <span class="text-xs text-muted-foreground">{{ formatTokens(conv.totalTokens) }}</span>
                    <span class="text-xs text-muted-foreground">{{ formatCost(conv.costUsd) }}</span>
                  </div>
                  <div class="text-foreground">
                    <MarkdownRenderer
                      v-if="!isLongMessage(conv.assistantResponse) || expandedMessages.has(conv.id)"
                      :content="conv.assistantResponse"
                    />
                    <div v-else class="whitespace-pre-wrap break-words">
                      {{ getTruncatedText(conv.assistantResponse) }}
                    </div>
                  </div>
                  <button
                    v-if="isLongMessage(conv.assistantResponse)"
                    @click="toggleExpanded(conv.id)"
                    class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <component :is="expandedMessages.has(conv.id) ? ChevronUp : ChevronDown" class="w-3 h-3" />
                    {{ expandedMessages.has(conv.id) ? '收起' : '展開全文' }}
                  </button>
                </div>
              </div>

              <!-- Metadata -->
              <div class="flex items-center gap-4 pt-2 border-t border-border text-xs text-muted-foreground flex-wrap">
                <span v-if="conv.category && conv.category !== 'uncategorized'" class="px-2 py-1 rounded bg-secondary">
                  {{ conv.category }}
                </span>
                <span v-if="conv.durationMs">{{ conv.durationMs }}ms</span>
                <span v-if="conv.projectPath" class="font-mono">{{ conv.projectPath.split('/').pop() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Analysis View -->
      <ConversationAnalysisView
        v-else-if="viewMode === 'analysis'"
        :conversations="allConversations"
      />

      <!-- Project View -->
      <ConversationProjectView
        v-else-if="viewMode === 'project'"
        :conversations="allConversations"
        :expanded-projects="expandedProjects"
        @toggle-expand="toggleProjectExpand"
      />

      <!-- Empty State -->
      <div
        v-if="totalConversations === 0"
        class="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground"
      >
        <MessageCircle class="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p class="text-lg font-medium">尚無對話記錄</p>
        <p class="text-sm">點擊「分類並儲存」匯入對話歷史</p>
      </div>

      <!-- Pagination Controls -->
      <div
        v-if="totalPages > 1"
        class="flex items-center justify-between bg-card border border-border rounded-xl p-4 mt-6"
      >
        <!-- Page Info -->
        <div class="text-sm text-muted-foreground">
          顯示第 {{ Math.max(1, (currentPage - 1) * conversationsPerPage + 1) }} -
          {{ Math.min(currentPage * conversationsPerPage, totalConversations) }} 筆，
          共 {{ totalConversations }} 筆對話
        </div>

        <!-- Page Controls -->
        <div class="flex items-center gap-2">
          <!-- Previous Button -->
          <button
            @click="prevPage"
            :disabled="currentPage === 1"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            上一頁
          </button>

          <!-- Page Numbers -->
          <div class="flex items-center gap-1">
            <button
              v-for="page in visiblePages"
              :key="page"
              @click="page > 0 && goToPage(page)"
              :class="[
                'transition-colors',
                page < 0
                  ? 'w-8 h-8 text-muted-foreground cursor-default'
                  : `w-8 h-8 rounded-lg text-sm font-medium ${
                      page === currentPage
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border border-border hover:bg-muted'
                    }`
              ]"
              :disabled="page < 0"
            >
              {{ page > 0 ? page : '...' }}
            </button>
          </div>

          <!-- Next Button -->
          <button
            @click="nextPage"
            :disabled="currentPage === totalPages"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            下一頁
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- Import Modal -->
    <div
      v-if="showImportModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-card border border-border rounded-xl max-w-md w-full p-6 space-y-4">
        <h3 class="text-lg font-semibold">分類並儲存對話</h3>
        <p class="text-sm text-muted-foreground">
          系統將自動讀取 Claude 對話歷史，與執行記錄進行關聯，並儲存到資料庫。
        </p>

        <!-- History Paths Configuration -->
        <div class="bg-secondary/50 rounded-lg p-4 space-y-3">
          <div class="space-y-2">
            <p class="text-sm font-medium">選擇對話歷史路徑</p>

            <!-- Path Selector Dropdown -->
            <select
              :value="store.currentHistoryPathIndex"
              @change="(e) => handleSelectPath(parseInt((e.target as HTMLSelectElement).value))"
              class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option
                v-for="(path, index) in store.historyPaths"
                :key="index"
                :value="index"
              >
                {{ path.split('/').pop() || path }} ({{ path }})
              </option>
            </select>
          </div>

          <!-- Path List with Delete Buttons -->
          <div v-if="store.historyPaths.length > 0" class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">已配置的路徑 ({{ store.historyPaths.length }})</p>
            <div class="space-y-1 max-h-32 overflow-y-auto">
              <div
                v-for="(path, index) in store.historyPaths"
                :key="index"
                class="flex items-center justify-between gap-2 px-2 py-1.5 text-xs bg-background rounded border"
                :class="index === store.currentHistoryPathIndex ? 'border-primary bg-primary/5' : 'border-border'"
              >
                <span class="truncate flex-1 font-mono">{{ path }}</span>
                <button
                  v-if="store.historyPaths.length > 1"
                  @click="handleRemovePath(index)"
                  class="flex-shrink-0 px-2 py-0.5 text-xs rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <!-- Add New Path -->
          <div class="border-t border-border pt-3">
            <button
              @click="showAddPathInput = !showAddPathInput"
              class="w-full text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              + 添加新路徑
            </button>

            <div v-if="showAddPathInput" class="mt-2 space-y-2">
              <input
                v-model="newPathInput"
                type="text"
                placeholder="輸入完整路徑，例如：/home/user/.claude/history.jsonl"
                class="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                @click="handleAddPath"
                :disabled="addingPath || !newPathInput.trim()"
                class="w-full px-3 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
              >
                <Loader v-if="addingPath" class="w-3 h-3 animate-spin" />
                <span>{{ addingPath ? '添加中...' : '確認添加' }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="bg-secondary/50 rounded-lg p-4 text-sm space-y-2">
          <div class="flex items-start gap-2">
            <div class="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-primary">1</span>
            </div>
            <div>
              <p class="font-medium">選擇對話歷史路徑</p>
              <p class="text-xs text-muted-foreground">從下拉菜單選擇要讀取的 Claude Code 歷史文件位置</p>
            </div>
          </div>

          <div class="flex items-start gap-2">
            <div class="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-primary">2</span>
            </div>
            <div>
              <p class="font-medium">讀取對話歷史</p>
              <p class="text-xs text-muted-foreground">從選定的路徑讀取最近 100 筆記錄</p>
            </div>
          </div>

          <div class="flex items-start gap-2">
            <div class="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-primary">3</span>
            </div>
            <div>
              <p class="font-medium">關聯執行記錄</p>
              <p class="text-xs text-muted-foreground">根據時間戳將歷史與執行日誌進行匹配</p>
            </div>
          </div>

          <div class="flex items-start gap-2">
            <div class="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-primary">4</span>
            </div>
            <div>
              <p class="font-medium">儲存到資料庫</p>
              <p class="text-xs text-muted-foreground">將合併的對話保存為未分類狀態</p>
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-4 border-t border-border">
          <button
            @click="showImportModal = false"
            :disabled="isImporting"
            class="flex-1 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            取消
          </button>
          <button
            @click="performImport"
            :disabled="isImporting"
            class="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
          >
            <Loader v-if="isImporting" class="w-4 h-4 animate-spin" />
            <span>{{ isImporting ? '匯入中...' : '開始匯入' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <Transition
      enter-active-class="transition ease-out duration-300"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div
        v-if="showToast"
        class="fixed bottom-4 right-4 z-[100] max-w-md"
      >
        <div
          :class="[
            'rounded-lg shadow-lg p-4 flex items-start gap-3',
            {
              'bg-green-50 border border-green-200': toastType === 'success',
              'bg-red-50 border border-red-200': toastType === 'error',
              'bg-orange-50 border border-orange-200': toastType === 'warning',
              'bg-blue-50 border border-blue-200': toastType === 'info'
            }
          ]"
        >
          <!-- Icon -->
          <div class="flex-shrink-0 mt-0.5">
            <svg
              v-if="toastType === 'success'"
              class="w-5 h-5 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <svg
              v-else-if="toastType === 'error'"
              class="w-5 h-5 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <svg
              v-else-if="toastType === 'warning'"
              class="w-5 h-5 text-orange-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <svg
              v-else
              class="w-5 h-5 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <!-- Message -->
          <div class="flex-1">
            <p
              :class="[
                'text-sm font-medium',
                {
                  'text-green-800': toastType === 'success',
                  'text-red-800': toastType === 'error',
                  'text-orange-800': toastType === 'warning',
                  'text-blue-800': toastType === 'info'
                }
              ]"
            >
              {{ toastMessage }}
            </p>
          </div>

          <!-- Close button -->
          <button
            @click="dismissToast"
            :class="[
              'flex-shrink-0 rounded-md p-1 inline-flex hover:bg-black/5 transition-colors',
              {
                'text-green-600': toastType === 'success',
                'text-red-600': toastType === 'error',
                'text-orange-600': toastType === 'warning',
                'text-blue-600': toastType === 'info'
              }
            ]"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
:deep(.animate-fade-in) {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
