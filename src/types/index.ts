export interface ScheduleConfig {
  id: number
  name: string
  cronExpression: string
  hour: number
  minute: number
  enabled: boolean
  prompt: string
  createdAt: string
  updatedAt: string
}

export interface ExecutionLog {
  id: number
  scheduleId: number
  scheduleName: string
  executedAt: string
  status: 'success' | 'failed' | 'pending'
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  durationMs: number
  response: string
  error?: string
}

export interface TokenUsage {
  date: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCostUsd: number
  executionCount: number
}

export interface SchedulerStatus {
  isRunning: boolean
  activeSchedules: number
  nextExecution?: {
    scheduleId: number
    scheduleName: string
    time: string
  }
  lastExecution?: ExecutionLog
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface Conversation {
  id: number
  executionLogId?: number
  sessionId?: string
  projectPath?: string
  userPrompt: string
  assistantResponse?: string
  category: string
  tags: string[]
  source: 'scheduled' | 'quick_chat' | 'manual'
  executedAt: string
  categorizedAt?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  durationMs: number
  createdAt: string
}

export interface ConversationGroup {
  date: string
  label: string
  conversations: Conversation[]
  count: number
}

export interface HistoryEntry {
  display: string
  pastedContents: Record<string, unknown>
  timestamp: number
  project?: string
  sessionId?: string
}

export interface MergedConversation {
  historyEntry: HistoryEntry | null
  executionLog: ExecutionLog | null
  matchType: 'exact' | 'fuzzy' | 'none'
  timeDiff: number
}
