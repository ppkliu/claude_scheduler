/**
 * TypeScript type definitions for auto-deployment system
 */

// Build System Types
export interface BuildRecord {
  id: number
  trigger_type: 'file_change' | 'dependency_update' | 'manual' | 'scheduled'
  trigger_source: string
  started_at: string
  completed_at?: string
  status: 'pending' | 'building' | 'success' | 'failed'
  build_output: string
  exit_code?: number
  duration_ms?: number
  changed_files?: string
  error_message?: string
  environment: 'development' | 'production'
}

export interface BuildOptions {
  triggerType: 'file_change' | 'dependency_update' | 'manual' | 'scheduled'
  triggerSource: string
  changedFiles?: string[]
  environment?: 'development' | 'production'
}

export interface BuildResult {
  success: boolean
  exitCode: number
  output: string
  duration: number
  startedAt: string
}

// Dependency System Types
export interface DependencySnapshot {
  id: number
  snapshot_name: string
  package_json: string
  package_lock_json: string
  created_at: string
  created_by: string
  is_stable: number
  notes?: string
}

export interface DependencyStatus {
  package_name: string
  current_version: string
  latest_version?: string
  wanted_version?: string
  update_type: 'major' | 'minor' | 'patch' | 'none'
  is_dev_dependency: number
  has_security_issues: number
  security_vulnerabilities?: string
  last_checked_at: string
  last_updated_at?: string
  homepage?: string
  description?: string
}

export interface UpdateOptions {
  packages: string[]
  updateType?: 'latest' | 'wanted'
  createSnapshot?: boolean
  autoRollback?: boolean
}

export interface UpdateResult {
  success: boolean
  updated?: string[]
  failed?: string[]
  snapshotId?: number
  message?: string
}

// System Monitoring Types
export interface SystemMetrics {
  id?: number
  timestamp: string
  cpu_usage_percent: number
  memory_total_mb: number
  memory_used_mb: number
  memory_free_mb: number
  disk_total_gb: number
  disk_used_gb: number
  disk_free_gb: number
  uptime_seconds: number
}

export interface SystemMetricsHistory {
  timestamp: string
  cpuUsagePercent: number
  memoryTotalMb: number
  memoryUsedMb: number
  memoryFreeMb: number
  diskTotalGb: number
  diskUsedGb: number
  diskFreeGb: number
  uptimeSeconds: number
}

// Git Tracking Types
export interface GitStatus {
  id?: number
  timestamp: string
  branch: string
  latest_commit_hash: string
  latest_commit_message: string
  latest_commit_author: string
  latest_commit_date: string
  uncommitted_changes_count: number
  uncommitted_files?: string
  remote_status: 'up-to-date' | 'ahead' | 'behind' | 'diverged' | 'unknown'
  commits_ahead: number
  commits_behind: number
}

export interface CommitInfo {
  hash: string
  message: string
  author: string
  date: string
}

export interface RemoteStatus {
  status: 'up-to-date' | 'ahead' | 'behind' | 'diverged' | 'unknown'
  ahead: number
  behind: number
}

// File Watching Types
export interface FileWatcherConfig {
  enabled: boolean
  mode: 'internal' | 'external'
  debounceMs: number
  watchPaths: string[]
}

// WebSocket Types
export interface WebSocketMessage {
  event: string
  data: any
  timestamp: string
}

export interface BuildLogUpdate {
  buildId: number
  output: string
}

export interface BuildErrorUpdate {
  buildId: number
  error: string
}

export interface MetricsUpdate {
  timestamp: string
  cpuUsagePercent: number
  memoryUsedMb: number
  diskUsedGb: number
  [key: string]: any
}

// Deployment Configuration Types
export interface DeploymentConfig {
  fileWatchEnabled: boolean
  fileWatchMode: 'internal' | 'external'
  debounceMs: number
  watchPaths: string[]
  monitorEnabled: boolean
  metricsInterval: number
  gitTrackingInterval: number
  dependencyCheckSchedule: string
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface BuildListResponse {
  success: boolean
  data: {
    builds: BuildRecord[]
    total: number
    hasMore: boolean
  }
}

export interface DependencyStatusResponse {
  success: boolean
  data: {
    dependencies: DependencyStatus[]
    lastChecked: string
    updatesSummary: {
      total: number
      major: number
      minor: number
      patch: number
      security: number
    }
  }
}

export interface MetricsResponse {
  success: boolean
  data: SystemMetrics
}

export interface HealthCheckResponse {
  success: boolean
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: {
      database: boolean
      fileWatcher: boolean
      buildService: boolean
      diskSpace: boolean
      memoryAvailable: boolean
    }
    uptime: number
    lastBuild?: BuildRecord
  }
}

export interface StatsResponse {
  success: boolean
  data: {
    totalBuilds: number
    successfulBuilds: number
    failedBuilds: number
    averageBuildTime: number
    lastBuildTime: number
    dependenciesOutdated: number
    securityIssues: number
  }
}

// Audit Types
export interface VulnerabilityDetail {
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical'
  cve?: string
  title: string
  url?: string
  packageName?: string
}

export interface AuditResult {
  success: boolean
  data: {
    vulnerabilities: {
      info: number
      low: number
      moderate: number
      high: number
      critical: number
    }
    details: VulnerabilityDetail[]
  }
}

// Docker API Types
export interface DockerContainerStats {
  memory_stats: {
    usage: number
    limit: number
  }
  cpu_stats: {
    cpu_usage: {
      total_usage: number
    }
  }
}

// Service Interface Types
export interface IFileWatcherService {
  start(): Promise<void>
  stop(): Promise<void>
  isWatching(): boolean
}

export interface IBuildService {
  executeBuild(options: BuildOptions): Promise<BuildResult>
  getBuildHistory(limit: number, offset: number): BuildRecord[]
  cancelBuild(id: number): Promise<void>
}

export interface IDependencyService {
  checkUpdates(): Promise<DependencyStatus[]>
  updatePackages(packages: string[], options?: UpdateOptions): Promise<UpdateResult>
  rollbackToSnapshot(snapshotId: number): Promise<void>
  createSnapshot(name: string): Promise<number>
  getSnapshots(): DependencySnapshot[]
  runSecurityAudit(): Promise<AuditResult>
}

export interface ISystemMonitorService {
  start(intervalMs?: number): void
  stop(): void
  collectMetrics(): Promise<SystemMetrics>
  getMetricsHistory(startDate?: string, endDate?: string): SystemMetrics[]
}

export interface IGitTrackerService {
  captureGitStatus(): Promise<GitStatus>
  getStatusHistory(limit?: number): GitStatus[]
  getCurrentBranch(): Promise<string>
  getLatestCommit(): Promise<CommitInfo>
  getRemoteStatus(): Promise<RemoteStatus>
}

export interface IWebSocketService {
  initialize(server: any): void
  broadcast(event: string, data: any): void
  getConnectedClientsCount(): number
}
