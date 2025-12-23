import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(hour: number, minute = 0): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatRelativeTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'

  const now = new Date()
  const diff = date.getTime() - now.getTime()

  if (diff < 0) {
    const absDiff = Math.abs(diff)
    if (absDiff < 60000) return '剛才'
    if (absDiff < 3600000) return `${Math.floor(absDiff / 60000)} 分鐘前`
    if (absDiff < 86400000) return `${Math.floor(absDiff / 3600000)} 小時前`
    return `${Math.floor(absDiff / 86400000)} 天前`
  } else {
    if (diff < 60000) return '即將'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘後`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時後`
    return `${Math.floor(diff / 86400000)} 天後`
  }
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString()
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1000000).toFixed(2)}M`
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  if (usd < 1) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}
