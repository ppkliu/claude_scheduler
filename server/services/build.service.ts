/**
 * Build Service
 * Manages building TypeScript/Vue project using Vite
 */

import Database from 'better-sqlite3'
import { websocketService } from './websocket.service'
import { executeNpx } from '../utils/process-executor'
import type { BuildOptions, BuildRecord, BuildResult } from '../types/deployment.types'

export class BuildService {
  private db: Database.Database
  private buildQueue: Array<{ buildId: number; options: BuildOptions }> = []
  private isBuildingNow = false
  private buildTimeout = 300000 // 5 minutes

  constructor(database: Database.Database) {
    this.db = database
    this.buildTimeout = parseInt(process.env.BUILD_TIMEOUT_MS || '300000')
  }

  /**
   * Execute a build with the given options
   */
  async executeBuild(options: BuildOptions): Promise<BuildResult | null> {
    try {
      // Create build record
      const buildId = this.createBuildRecord(options)

      // Add to queue
      this.buildQueue.push({ buildId, options })
      console.log(`[Build] Added build ${buildId} to queue. Queue size: ${this.buildQueue.length}`)

      // Process queue
      return await this.processQueue()
    } catch (error) {
      console.error('[Build] Error executing build:', error)
      return null
    }
  }

  /**
   * Process the build queue
   */
  private async processQueue(): Promise<BuildResult | null> {
    if (this.isBuildingNow || this.buildQueue.length === 0) {
      return null
    }

    this.isBuildingNow = true
    const task = this.buildQueue.shift()

    if (!task) {
      this.isBuildingNow = false
      return null
    }

    try {
      console.log(`[Build] Processing build ${task.buildId}...`)
      this.updateBuildStatus(task.buildId, 'building')
      websocketService.broadcastEvent('build:started', { buildId: task.buildId })

      // Run build command
      const result = await this.runBuildCommand(task.buildId, task.options)

      if (result) {
        // Save result to database
        this.completeBuildRecord(task.buildId, result)

        // Broadcast completion
        websocketService.broadcastBuildComplete(
          task.buildId,
          result.success,
          result.duration,
          result.exitCode
        )

        console.log(`[Build] Build ${task.buildId} completed with status: ${result.success ? 'SUCCESS' : 'FAILED'}`)
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[Build] Error in build ${task.buildId}:`, errorMsg)

      this.updateBuildStatus(task.buildId, 'failed', errorMsg)
      websocketService.broadcastBuildError(task.buildId, errorMsg)

      return null
    } finally {
      this.isBuildingNow = false

      // Process next build in queue
      if (this.buildQueue.length > 0) {
        // Queue next build processing
        setImmediate(() => this.processQueue())
      }
    }
  }

  /**
   * Run the actual build command using npx vite build
   */
  private async runBuildCommand(buildId: number, options: BuildOptions): Promise<BuildResult> {
    const startTime = Date.now()
    let output = ''
    let exitCode = 0

    return new Promise((resolve) => {
      // Use npx to ensure local package version
      executeNpx(['vite', 'build'], (chunk, isError) => {
        output += chunk

        // Broadcast log update
        websocketService.broadcastBuildLog(buildId, chunk)

        // Log to console
        if (isError) {
          console.error(`[Build ${buildId}]`, chunk)
        } else {
          console.log(`[Build ${buildId}]`, chunk)
        }
      }, {
        timeout: this.buildTimeout,
        env: {
          ...process.env,
          NODE_ENV: options.environment || 'production'
        }
      })
        .then((result) => {
          const duration = Date.now() - startTime
          exitCode = result.exitCode

          resolve({
            success: result.success,
            exitCode: result.exitCode,
            output: result.output,
            duration
          })
        })
        .catch((error) => {
          const duration = Date.now() - startTime
          const errorMsg = error instanceof Error ? error.message : String(error)

          console.error(`[Build ${buildId}] Build failed:`, errorMsg)

          resolve({
            success: false,
            exitCode: 1,
            output: output + '\n' + errorMsg,
            duration
          })
        })
    })
  }

  /**
   * Create a new build record in the database
   */
  private createBuildRecord(options: BuildOptions): number {
    const stmt = this.db.prepare(`
      INSERT INTO build_history (
        trigger_type, trigger_source, status, environment, build_output
      ) VALUES (?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      options.triggerType,
      options.triggerSource,
      'pending',
      options.environment || 'development',
      ''
    )

    return result.lastInsertRowid as number
  }

  /**
   * Update build status
   */
  private updateBuildStatus(
    buildId: number,
    status: 'pending' | 'building' | 'success' | 'failed',
    errorMessage?: string
  ): void {
    let sql = 'UPDATE build_history SET status = ? WHERE id = ?'
    const params: any[] = [status, buildId]

    if (errorMessage) {
      sql = 'UPDATE build_history SET status = ?, error_message = ? WHERE id = ?'
      params.unshift(errorMessage)
    }

    const stmt = this.db.prepare(sql)
    stmt.run(...params)
  }

  /**
   * Complete a build record with result data
   */
  private completeBuildRecord(buildId: number, result: BuildResult): void {
    const stmt = this.db.prepare(`
      UPDATE build_history SET
        status = ?,
        build_output = ?,
        exit_code = ?,
        duration_ms = ?,
        completed_at = ?
      WHERE id = ?
    `)

    stmt.run(
      result.success ? 'success' : 'failed',
      result.output,
      result.exitCode,
      result.duration,
      new Date().toISOString(),
      buildId
    )
  }

  /**
   * Get build history with pagination
   */
  getBuildHistory(limit: number = 20, offset: number = 0): BuildRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM build_history
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `)

    return stmt.all(limit, offset) as BuildRecord[]
  }

  /**
   * Get a specific build by ID
   */
  getBuildById(id: number): BuildRecord | null {
    const stmt = this.db.prepare('SELECT * FROM build_history WHERE id = ?')
    return (stmt.get(id) as BuildRecord) || null
  }

  /**
   * Cancel a pending/building build
   */
  cancelBuild(id: number): boolean {
    const build = this.getBuildById(id)

    if (!build) {
      console.warn(`[Build] Build ${id} not found`)
      return false
    }

    if (build.status === 'completed' || build.status === 'success' || build.status === 'failed') {
      console.warn(`[Build] Cannot cancel completed build ${id}`)
      return false
    }

    // Mark as failed
    this.updateBuildStatus(id, 'failed', 'Cancelled by user')
    console.log(`[Build] Build ${id} cancelled`)

    return true
  }

  /**
   * Get build statistics
   */
  getBuildStats(): {
    totalBuilds: number
    successfulBuilds: number
    failedBuilds: number
    averageBuildTime: number
    lastBuildTime?: number
  } {
    const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM build_history').get() as any
    const successResult = this.db.prepare(
      "SELECT COUNT(*) as count FROM build_history WHERE status = 'success'"
    ).get() as any
    const failResult = this.db.prepare(
      "SELECT COUNT(*) as count FROM build_history WHERE status = 'failed'"
    ).get() as any
    const avgResult = this.db.prepare(
      'SELECT AVG(duration_ms) as avg FROM build_history WHERE duration_ms IS NOT NULL'
    ).get() as any
    const lastBuildResult = this.db.prepare(
      'SELECT duration_ms FROM build_history WHERE duration_ms IS NOT NULL ORDER BY started_at DESC LIMIT 1'
    ).get() as any

    return {
      totalBuilds: totalResult.count,
      successfulBuilds: successResult.count,
      failedBuilds: failResult.count,
      averageBuildTime: Math.round(avgResult.avg || 0),
      lastBuildTime: lastBuildResult?.duration_ms
    }
  }

  /**
   * Clean up old build history
   */
  cleanupOldBuilds(daysToKeep: number = 7): number {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const stmt = this.db.prepare('DELETE FROM build_history WHERE started_at < ?')
    const result = stmt.run(cutoffDate.toISOString())

    console.log(`[Build] Cleaned up ${result.changes} old build records`)
    return result.changes
  }

  /**
   * Check if a build is currently in progress
   */
  checkIfBuilding(): boolean {
    return this.isBuildingNow
  }

  /**
   * Get the size of the build queue
   */
  getQueueSize(): number {
    return this.buildQueue.length
  }
}

// Export singleton instance factory
let buildServiceInstance: BuildService | null = null

export function initializeBuildService(db: Database.Database): BuildService {
  if (!buildServiceInstance) {
    buildServiceInstance = new BuildService(db)
  }
  return buildServiceInstance
}

export function getBuildService(): BuildService {
  if (!buildServiceInstance) {
    throw new Error('Build service not initialized')
  }
  return buildServiceInstance
}
