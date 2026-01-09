<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { CheckCircle2, XCircle, Info } from 'lucide-vue-next'

const { toasts } = useToast()
</script>

<template>
  <div class="fixed top-4 right-4 z-[100] space-y-2">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="[
        'min-w-[300px] px-4 py-3 rounded-lg shadow-lg border flex items-center gap-3 animate-fade-in',
        toast.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300' :
        toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300' :
        'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300'
      ]"
    >
      <component
        :is="toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? XCircle : Info"
        class="w-5 h-5 flex-shrink-0"
      />
      <p class="text-sm font-medium">{{ toast.message }}</p>
    </div>
  </div>
</template>
