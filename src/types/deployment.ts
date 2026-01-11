/**
 * TypeScript type definitions for frontend deployment system
 */

// Build System
export interface BuildRecord {
  id: number
  triggerType: 'file_change' | 'dependency_update' | 'manual' | 'scheduled'
  triggerSource: string
  startedAt: string
  completedAt?: string
  status: 'pending' | 'building' | 'success' | 'failed'
  buildOutput: string
  exitCode?: number
  durationMs?: number
  changedFiles: string[]
  errorMessage?: string
  environment: 'development' | 'production'
}

// Dependencies
export interface DependencyStatus {
  packageName: string
  currentVersion: string
  latestVersion: string
  wantedVersion: string
  updateType: 'major' | 'minor' | 'patch' | 'none'
  isDevDependency: boolean
  hasSecurityIssues: boolean
  securityVulnerabilities: VulnerabilityDetail[]
  lastCheckedAt: string
  lastUpdatedAt?: string
  homepage?: string
  description?: string
}

export interface DependencySnapshot {
  id: number
  snapshotName: string
  createdAt: string
  createdBy: string
  isStable: boolean
  notes?: string
}

export interface DependenciesSummary {
  total: number
  major: number
  minor: number
  patch: number
  security: number
}

export interface VulnerabilityDetail {
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical'
  cve?: string
  title: string
  url?: string
}

// System Metrics
export interface SystemMetrics {
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

// Git Status
export interface GitStatus {
  id?: number
  timestamp: string
  branch: string
  latestCommitHash: string
  latestCommitMessage: string
  latestCommitAuthor: string
  latestCommitDate: string
  uncommittedChangesCount: number
  uncommittedFiles: string
  remoteStatus: 'up-to-date' | 'ahead' | 'behind' | 'diverged' | 'unknown'
  commitsAhead: number
  commitsBehind: number
}

// Deployment Config
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

// Health Check
export interface HealthStatus {
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

// Statistics
export interface DeploymentStats {
  totalBuilds: number
  successfulBuilds: number
  failedBuilds: number
  averageBuildTime: number
  lastBuildTime: number
  dependenciesOutdated: number
  securityIssues: number
}

// Toast Notification
export interface ToastNotification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number
  autoClose?: boolean
}

// Browser Notification
export interface BrowserNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
}

// Store State
export interface DeploymentStoreState {
  // Build
  builds: BuildRecord[]
  currentBuild: BuildRecord | null
  liveOutput: string
  isBuilding: boolean

  // Dependencies
  dependencies: DependencyStatus[]
  dependencySnapshots: DependencySnapshot[]
  dependenciesSummary: DependenciesSummary

  // Metrics
  currentMetrics: SystemMetrics | null
  metricsHistory: SystemMetrics[]

  // Git
  gitStatus: GitStatus | null
  gitHistory: GitStatus[]

  // Config
  config: DeploymentConfig | null
  deploymentEnabled: boolean

  // WebSocket
  wsConnected: boolean
  wsConnectionRetries: number
}

// WebSocket Message Types
export interface WebSocketMessage {
  event: string
  data: any
  timestamp: string
}

export interface BuildOutputMessage {
  buildId: number
  output: string
}

export interface BuildErrorMessage {
  buildId: number
  error: string
}

export interface BuildCompleteMessage {
  buildId: number
  success: boolean
  duration: number
  exitCode: number
}

export interface MetricsUpdateMessage {
  timestamp: string
  cpuUsagePercent: number
  memoryUsedMb: number
  memoryTotalMb: number
  diskUsedGb: number
  diskTotalGb: number
  uptimeSeconds: number
}

// Chart Data
export interface ChartDataPoint {
  timestamp: string | Date
  value: number
}

export interface ChartDataset {
  label: string
  data: ChartDataPoint[]
  borderColor?: string
  backgroundColor?: string
  tension?: number
  fill?: boolean
}

// UI Component Props
export interface BuildLogsPanelProps {
  autoScroll?: boolean
}

export interface SystemMetricsPanelProps {
  timeRange?: '1h' | '6h' | '24h' | '7d'
}

export interface DependencyPanelProps {
  filterType?: 'all' | 'outdated' | 'security'
  selectedPackages?: Set<string>
}

export interface GitStatusPanelProps {
  showHistory?: boolean
}

// Error Types
export class DeploymentError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'DeploymentError'
  }
}

// Utility Types
export type BuildStatusColor = 'success' | 'error' | 'pending' | 'info'
export type UpdateType = 'major' | 'minor' | 'patch'
export type RemoteStatusColor = 'success' | 'warning' | 'error' | 'info'
