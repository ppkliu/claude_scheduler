/**
 * File Watcher Service
 * Monitors source code changes and triggers rebuilds
 */

import chokidar from 'chokidar'
import { debounce } from '../utils/debounce'
import { getBuildService } from './build.service'
import type { BuildOptions } from '../types/deployment.types'
import type { FSWatcher } from 'chokidar'

export class FileWatcherService {
  private watcher: FSWatcher | null = null
  private isWatching = false
  private changedFiles: Set<string> = new Set()
  private debounceMs = 2000
  private watchPaths: string[] = []
  private enabled = true
  private mode: 'internal' | 'external' = 'internal'

  constructor() {
    this.debounceMs = parseInt(process.env.FILE_WATCH_DEBOUNCE_MS || '2000')
    this.enabled = process.env.FILE_WATCH_ENABLED !== 'false'
    this.mode = (process.env.FILE_WATCH_MODE as 'internal' | 'external') || 'internal'
    this.watchPaths = (process.env.WATCH_PATHS || 'src,server,package.json,vite.config.ts')
      .split(',')
      .map(p => p.trim())
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[FileWatcher] File watching is disabled')
      return
    }

    if (this.isWatching) {
      console.log('[FileWatcher] Already watching')
      return
    }

    console.log(`[FileWatcher] Starting file watcher (mode: ${this.mode})`)
    console.log(`[FileWatcher] Watching paths: ${this.watchPaths.join(', ')}`)
    console.log(`[FileWatcher] Debounce delay: ${this.debounceMs}ms`)

    if (this.mode === 'internal') {
      this.startInternalWatch()
    } else if (this.mode === 'external') {
      // External watching would require Docker API integration
      // For now, we'll fall back to internal mode
      console.warn('[FileWatcher] External mode not fully implemented, using internal mode')
      this.startInternalWatch()
    }

    this.isWatching = true
  }

  /**
   * Start internal file watching using chokidar
   */
  private startInternalWatch(): void {
    const watchOptions = {
      ignored: /(^|[\/\\])(node_modules|dist|\.git|\.claude)/,
      persistent: true,
      ignoreInitial: true,
      usePolling: process.env.NODE_ENV === 'docker' ? true : false,
      interval: 1000,
      binaryInterval: 1000,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    }

    this.watcher = chokidar.watch(this.watchPaths, watchOptions)

    const debouncedBuild = debounce(
      () => this.triggerBuild(),
      this.debounceMs,
      { trailing: true }
    )

    this.watcher
      .on('add', (path: string) => {
        console.log(`[FileWatcher] File added: ${path}`)
        this.changedFiles.add(path)
        debouncedBuild()
      })
      .on('change', (path: string) => {
        console.log(`[FileWatcher] File changed: ${path}`)
        this.changedFiles.add(path)
        debouncedBuild()
      })
      .on('unlink', (path: string) => {
        console.log(`[FileWatcher] File deleted: ${path}`)
        this.changedFiles.add(path)
        debouncedBuild()
      })
      .on('error', (error: unknown) => {
        console.error('[FileWatcher] Error:', error)
      })

    console.log('[FileWatcher] Internal watcher started')
  }

  /**
   * Trigger a build when files change
   */
  private async triggerBuild(): Promise<void> {
    try {
      const buildService = getBuildService()

      const changedFilesList = Array.from(this.changedFiles)
      console.log(`[FileWatcher] Triggering build due to changes in: ${changedFilesList.join(', ')}`)

      const options: BuildOptions = {
        triggerType: 'file_change',
        triggerSource: changedFilesList.join(', '),
        changedFiles: changedFilesList,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
      }

      this.changedFiles.clear()
      await buildService.executeBuild(options)
    } catch (error) {
      console.error('[FileWatcher] Build trigger error:', error)
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      this.isWatching = false
      console.log('[FileWatcher] Watcher stopped')
    }
  }

  /**
   * Check if watcher is active
   */
  checkIfWatching(): boolean {
    return this.isWatching
  }

  /**
   * Get current watched paths
   */
  getWatchedPaths(): string[] {
    return [...this.watchPaths]
  }

  /**
   * Get number of changed files waiting to trigger build
   */
  getPendingChanges(): number {
    return this.changedFiles.size
  }
}

let fileWatcherInstance: FileWatcherService | null = null

export function initializeFileWatcher(): FileWatcherService {
  if (!fileWatcherInstance) {
    fileWatcherInstance = new FileWatcherService()
  }
  return fileWatcherInstance
}

export function getFileWatcher(): FileWatcherService {
  if (!fileWatcherInstance) {
    throw new Error('FileWatcher not initialized')
  }
  return fileWatcherInstance
}
