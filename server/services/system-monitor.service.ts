/**
 * System Monitor Service
 * Collects system metrics (CPU, memory, disk)
 */

import si from 'systeminformation'
import Database from 'better-sqlite3'
import { websocketService } from './websocket.service'
import type { SystemMetrics } from '../types/deployment.types'

export class SystemMonitorService {
  private db: Database.Database
  private interval: NodeJS.Timeout | null = null
  private intervalMs = 30000 // 30 seconds
  private isCollecting = false

  constructor(database: Database.Database) {
    this.db = database
    this.intervalMs = parseInt(process.env.METRICS_INTERVAL_MS || '30000')
  }

  /**
   * Start collecting metrics
   */
  start(intervalMs?: number): void {
    if (this.interval) {
      console.log('[SystemMonitor] Already collecting metrics')
      return
    }

    if (intervalMs) {
      this.intervalMs = intervalMs
    }

    console.log(`[SystemMonitor] Starting metrics collection (interval: ${this.intervalMs}ms)`)

    // Collect immediately
    this.collectMetrics()

    // Schedule periodic collection
    this.interval = setInterval(() => {
      this.collectMetrics()
    }, this.intervalMs)
  }

  /**
   * Collect system metrics
   */
  async collectMetrics(): Promise<SystemMetrics | null> {
    if (this.isCollecting) {
      return null
    }

    this.isCollecting = true

    try {
      const [cpu, mem, disk, time] = await Promise.all([
        Promise.resolve(si.currentLoad()).catch(() => ({ currentLoad: 0 })) as Promise<any>,
        Promise.resolve(si.mem()).catch(() => ({ total: 0, used: 0, free: 0 })) as Promise<any>,
        Promise.resolve(si.fsSize()).catch(() => [{ size: 0, used: 0 }]) as Promise<any>,
        Promise.resolve(si.time()).catch(() => ({ uptime: 0 })) as Promise<any>
      ])

      const metrics: SystemMetrics = {
        timestamp: new Date().toISOString(),
        cpu_usage_percent: cpu.currentLoad || 0,
        memory_total_mb: Math.round((mem.total || 0) / 1024 / 1024),
        memory_used_mb: Math.round((mem.used || 0) / 1024 / 1024),
        memory_free_mb: Math.round((mem.free || 0) / 1024 / 1024),
        disk_total_gb: Math.round((disk[0]?.size || 0) / 1024 / 1024 / 1024),
        disk_used_gb: Math.round((disk[0]?.used || 0) / 1024 / 1024 / 1024),
        disk_free_gb: Math.round(((disk[0]?.size || 0) - (disk[0]?.used || 0)) / 1024 / 1024 / 1024),
        uptime_seconds: Math.floor(time.uptime || 0)
      }

      // Save to database
      this.saveMetrics(metrics)

      // Broadcast to WebSocket clients
      websocketService.broadcastMetrics(metrics)

      return metrics
    } catch (error) {
      console.error('[SystemMonitor] Error collecting metrics:', error)
      return null
    } finally {
      this.isCollecting = false
    }
  }

  /**
   * Save metrics to database
   */
  private saveMetrics(metrics: SystemMetrics): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO system_metrics (
          timestamp, cpu_usage_percent, memory_total_mb, memory_used_mb, memory_free_mb,
          disk_total_gb, disk_used_gb, disk_free_gb, uptime_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        metrics.timestamp,
        metrics.cpu_usage_percent,
        metrics.memory_total_mb,
        metrics.memory_used_mb,
        metrics.memory_free_mb,
        metrics.disk_total_gb,
        metrics.disk_used_gb,
        metrics.disk_free_gb,
        metrics.uptime_seconds
      )
    } catch (error) {
      console.error('[SystemMonitor] Error saving metrics:', error)
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(hours: number = 24): SystemMetrics[] {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - hours)

    const stmt = this.db.prepare(`
      SELECT * FROM system_metrics
      WHERE timestamp > ?
      ORDER BY timestamp ASC
    `)

    return (stmt.all(cutoff.toISOString()) as SystemMetrics[]) || []
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
      console.log('[SystemMonitor] Stopped metrics collection')
    }
  }

  /**
   * Clean up old metrics
   */
  cleanupOldMetrics(daysToKeep: number = 3): number {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysToKeep)

    const stmt = this.db.prepare('DELETE FROM system_metrics WHERE timestamp < ?')
    const result = stmt.run(cutoff.toISOString())

    console.log(`[SystemMonitor] Cleaned up ${result.changes} old metrics records`)
    return result.changes
  }
}

let systemMonitorInstance: SystemMonitorService | null = null

export function initializeSystemMonitor(db: Database.Database): SystemMonitorService {
  if (!systemMonitorInstance) {
    systemMonitorInstance = new SystemMonitorService(db)
  }
  return systemMonitorInstance
}

export function getSystemMonitor(): SystemMonitorService {
  if (!systemMonitorInstance) {
    throw new Error('SystemMonitor not initialized')
  }
  return systemMonitorInstance
}
