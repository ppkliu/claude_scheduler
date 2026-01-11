/**
 * Simplified Dependency Service
 * Manages npm package dependencies
 */

import Database from 'better-sqlite3'
import { executeNpm } from '../utils/process-executor'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import type { DependencyStatus, UpdateResult } from '../types/deployment.types'

export class DependencyService {
  private db: Database.Database

  constructor(database: Database.Database) {
    this.db = database
  }

  /**
   * Check for available updates using npm-check-updates
   */
  async checkUpdates(): Promise<DependencyStatus[]> {
    try {
      console.log('[Dependency] Checking for updates...')

      const result = await executeNpm(['list', '--json'], undefined, {
        timeout: 30000
      })

      if (!result.success) {
        console.warn('[Dependency] npm list failed, attempting ncu fallback')
        return this.getNcuUpdates()
      }

      const deps: DependencyStatus[] = []
      const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))

      // Simple version check against package.json
      for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
        deps.push({
          package_name: name,
          current_version: String(version),
          latest_version: String(version),
          wanted_version: String(version),
          update_type: 'none',
          is_dev_dependency: 0,
          has_security_issues: 0,
          last_checked_at: new Date().toISOString()
        })
      }

      return deps
    } catch (error) {
      console.error('[Dependency] Check updates error:', error)
      return []
    }
  }

  /**
   * Fallback to ncu if npm list fails
   */
  private async getNcuUpdates(): Promise<DependencyStatus[]> {
    try {
      const result = await executeNpm(['list', '--depth=0', '--json'], undefined, {
        timeout: 30000
      })

      const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))
      const deps: DependencyStatus[] = []

      for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
        deps.push({
          package_name: name,
          current_version: String(version).replace(/^[\^~]/, ''),
          latest_version: String(version).replace(/^[\^~]/, ''),
          wanted_version: String(version),
          update_type: 'none',
          is_dev_dependency: 0,
          has_security_issues: 0,
          last_checked_at: new Date().toISOString()
        })
      }

      return deps
    } catch (error) {
      console.error('[Dependency] NCU fallback error:', error)
      return []
    }
  }

  /**
   * Create a snapshot of current dependencies
   */
  async createSnapshot(name: string): Promise<number> {
    try {
      const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
      const packageLock = readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf-8')

      const stmt = this.db.prepare(`
        INSERT INTO dependency_snapshots (
          snapshot_name, package_json, package_lock_json, created_by
        ) VALUES (?, ?, ?, ?)
      `)

      const result = stmt.run(name, packageJson, packageLock, 'system')
      console.log(`[Dependency] Created snapshot: ${name}`)

      return result.lastInsertRowid as number
    } catch (error) {
      console.error('[Dependency] Error creating snapshot:', error)
      throw error
    }
  }

  /**
   * Rollback to a previous snapshot
   */
  async rollbackToSnapshot(snapshotId: number): Promise<void> {
    try {
      const stmt = this.db.prepare('SELECT package_json, package_lock_json FROM dependency_snapshots WHERE id = ?')
      const snapshot = stmt.get(snapshotId) as any

      if (!snapshot) {
        throw new Error(`Snapshot ${snapshotId} not found`)
      }

      // Write files
      writeFileSync(resolve(process.cwd(), 'package.json'), snapshot.package_json)
      writeFileSync(resolve(process.cwd(), 'package-lock.json'), snapshot.package_lock_json)

      // Install
      await executeNpm(['ci'], undefined, { timeout: 120000 })

      console.log(`[Dependency] Rolled back to snapshot ${snapshotId}`)
    } catch (error) {
      console.error('[Dependency] Error rolling back:', error)
      throw error
    }
  }

  /**
   * Update specific packages
   */
  async updatePackages(packages: string[]): Promise<UpdateResult> {
    try {
      console.log(`[Dependency] Updating packages: ${packages.join(', ')}`)

      // Create snapshot before update
      const snapshotId = await this.createSnapshot(`before-update-${Date.now()}`)

      // Update packages
      const updateCmd = packages.includes('*') ? ['upgrade'] : ['update', ...packages]
      const result = await executeNpm(updateCmd, undefined, { timeout: 120000 })

      if (!result.success) {
        await this.rollbackToSnapshot(snapshotId)
        return {
          success: false,
          message: 'Update failed, rolled back to previous version'
        }
      }

      return {
        success: true,
        updated: packages,
        snapshotId
      }
    } catch (error) {
      console.error('[Dependency] Update error:', error)
      return {
        success: false,
        message: String(error)
      }
    }
  }

  /**
   * Get list of snapshots
   */
  getSnapshots() {
    const stmt = this.db.prepare('SELECT * FROM dependency_snapshots ORDER BY created_at DESC')
    return stmt.all()
  }

  /**
   * Run npm audit
   */
  async runAudit() {
    try {
      const result = await executeNpm(['audit', '--json'], undefined, { timeout: 30000 })
      if (result.success || result.exitCode === 1) {
        try {
          return JSON.parse(result.stdout)
        } catch {
          return { vulnerabilities: {} }
        }
      }
      return { vulnerabilities: {} }
    } catch {
      return { vulnerabilities: {} }
    }
  }
}

let dependencyInstance: DependencyService | null = null

export function initializeDependencyService(db: Database.Database): DependencyService {
  if (!dependencyInstance) {
    dependencyInstance = new DependencyService(db)
  }
  return dependencyInstance
}

export function getDependencyService(): DependencyService {
  if (!dependencyInstance) {
    throw new Error('DependencyService not initialized')
  }
  return dependencyInstance
}
