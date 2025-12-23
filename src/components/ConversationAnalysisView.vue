<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, Clock } from 'lucide-vue-next'
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
}>()

// 按時間排序（正序）
const sortedConversations = computed(() => {
  return [...props.conversations].sort((a, b) =>
    new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
  )
})

// 按 session 分組
const conversationsBySession = computed(() => {
  const groups = new Map<string, Conversation[]>()
  sortedConversations.value.forEach(conv => {
    const sid = conv.sessionId || 'unknown'
    if (!groups.has(sid)) groups.set(sid, [])
    groups.get(sid)!.push(conv)
  })

  return Array.from(groups.entries()).map(([sessionId, convs]) => ({
    sessionId,
    conversations: convs,
    startTime: convs[0].executedAt,
    totalTokens: convs.reduce((sum, c) => sum + c.totalTokens, 0),
    totalCost: convs.reduce((sum, c) => sum + c.costUsd, 0),
    totalDuration: convs.reduce((sum, c) => sum + (c.durationMs || 0), 0)
  }))
})
</script>

<template>
  <div class="space-y-8">
    <!-- Empty State -->
    <div
      v-if="conversationsBySession.length === 0"
      class="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground"
    >
      <Clock class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p class="text-lg font-medium">尚無對話記錄</p>
      <p class="text-sm">點擊「分類並儲存」匯入對話歷史</p>
    </div>

    <!-- Session Groups -->
    <div v-for="(session, sessionIdx) in conversationsBySession" :key="session.sessionId" class="space-y-4">
      <!-- Session Header -->
      <div class="bg-card border border-border rounded-lg p-4">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 class="font-semibold text-foreground">
              Session {{ sessionIdx + 1 }}
            </h3>
            <p class="text-sm text-muted-foreground">
              {{ session.conversations.length }} 次互動 · 開始於 {{ formatDateTime(session.startTime) }}
            </p>
          </div>
          <div class="flex items-center gap-6 text-sm">
            <div class="text-right">
              <p class="text-muted-foreground">總計 Tokens</p>
              <p class="font-medium text-foreground">{{ formatTokens(session.totalTokens) }}</p>
            </div>
            <div class="text-right">
              <p class="text-muted-foreground">成本</p>
              <p class="font-medium text-foreground">{{ formatCost(session.totalCost) }}</p>
            </div>
            <div v-if="session.totalDuration > 0" class="text-right">
              <p class="text-muted-foreground">耗時</p>
              <p class="font-medium text-foreground">{{ session.totalDuration }}ms</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Timeline -->
      <div class="space-y-6 relative pl-8">
        <!-- Timeline Line -->
        <div class="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 to-transparent" />

        <!-- Timeline Items -->
        <div
          v-for="(conv, itemIdx) in session.conversations"
          :key="conv.id || `${sessionIdx}-${itemIdx}`"
          class="space-y-4"
        >
          <!-- Timeline Dot for User -->
          <div class="absolute left-0 top-6 w-2 h-2 bg-blue-500 rounded-full -translate-x-1.5" />

          <!-- User Prompt -->
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-xs font-medium text-blue-500">
              <span>Q{{ itemIdx + 1 }}</span>
              <span class="text-muted-foreground">{{ formatDateTime(conv.executedAt) }}</span>
            </div>
            <div class="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <MarkdownRenderer :content="conv.userPrompt" />
            </div>
          </div>

          <!-- Arrow -->
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowRight class="w-3 h-3" />
            <span>回應</span>
          </div>

          <!-- Assistant Response -->
          <div v-if="conv.assistantResponse" class="space-y-2">
            <!-- Timeline Dot for Assistant -->
            <div class="absolute left-0 top-40 w-2 h-2 bg-emerald-500 rounded-full -translate-x-1.5" />

            <div class="flex items-center gap-2 text-xs font-medium text-emerald-500">
              <span>A{{ itemIdx + 1 }}</span>
              <span class="text-muted-foreground">{{ formatTokens(conv.totalTokens) }} · {{ formatCost(conv.costUsd) }}</span>
              <span v-if="conv.durationMs" class="text-muted-foreground">{{ conv.durationMs }}ms</span>
            </div>
            <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
              <MarkdownRenderer :content="conv.assistantResponse" />
            </div>
          </div>

          <!-- Metadata -->
          <div v-if="conv.category || conv.projectPath" class="flex items-center gap-3 text-xs text-muted-foreground flex-wrap pt-2">
            <span v-if="conv.category && conv.category !== 'uncategorized'" class="px-2 py-1 rounded bg-secondary">
              {{ conv.category }}
            </span>
            <span v-if="conv.projectPath" class="font-mono">
              {{ conv.projectPath.split('/').pop() }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.markdown-body {
  font-size: 14px;
}
</style>
