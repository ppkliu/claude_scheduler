/**
 * Git Tracker Service
 * Monitors git status and commits
 */

import Database from 'better-sqlite3'
import { executeGit } from '../utils/process-executor'
import type { GitStatus } from '../types/deployment.types'

export class GitTrackerService {
  private db: Database.Database
  private interval: NodeJS.Timeout | null = null
  private intervalMs = 60000

  constructor(database: Database.Database) {
    this.db = database
    this.intervalMs = parseInt(process.env.GIT_TRACKING_INTERVAL_MS || '60000')
  }

  /**
   * Start periodic git status tracking
   */
  start(): void {
    if (this.interval) {
      return
    }

    console.log(`[GitTracker] Starting git status tracking (interval: ${this.intervalMs}ms)`)
    this.captureGitStatus()

    this.interval = setInterval(() => {
      this.captureGitStatus()
    }, this.intervalMs)
  }

  /**
   * Capture current git status
   */
  async captureGitStatus(): Promise<GitStatus | null> {
    try {
      const [branch, commit, status, remote] = await Promise.all([
        this.getCurrentBranch(),
        this.getLatestCommit(),
        this.getUncommittedChanges(),
        this.getRemoteStatus()
      ])

      const gitStatus: GitStatus = {
        timestamp: new Date().toISOString(),
        branch: branch || 'unknown',
        latest_commit_hash: commit.hash || '',
        latest_commit_message: commit.message || '',
        latest_commit_author: commit.author || '',
        latest_commit_date: commit.date || '',
        uncommitted_changes_count: status.count,
        uncommitted_files: JSON.stringify(status.files),
        remote_status: remote.status,
        commits_ahead: remote.ahead,
        commits_behind: remote.behind
      }

      this.saveGitStatus(gitStatus)
      return gitStatus
    } catch (error) {
      console.error('[GitTracker] Error capturing git status:', error)
      return null
    }
  }

  /**
   * Get current branch name
   */
  private async getCurrentBranch(): Promise<string> {
    try {
      const result = executeGit(['rev-parse', '--abbrev-ref', 'HEAD'])
      return result.stdout.trim()
    } catch {
      return 'unknown'
    }
  }

  /**
   * Get latest commit info
   */
  private async getLatestCommit(): Promise<{ hash: string; message: string; author: string; date: string }> {
    try {
      const result = executeGit(['log', '-1', '--format=%H|%s|%an|%aI'])
      const [hash, message, author, date] = result.stdout.trim().split('|')
      return { hash, message, author, date }
    } catch {
      return { hash: '', message: '', author: '', date: '' }
    }
  }

  /**
   * Get uncommitted changes
   */
  private async getUncommittedChanges(): Promise<{ count: number; files: string[] }> {
    try {
      const result = executeGit(['status', '--porcelain'])
      const files = result.stdout.trim().split('\n').filter(Boolean)
      return { count: files.length, files }
    } catch {
      return { count: 0, files: [] }
    }
  }

  /**
   * Get remote status
   */
  private async getRemoteStatus(): Promise<{ status: 'up-to-date' | 'ahead' | 'behind' | 'diverged' | 'unknown'; ahead: number; behind: number }> {
    try {
      executeGit(['fetch', '--dry-run'])
      const result = executeGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}'])
      const [ahead, behind] = result.stdout.trim().split('\t').map(Number)

      let status: 'up-to-date' | 'ahead' | 'behind' | 'diverged' | 'unknown' = 'up-to-date'
      if (ahead > 0 && behind > 0) status = 'diverged'
      else if (ahead > 0) status = 'ahead'
      else if (behind > 0) status = 'behind'

      return { status, ahead: ahead || 0, behind: behind || 0 }
    } catch {
      return { status: 'unknown', ahead: 0, behind: 0 }
    }
  }

  /**
   * Save git status to database
   */
  private saveGitStatus(status: GitStatus): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO git_status_snapshots (
          timestamp, branch, latest_commit_hash, latest_commit_message,
          latest_commit_author, latest_commit_date, uncommitted_changes_count,
          uncommitted_files, remote_status, commits_ahead, commits_behind
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        status.timestamp,
        status.branch,
        status.latest_commit_hash,
        status.latest_commit_message,
        status.latest_commit_author,
        status.latest_commit_date,
        status.uncommitted_changes_count,
        status.uncommitted_files,
        status.remote_status,
        status.commits_ahead,
        status.commits_behind
      )

      // Keep only last 100 snapshots
      this.db.prepare('DELETE FROM git_status_snapshots WHERE id NOT IN (SELECT id FROM git_status_snapshots ORDER BY timestamp DESC LIMIT 100)').run()
    } catch (error) {
      console.error('[GitTracker] Error saving git status:', error)
    }
  }

  /**
   * Get git status history
   */
  getStatusHistory(limit: number = 50): GitStatus[] {
    const stmt = this.db.prepare(`
      SELECT * FROM git_status_snapshots
      ORDER BY timestamp DESC
      LIMIT ?
    `)

    return (stmt.all(limit) as GitStatus[]) || []
  }

  /**
   * Stop tracking
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
      console.log('[GitTracker] Stopped git status tracking')
    }
  }
}

let gitTrackerInstance: GitTrackerService | null = null

export function initializeGitTracker(db: Database.Database): GitTrackerService {
  if (!gitTrackerInstance) {
    gitTrackerInstance = new GitTrackerService(db)
  }
  return gitTrackerInstance
}

export function getGitTracker(): GitTrackerService {
  if (!gitTrackerInstance) {
    throw new Error('GitTracker not initialized')
  }
  return gitTrackerInstance
}
