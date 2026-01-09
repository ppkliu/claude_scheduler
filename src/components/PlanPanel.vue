<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSchedulerStore } from '@/stores/scheduler'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { Search, Calendar, FileText, ChevronDown, ChevronUp, Trash2 } from 'lucide-vue-next'

const { t } = useI18n()
const store = useSchedulerStore()

const searchQuery = ref('')
const dateRange = ref({ start: '', end: '' })
const sortBy = ref<'date' | 'name' | 'size'>('date')
const expandedPlans = ref<Set<string>>(new Set())

// Computed filtered plans
const filteredPlans = computed(() => {
  return store.plans
})

// Toggle expand/collapse
function toggleExpand(filename: string) {
  if (expandedPlans.value.has(filename)) {
    expandedPlans.value.delete(filename)
  } else {
    expandedPlans.value.add(filename)
  }
}

// Search handler
function handleSearch() {
  store.fetchPlans({
    search: searchQuery.value,
    startDate: dateRange.value.start,
    endDate: dateRange.value.end,
    sortBy: sortBy.value
  })
}

// Delete handler
async function handleDelete(filename: string) {
  if (confirm(t('plans.confirmDelete', { filename }))) {
    await store.deletePlan(filename)
  }
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Parse phases from content
function parsePhases(content: string): string[] {
  const phases: string[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.match(/^##\s+Phase\s+\d+/i) || line.match(/^###\s+Phase\s+\d+/i)) {
      phases.push(line.replace(/^#+\s*/, ''))
    }
  }
  return phases
}

onMounted(() => {
  store.fetchPlans()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Search & Filter Bar -->
    <div class="bg-card border border-border rounded-xl p-6">
      <div class="grid gap-4 md:grid-cols-4">
        <!-- Search Input -->
        <div class="md:col-span-2">
          <label class="block text-sm font-medium mb-2">{{ t('plans.search') }}</label>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              v-model="searchQuery"
              @keyup.enter="handleSearch"
              type="text"
              :placeholder="t('plans.searchPlaceholder')"
              class="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <!-- Date Range -->
        <div>
          <label class="block text-sm font-medium mb-2">{{ t('plans.dateRange') }}</label>
          <div class="flex gap-2">
            <input
              v-model="dateRange.start"
              type="date"
              class="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              v-model="dateRange.end"
              type="date"
              class="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <!-- Sort By -->
        <div>
          <label class="block text-sm font-medium mb-2">{{ t('plans.sortBy') }}</label>
          <select
            v-model="sortBy"
            @change="handleSearch"
            class="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="date">{{ t('plans.sortByDate') }}</option>
            <option value="name">{{ t('plans.sortByName') }}</option>
            <option value="size">{{ t('plans.sortBySize') }}</option>
          </select>
        </div>
      </div>

      <button
        @click="handleSearch"
        class="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
      >
        {{ t('plans.applyFilters') }}
      </button>
    </div>

    <!-- Plans List -->
    <div v-if="store.plansLoading" class="text-center py-12">
      <p class="text-muted-foreground">{{ t('plans.loading') }}</p>
    </div>

    <div v-else-if="filteredPlans.length === 0" class="text-center py-12">
      <FileText class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
      <p class="text-muted-foreground">{{ t('plans.noPlans') }}</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="plan in filteredPlans"
        :key="plan.filename"
        class="bg-card border border-border rounded-xl overflow-hidden"
      >
        <!-- Plan Header (Collapsible) -->
        <button
          @click="toggleExpand(plan.filename)"
          class="w-full p-6 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
        >
          <div class="flex items-start gap-4 flex-1">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText class="w-5 h-5 text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-lg truncate">{{ plan.filename }}</h3>
              <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                <span class="flex items-center gap-1">
                  <Calendar class="w-3.5 h-3.5" />
                  {{ new Date(plan.date).toLocaleDateString() }}
                </span>
                <span>{{ formatSize(plan.size) }}</span>
                <span v-if="plan.frontmatter.status" class="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs">
                  {{ plan.frontmatter.status }}
                </span>
              </div>
              <p v-if="plan.frontmatter.goal" class="mt-2 text-sm text-muted-foreground line-clamp-2">
                {{ plan.frontmatter.goal }}
              </p>
            </div>
          </div>
          <component
            :is="expandedPlans.has(plan.filename) ? ChevronUp : ChevronDown"
            class="w-5 h-5 text-muted-foreground flex-shrink-0 ml-4"
          />
        </button>

        <!-- Plan Content (Expanded) -->
        <div v-if="expandedPlans.has(plan.filename)" class="border-t border-border p-6 bg-muted/20">
          <!-- Phases Summary -->
          <div v-if="parsePhases(plan.content).length > 0" class="mb-6">
            <h4 class="text-sm font-semibold mb-3">{{ t('plans.phases') }}</h4>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(phase, idx) in parsePhases(plan.content)"
                :key="idx"
                class="px-3 py-1.5 bg-card border border-border rounded-lg text-sm"
              >
                {{ phase }}
              </span>
            </div>
          </div>

          <!-- Full Markdown Content -->
          <div class="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownRenderer :content="plan.content" />
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 mt-6 pt-6 border-t border-border">
            <button
              @click="handleDelete(plan.filename)"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
            >
              <Trash2 class="w-4 h-4" />
              {{ t('plans.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
