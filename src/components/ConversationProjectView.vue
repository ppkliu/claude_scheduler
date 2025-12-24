<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronUp, Clock, Folder } from 'lucide-vue-next'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { formatDateTime, formatCost, formatTokens } from '@/lib/utils'

interface Conversation {
  id?: number | string
  sessionId?: string
  userPrompt: string
  assistantResponse?: string | null
  executedAt: string
  totalTokens: number
  costUsd: number
  durationMs?: number
  category?: string
  projectPath?: string
}

const props = defineProps<{
  conversations: Conversation[]
  expandedProjects: Set<string>
}>()

const emit = defineEmits<{
  'toggle-expand': [projectPath: string]
}>()

// 按時間排序（正序）
const sortedConversations = computed(() => {
  return [...props.conversations].sort((a, b) =>
    new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
  )
})

// 按 project 分組
const conversationsByProject = computed(() => {
  const groups = new Map<string, Conversation[]>()
  sortedConversations.value.forEach(conv => {
    const path = conv.projectPath || 'unknown'
    if (!groups.has(path)) groups.set(path, [])
    groups.get(path)!.push(conv)
  })

  return Array.from(groups.entries()).map(([projectPath, convs]) => ({
    projectPath,
    displayName: projectPath === 'unknown' ? '未分類' : projectPath.split('/').pop() || projectPath,
    conversations: convs,
    totalTokens: convs.reduce((sum, c) => sum + c.totalTokens, 0),
    totalCost: convs.reduce((sum, c) => sum + c.costUsd, 0),
    count: convs.length,
    startTime: convs[0].executedAt,
    endTime: convs[convs.length - 1].executedAt
  }))
})

function toggleProject(projectPath: string) {
  emit('toggle-expand', projectPath)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Empty State -->
    <div
      v-if="conversationsByProject.length === 0"
      class="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground"
    >
      <Clock class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">尚無對話記錄</p>
      <p class="text-sm">點擊「分類並儲存」匯入對話歷史</p>
    </div>

    <!-- Project Groups -->
    <div
      v-for="(project, projectIdx) in conversationsByProject"
      :key="project.projectPath"
      class="space-y-4"
    >
      <!-- Project Header Card -->
      <div
        class="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
        @click="toggleProject(project.projectPath)"
      >
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <Folder class="w-5 h-5 text-primary flex-shrink-0" />
            <div class="min-w-0">
              <h3 class="font-semibold text-foreground truncate">
                {{ project.displayName }}
              </h3>
              <p class="text-sm text-muted-foreground truncate">
                {{ project.projectPath }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-6 text-sm flex-wrap justify-end">
            <div class="text-right">
              <p class="text-xs text-muted-foreground">對話</p>
              <p class="font-medium text-foreground">{{ project.count }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-muted-foreground">總計 Tokens</p>
              <p class="font-medium text-foreground">{{ formatTokens(project.totalTokens) }}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-muted-foreground">成本</p>
              <p class="font-medium text-foreground">{{ formatCost(project.totalCost) }}</p>
            </div>

            <!-- Expand/Collapse Button -->
            <button
              class="flex-shrink-0 p-1 hover:bg-secondary rounded transition-colors"
              @click.stop="toggleProject(project.projectPath)"
            >
              <ChevronDown
                v-if="expandedProjects.has(project.projectPath)"
                class="w-5 h-5 text-muted-foreground"
              />
              <ChevronUp v-else class="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      <!-- Conversations List (Expandable) -->
      <div
        v-if="expandedProjects.has(project.projectPath)"
        class="space-y-3 pl-4 border-l-2 border-primary/30"
      >
        <div
          v-for="(conv, convIdx) in project.conversations"
          :key="conv.id || `${projectIdx}-${convIdx}`"
          class="bg-card border border-border rounded-lg p-4 space-y-3"
        >
          <!-- Conversation Header -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="text-xs font-medium text-muted-foreground">
              {{ formatDateTime(conv.executedAt) }}
            </div>
            <div v-if="conv.category || conv.durationMs" class="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span v-if="conv.category && conv.category !== 'uncategorized'" class="px-2 py-1 rounded bg-secondary">
                {{ conv.category }}
              </span>
              <span v-if="conv.durationMs" class="text-muted-foreground">{{ conv.durationMs }}ms</span>
            </div>
          </div>

          <!-- User Prompt -->
          <div class="space-y-2">
            <div class="text-xs font-medium text-blue-600 dark:text-blue-400">
              👤 User
            </div>
            <div class="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded p-3 text-sm">
              <MarkdownRenderer :content="conv.userPrompt" />
            </div>
          </div>

          <!-- Assistant Response -->
          <div v-if="conv.assistantResponse" class="space-y-2">
            <div class="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              🤖 LLM Response · {{ formatTokens(conv.totalTokens) }} · {{ formatCost(conv.costUsd) }}
            </div>
            <div class="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded p-3 text-sm">
              <MarkdownRenderer :content="conv.assistantResponse" />
            </div>
          </div>

          <!-- No Response Indicator -->
          <div v-else class="text-xs text-muted-foreground italic">
            (無回應)
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Smooth transition for expand/collapse */
.space-y-3 {
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
