import { createServer, IncomingMessage, ServerResponse } from 'http'
import Database from 'better-sqlite3'
import cron, { ScheduledTask } from 'node-cron'
import { spawn } from 'child_process'
import { resolve, join } from 'path'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { createHash } from 'crypto'

// Deployment system imports
import { websocketService } from './services/websocket.service'
import { initializeBuildService, getBuildService } from './services/build.service'
import { initializeFileWatcher } from './services/file-watcher.service'
import { initializeSystemMonitor, getSystemMonitor } from './services/system-monitor.service'
import { initializeGitTracker } from './services/git-tracker.service'
import { initializeDependencyService, getDependencyService } from './services/dependency.service'

// ============ Database Setup ============
const dbPath = resolve(process.cwd(), 'scheduler.db')
const db = new Database(dbPath)

// Initialize database schema
function initializeDatabase() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      prompt TEXT NOT NULL DEFAULT 'hi',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      schedule_name TEXT,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      response TEXT,
      error TEXT,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      execution_log_id INTEGER,
      session_id TEXT,
      project_path TEXT,
      user_prompt TEXT NOT NULL,
      assistant_response TEXT,
      category TEXT DEFAULT 'uncategorized',
      tags TEXT,
      source TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      prompt_hash TEXT,
      categorized_at TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (execution_log_id) REFERENCES execution_logs(id),
      UNIQUE (session_id, executed_at, prompt_hash)
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_sync_status (
      project_path TEXT PRIMARY KEY,
      last_sync_timestamp TEXT NOT NULL,
      last_synced_file TEXT,
      total_conversations_synced INTEGER DEFAULT 0,
      last_sync_status TEXT DEFAULT 'success',
      last_sync_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_logs_schedule ON execution_logs(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_logs_date ON execution_logs(executed_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversations(executed_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_category ON conversations(category);
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source);
    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_path);
    CREATE INDEX IF NOT EXISTS idx_sync_status_timestamp ON project_sync_status(last_sync_timestamp);

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      frontmatter TEXT,
      file_hash TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      file_mtime TEXT,
      source TEXT NOT NULL DEFAULT 'imported',
      imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      import_status TEXT DEFAULT 'pending',
      llm_analysis TEXT,
      execution_log_id INTEGER,
      UNIQUE(filename, file_hash),
      FOREIGN KEY (execution_log_id) REFERENCES execution_logs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_plans_filename ON plans(filename);
    CREATE INDEX IF NOT EXISTS idx_plans_hash ON plans(file_hash);
    CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(import_status);
    CREATE INDEX IF NOT EXISTS idx_plans_imported_at ON plans(imported_at);

    CREATE TABLE IF NOT EXISTS plan_sync_status (
      plan_directory TEXT PRIMARY KEY,
      last_sync_timestamp TEXT NOT NULL,
      last_synced_file TEXT,
      total_plans_synced INTEGER DEFAULT 0,
      total_plans_updated INTEGER DEFAULT 0,
      last_sync_status TEXT DEFAULT 'success',
      last_sync_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS build_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('file_change', 'dependency_update', 'manual', 'scheduled')),
      trigger_source TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'building', 'success', 'failed')),
      build_output TEXT,
      exit_code INTEGER,
      duration_ms INTEGER,
      changed_files TEXT,
      error_message TEXT,
      environment TEXT DEFAULT 'development'
    );

    CREATE TABLE IF NOT EXISTS dependency_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_name TEXT NOT NULL,
      package_json TEXT NOT NULL,
      package_lock_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT DEFAULT 'system',
      is_stable INTEGER DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS dependency_status (
      package_name TEXT PRIMARY KEY,
      current_version TEXT NOT NULL,
      latest_version TEXT,
      wanted_version TEXT,
      update_type TEXT CHECK(update_type IN ('major', 'minor', 'patch', 'none')),
      is_dev_dependency INTEGER DEFAULT 0,
      has_security_issues INTEGER DEFAULT 0,
      security_vulnerabilities TEXT,
      last_checked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_updated_at TEXT,
      homepage TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS system_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      cpu_usage_percent REAL,
      memory_total_mb INTEGER,
      memory_used_mb INTEGER,
      memory_free_mb INTEGER,
      disk_total_gb INTEGER,
      disk_used_gb INTEGER,
      disk_free_gb INTEGER,
      uptime_seconds INTEGER
    );

    CREATE TABLE IF NOT EXISTS git_status_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      branch TEXT NOT NULL,
      latest_commit_hash TEXT NOT NULL,
      latest_commit_message TEXT,
      latest_commit_author TEXT,
      latest_commit_date TEXT,
      uncommitted_changes_count INTEGER DEFAULT 0,
      uncommitted_files TEXT,
      remote_status TEXT CHECK(remote_status IN ('up-to-date', 'ahead', 'behind', 'diverged', 'unknown')),
      commits_ahead INTEGER DEFAULT 0,
      commits_behind INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deployment_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_build_status ON build_history(status);
    CREATE INDEX IF NOT EXISTS idx_build_started ON build_history(started_at);
    CREATE INDEX IF NOT EXISTS idx_build_trigger ON build_history(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_dependency_update_type ON dependency_status(update_type);
    CREATE INDEX IF NOT EXISTS idx_dependency_security ON dependency_status(has_security_issues);
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON system_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_git_timestamp ON git_status_snapshots(timestamp);
  `)

  // Migrate schema: Add missing columns if they don't exist
  try {
    // Check if prompt_hash column exists in conversations table
    const tableInfo = db.prepare("PRAGMA table_info(conversations)").all() as Array<{name: string}>
    const hasPromptHash = tableInfo.some(col => col.name === 'prompt_hash')

    if (!hasPromptHash) {
      console.log('[Migration] Adding prompt_hash column to conversations table...')
      db.exec(`ALTER TABLE conversations ADD COLUMN prompt_hash TEXT`)
    }

    // Check if unique constraint exists in table definition
    const tableSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='conversations'").get() as {sql: string} | undefined
    const hasUniqueConstraint = tableSchema?.sql?.includes('UNIQUE')

    if (!hasUniqueConstraint) {
      // Try to create unique index for deduplication
      try {
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique
          ON conversations(session_id, executed_at, prompt_hash)`)
        console.log('[Migration] Unique index created successfully for deduplication')
      } catch (e) {
        console.warn('[Migration] Could not create unique index (duplicate data detected):', (e as Error).message)
        console.log('[Migration] Will clean up duplicates during backfill phase...')
      }
    } else {
      console.log('[Migration] Unique constraint already exists in table definition')
    }
  } catch (e) {
    console.error('[Migration] Schema migration error:', e)
  }
}

initializeDatabase()

// ============ Utility Functions ============
/**
 * Generate SHA-256 hash of first 200 characters of a prompt
 */
function generatePromptHash(prompt: string): string {
  const content = prompt.substring(0, 200)
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Backfill existing conversations with prompt_hash and remove duplicates
 */
function backfillPromptHashes() {
  try {
    const rows = db.prepare('SELECT id, user_prompt, session_id, executed_at FROM conversations WHERE prompt_hash IS NULL LIMIT 1000').all() as Array<{ id: number; user_prompt: string; session_id: string | null; executed_at: string }>

    if (rows.length > 0) {
      const updateStmt = db.prepare('UPDATE conversations SET prompt_hash = ? WHERE id = ?')
      const deleteStmt = db.prepare('DELETE FROM conversations WHERE id = ?')
      const checkExistingStmt = db.prepare('SELECT id FROM conversations WHERE session_id = ? AND executed_at = ? AND prompt_hash IS NOT NULL LIMIT 1')

      let updated = 0
      let deleted = 0
      let failed = 0

      for (const row of rows) {
        try {
          const hash = generatePromptHash(row.user_prompt)

          // Check if a row with the same (session_id, executed_at, hash) already exists
          const existingRow = checkExistingStmt.get(row.session_id, row.executed_at) as { id: number } | undefined

          if (existingRow && existingRow.id !== row.id) {
            // A different row with the same session and timestamp already has a hash
            // Delete this duplicate instead of updating
            deleteStmt.run(row.id)
            deleted++
            console.log(`[Backfill] Deleted duplicate row id=${row.id} (existing row id=${existingRow.id} has hash)`)
          } else {
            // Update this row with the hash
            updateStmt.run(hash, row.id)
            updated++
          }
        } catch (e) {
          // If update fails due to constraint violation, delete this row
          const errorMsg = (e as Error).message
          if (errorMsg.includes('UNIQUE constraint')) {
            deleteStmt.run(row.id)
            deleted++
            console.log(`[Backfill] Deleted duplicate row id=${row.id} (constraint violation)`)
          } else {
            console.warn(`[Backfill] Skipped row id=${row.id} due to error:`, errorMsg)
            failed++
          }
        }
      }

      console.log(`[Backfill] Completed: Updated ${updated} conversations with prompt_hash, Deleted ${deleted} duplicates, Failed ${failed}`)
    } else {
      console.log('[Backfill] No conversations without prompt_hash found')
    }
  } catch (error) {
    console.error('[Backfill] Error backfilling prompt hashes:', error)
  }
}

// Run backfill migration on startup
backfillPromptHashes()

// ============ Plan Import Functions ============

/**
 * Generate SHA-256 hash of plan content for deduplication
 */
function generatePlanHash(content: string): string {
  return createHash('sha256')
    .update(content.trim())
    .digest('hex')
}

/**
 * Extract meaningful title from plan content
 */
function extractPlanTitle(content: string, frontmatter: Record<string, string>): string {
  // Priority 1: Check frontmatter for title
  if (frontmatter.title) {
    return frontmatter.title
  }

  // Priority 2: Check frontmatter for goal
  if (frontmatter.goal) {
    return frontmatter.goal
  }

  // Priority 3: Extract first H1 heading
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)/)
    if (match) {
      return match[1].trim()
    }
  }

  // Fallback: Return untitled
  return 'Untitled Plan'
}

/**
 * Interface for plan files to be imported
 */
interface PlanFile {
  filename: string
  fullPath: string
  content: string
  hash: string
  size: number
  mtime: string
  isNew: boolean
  isUpdated: boolean
}

/**
 * Check for new or updated plans in ~/.claude/plans directory
 */
async function checkForNewOrUpdatedPlans(): Promise<PlanFile[]> {
  const plansDir = join(homedir(), '.claude', 'plans')

  if (!existsSync(plansDir)) {
    console.log('[PlanImport] Plans directory does not exist')
    return []
  }

  const files = readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))

  const result: PlanFile[] = []

  for (const filename of files) {
    const fullPath = join(plansDir, filename)
    const stats = statSync(fullPath)
    const content = readFileSync(fullPath, 'utf-8')
    const hash = generatePlanHash(content)

    // Check if plan exists in database
    const existing = db.prepare(
      'SELECT file_hash FROM plans WHERE filename = ? ORDER BY imported_at DESC LIMIT 1'
    ).get(filename) as { file_hash: string } | undefined

    let isNew = false
    let isUpdated = false

    if (!existing) {
      isNew = true
    } else if (existing.file_hash !== hash) {
      isUpdated = true
    }

    if (isNew || isUpdated) {
      result.push({
        filename,
        fullPath,
        content,
        hash,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        isNew,
        isUpdated
      })
    }
  }

  console.log(`[PlanImport] Found ${result.length} new/updated plans (${result.filter(p => p.isNew).length} new, ${result.filter(p => p.isUpdated).length} updated)`)

  return result
}

/**
 * Import and analyze a single plan file
 */
async function importAndAnalyzePlan(planFile: PlanFile, executionLogId: number): Promise<void> {
  const { filename, content, hash, size, mtime } = planFile

  try {
    // Parse frontmatter
    const frontmatter = parsePlanFrontmatter(content)
    const title = extractPlanTitle(content, frontmatter)

    // Insert plan with 'analyzing' status
    const insertPlan = db.prepare(`
      INSERT INTO plans (
        filename, title, content, frontmatter, file_hash,
        file_size, file_mtime, import_status, execution_log_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'analyzing', ?)
    `)

    const result = insertPlan.run(
      filename,
      title,
      content,
      JSON.stringify(frontmatter),
      hash,
      size,
      mtime,
      executionLogId
    )

    const planId = result.lastInsertRowid

    console.log(`[PlanImport] Inserted plan: ${filename} (${title})`)

    // Generate LLM analysis prompt
    const analysisPrompt = `Please analyze this implementation plan and provide a concise summary:

Title: ${title}
Status: ${frontmatter.status || 'Unknown'}
Goal: ${frontmatter.goal || 'Not specified'}

Plan Content:
${content.substring(0, 3000)}

Provide a brief analysis covering:
1. Main objectives
2. Key implementation steps
3. Potential challenges or risks
4. Overall complexity assessment

Keep the analysis under 300 words.`

    // Run LLM analysis
    const analysis = await runLLMCommand(analysisPrompt, {
      maxTurns: 1,
      outputFormat: 'text',
      skipPermissions: true
    })

    console.log(`[PlanImport] LLM analysis completed for ${filename}`)

    // Update plan with analysis
    const updatePlan = db.prepare(`
      UPDATE plans
      SET llm_analysis = ?,
          import_status = 'completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    updatePlan.run(analysis, planId)

  } catch (error) {
    console.error(`[PlanImport] Failed to import ${filename}:`, error)

    // Update plan status to failed
    db.prepare(`
      UPDATE plans
      SET import_status = 'failed',
          updated_at = CURRENT_TIMESTAMP
      WHERE filename = ? AND file_hash = ?
    `).run(filename, hash)

    throw error
  }
}

/**
 * Execute scheduled task with plan import logic (triggered for 4AM schedules)
 */
async function executeScheduleWithPlanImport(
  scheduleId: number,
  scheduleName: string,
  prompt: string,
  hour: number
): Promise<void> {
  const startTime = Date.now()

  // Check if this is the 4AM schedule
  const shouldImportPlans = (hour === 4)

  if (!shouldImportPlans) {
    // Not 4AM, execute normal LLM command
    await executeLLMCode(scheduleId, scheduleName, prompt)
    return
  }

  // 4AM - Check for plans to import
  console.log('[PlanImport] Starting plan import check at 4AM...')

  // Create execution log entry
  const insertLog = db.prepare(`
    INSERT INTO execution_logs (schedule_id, schedule_name, status, response)
    VALUES (?, ?, 'pending', '')
  `)
  const result = insertLog.run(scheduleId, scheduleName)
  const logId = result.lastInsertRowid as number

  try {
    // Check for new or updated plans
    const plansToImport = await checkForNewOrUpdatedPlans()

    if (plansToImport.length === 0) {
      // No new plans, execute normal "hi" command
      console.log('[PlanImport] No new plans to import, executing normal "hi" command')

      const response = await runLLMCommand(prompt, {
        maxTurns: 1,
        outputFormat: 'text',
        skipPermissions: true
      })

      const durationMs = Date.now() - startTime
      const tokenEstimate = estimateTokens(prompt, response)

      db.prepare(`
        UPDATE execution_logs
        SET status = 'success',
            input_tokens = ?,
            output_tokens = ?,
            total_tokens = ?,
            cost_usd = ?,
            duration_ms = ?,
            response = ?
        WHERE id = ?
      `).run(
        tokenEstimate.input,
        tokenEstimate.output,
        tokenEstimate.total,
        tokenEstimate.cost,
        durationMs,
        response.substring(0, 10000),
        logId
      )

      console.log(`[PlanImport] ✅ No imports, standard execution completed`)
      return
    }

    // Import and analyze plans
    console.log(`[PlanImport] Importing ${plansToImport.length} plans...`)

    let successCount = 0
    let failCount = 0

    for (const planFile of plansToImport) {
      try {
        await importAndAnalyzePlan(planFile, logId)
        successCount++
      } catch (error) {
        failCount++
        console.error(`[PlanImport] Failed to import ${planFile.filename}:`, error)
      }
    }

    const durationMs = Date.now() - startTime

    // Estimate total tokens used
    // Each plan analysis uses approximately 1000 input + 300 output tokens
    const estimatedInputTokens = successCount * 1000
    const estimatedOutputTokens = successCount * 300
    const totalTokens = estimatedInputTokens + estimatedOutputTokens
    const estimatedCost = (estimatedInputTokens * 3 + estimatedOutputTokens * 15) / 1000000

    // Update execution log
    const summaryResponse = `Imported ${successCount} plan(s) with LLM analysis. ${failCount} failed.`

    db.prepare(`
      UPDATE execution_logs
      SET status = 'success',
          input_tokens = ?,
          output_tokens = ?,
          total_tokens = ?,
          cost_usd = ?,
          duration_ms = ?,
          response = ?
      WHERE id = ?
    `).run(
      estimatedInputTokens,
      estimatedOutputTokens,
      totalTokens,
      estimatedCost,
      durationMs,
      summaryResponse,
      logId
    )

    // Update sync status
    const plansDir = join(homedir(), '.claude', 'plans')
    db.prepare(`
      INSERT INTO plan_sync_status (
        plan_directory, last_sync_timestamp, total_plans_synced,
        total_plans_updated, last_sync_status
      ) VALUES (?, datetime('now'), ?, ?, 'success')
      ON CONFLICT(plan_directory) DO UPDATE SET
        last_sync_timestamp = datetime('now'),
        total_plans_synced = total_plans_synced + excluded.total_plans_synced,
        total_plans_updated = total_plans_updated + excluded.total_plans_updated,
        last_sync_status = 'success',
        updated_at = CURRENT_TIMESTAMP
    `).run(
      plansDir,
      plansToImport.filter(p => p.isNew).length,
      plansToImport.filter(p => p.isUpdated).length
    )

    console.log(`[PlanImport] ✅ Imported ${successCount} plans | Tokens: ${totalTokens} | Cost: $${estimatedCost.toFixed(6)} | Duration: ${durationMs}ms`)

  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    db.prepare(`
      UPDATE execution_logs
      SET status = 'failed',
          duration_ms = ?,
          error = ?
      WHERE id = ?
    `).run(durationMs, errorMessage, logId)

    // Update sync status with error
    const plansDir = join(homedir(), '.claude', 'plans')
    db.prepare(`
      INSERT INTO plan_sync_status (
        plan_directory, last_sync_timestamp, last_sync_status, last_sync_error
      ) VALUES (?, datetime('now'), 'failed', ?)
      ON CONFLICT(plan_directory) DO UPDATE SET
        last_sync_timestamp = datetime('now'),
        last_sync_status = 'failed',
        last_sync_error = excluded.last_sync_error,
        updated_at = CURRENT_TIMESTAMP
    `).run(plansDir, errorMessage)

    console.error(`[PlanImport] ❌ Import failed: ${errorMessage}`)
  }
}

// ============ Scheduler Manager ============
const scheduledTasks = new Map<number, ScheduledTask>()

interface Schedule {
  id: number
  name: string
  cron_expression: string
  hour: number
  minute: number
  enabled: number
  prompt: string
  created_at: string
  updated_at: string
}

interface HistoryEntry {
  display: string
  pastedContents: Record<string, unknown>
  timestamp: number
  project?: string
  sessionId?: string
}

interface ExecutionLog {
  id: number
  schedule_id?: number
  schedule_name: string
  executed_at: string
  status: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  duration_ms: number
  response: string
  error?: string
}

interface MergedConversation {
  historyEntry: HistoryEntry | null
  executionLog: ExecutionLog | null
  matchType: 'exact' | 'fuzzy' | 'none'
  timeDiff: number
}

interface ConversationGroup {
  date: string
  label: string
  conversations: unknown[]
  count: number
}

// 最省 token 的 prompt - 只說 "hi"
const MINIMAL_PROMPT = 'hi'

// LLM Code CLI 執行選項
interface LLMCodeOptions {
  permissionMode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'
  skipPermissions?: boolean
  maxTurns?: number
  outputFormat?: 'text' | 'json' | 'stream-json'
}

async function executeLLMCode(scheduleId: number, scheduleName: string, prompt: string): Promise<void> {
  const startTime = Date.now()

  // 建立 pending log
  const insertLog = db.prepare(`
    INSERT INTO execution_logs (schedule_id, schedule_name, status, response)
    VALUES (?, ?, 'pending', '')
  `)
  const result = insertLog.run(scheduleId, scheduleName)
  const logId = result.lastInsertRowid

  try {
    // 使用 llm CLI 執行對話 - 使用最省 token 的設定
    const response = await runLLMCommand(prompt, {
      maxTurns: 1,              // 限制單輪對話
      outputFormat: 'text',     // 純文字輸出
      skipPermissions: true     // 跳過權限提示以減少互動
    })
    const durationMs = Date.now() - startTime

    // 解析 token 使用量 (從 response 中提取或估算)
    const tokenEstimate = estimateTokens(prompt, response)

    // 更新 log
    const updateLog = db.prepare(`
      UPDATE execution_logs
      SET status = 'success',
          input_tokens = ?,
          output_tokens = ?,
          total_tokens = ?,
          cost_usd = ?,
          duration_ms = ?,
          response = ?
      WHERE id = ?
    `)
    updateLog.run(
      tokenEstimate.input,
      tokenEstimate.output,
      tokenEstimate.total,
      tokenEstimate.cost,
      durationMs,
      response.substring(0, 10000), // 限制儲存長度
      logId
    )

    console.log(`[${new Date().toISOString()}] ✅ Schedule "${scheduleName}" executed successfully`)
    console.log(`   Tokens: ${tokenEstimate.total} | Cost: $${tokenEstimate.cost.toFixed(6)} | Duration: ${durationMs}ms`)

  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    const updateLog = db.prepare(`
      UPDATE execution_logs
      SET status = 'failed',
          duration_ms = ?,
          error = ?
      WHERE id = ?
    `)
    updateLog.run(durationMs, errorMessage, logId)

    console.error(`[${new Date().toISOString()}] ❌ Schedule "${scheduleName}" failed: ${errorMessage}`)
  }
}

function runLLMCommand(prompt: string, options: LLMCodeOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = ['-p', prompt]

    // 輸出格式
    args.push('--output-format', options.outputFormat || 'text')

    // 權限模式 - Pro 訂閱下建議使用 plan 模式做最小對話
    if (options.skipPermissions) {
      args.push('--dangerously-skip-permissions')
    }

    // 限制對話輪數 - 減少 token 消耗
    if (options.maxTurns) {
      args.push('--max-turns', options.maxTurns.toString())
    }

    console.log(`[LLM] Running: claude ${args.join(' ')}`)

    // 使用 llm CLI 執行
    const llm = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    let stdout = ''
    let stderr = ''

    llm.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    llm.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    llm.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr || `LLM exited with code ${code}`))
      }
    })

    llm.on('error', (err) => {
      reject(err)
    })

    // 設定 30 秒超時
    setTimeout(() => {
      llm.kill()
      reject(new Error('LLM command timeout after 30s'))
    }, 30000)
  })
}

function estimateTokens(input: string, output: string) {
  // 粗略估算: 1 token ≈ 4 字元 (英文) 或 1.5 字元 (中文混合)
  const inputTokens = Math.ceil(input.length / 3)
  const outputTokens = Math.ceil(output.length / 3)
  const totalTokens = inputTokens + outputTokens

  // Claude 3.5 Sonnet 價格估算
  // Input: $3/M tokens, Output: $15/M tokens
  const cost = (inputTokens * 3 + outputTokens * 15) / 1000000

  return {
    input: inputTokens,
    output: outputTokens,
    total: totalTokens,
    cost
  }
}

// ============ Conversation History Utilities ============

async function readHistory(limit = 100, project?: string, pathIndex = 0): Promise<HistoryEntry[]> {
  // Get configured paths from config table, fallback to default
  let historyPath = join(homedir(), '.claude', 'history.jsonl')

  console.log('[ReadHistory] Default path:', historyPath)
  console.log('[ReadHistory] Home dir:', homedir())
  console.log('[ReadHistory] Checking config...')

  try {
    const configRow = db.prepare('SELECT value FROM config WHERE key = ?').get('history_paths') as { value: string } | undefined
    if (configRow?.value) {
      try {
        const paths = JSON.parse(configRow.value) as string[]
        if (Array.isArray(paths) && paths[pathIndex]) {
          historyPath = paths[pathIndex]
          console.log('[ReadHistory] Using configured path:', historyPath)
        }
      } catch (e) {
        console.error('[ReadHistory] Failed to parse paths config:', e)
      }
    }
  } catch (e) {
    // Config table might not exist yet, use default
    console.log('[ReadHistory] Using default history path:', historyPath)
  }

  console.log('[ReadHistory] Using path:', historyPath)
  console.log('[ReadHistory] File exists:', existsSync(historyPath))

  if (!existsSync(historyPath)) {
    console.log('[ReadHistory] History file not found:', historyPath)
    return []
  }

  const entries: HistoryEntry[] = []

  // Read file line by line and parse JSONL format
  // From bottom (newest data) to get most recent entries first
  const fileStream = createReadStream(historyPath)
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  const allLines: string[] = []

  // First pass: collect all lines
  for await (const line of rl) {
    if (line.trim()) {
      allLines.push(line)
    }
  }

  // Second pass: parse from newest (bottom) first
  console.log(`[History] Found ${allLines.length} lines in history file`)

  let validEntries = 0
  let invalidTimestamp = 0
  let invalidDisplay = 0
  let parseErrors = 0

  for (let i = allLines.length - 1; i >= 0 && entries.length < limit; i--) {
    const line = allLines[i]
    try {
      const entry = JSON.parse(line) as HistoryEntry

      // Validate entry has required fields
      if (!entry.timestamp || typeof entry.timestamp !== 'number') {
        invalidTimestamp++
        console.warn('[History] Invalid entry - missing/invalid timestamp:', line.substring(0, 100))
        continue
      }

      // CRITICAL: Verify display field exists (this is the user prompt!)
      if (!entry.display || entry.display.trim() === '') {
        invalidDisplay++
        console.warn('[History] Invalid entry - empty/missing display field:', {
          timestamp: entry.timestamp,
          sessionId: entry.sessionId,
          hasDisplay: !!entry.display,
          displayLength: entry.display?.length,
          allKeys: Object.keys(entry)
        })
        continue
      }

      validEntries++

      // Log first entry sample to verify JSONL format parsing
      if (entries.length === 0) {
        console.log('[History] First entry sample (newest):', {
          display: entry.display.substring(0, 100) + (entry.display.length > 100 ? '...' : ''),
          timestamp: entry.timestamp,
          sessionId: entry.sessionId,
          project: entry.project,
          hasDisplay: !!entry.display,
          displayLength: entry.display.length
        })
      }

      // Filter by project if specified
      if (project && entry.project !== project) continue

      entries.push(entry)
    } catch (e) {
      // Skip malformed lines
      parseErrors++
      console.warn('[History] Failed to parse JSON line:', (e as Error).message, line.substring(0, 100))
    }
  }

  // Entries are already in reverse chronological order (newest first)
  console.log('[History] ========== FINAL SUMMARY ==========')
  console.log(`Total lines in file: ${allLines.length}`)
  console.log(`Valid entries: ${validEntries}`)
  console.log(`Invalid timestamp: ${invalidTimestamp}`)
  console.log(`Invalid/missing display: ${invalidDisplay}`)
  console.log(`Parse errors: ${parseErrors}`)
  console.log(`Entries returned: ${entries.length}/${limit}`)
  console.log('=======================================')
  return entries
}

function correlateConversations(
  historyEntries: HistoryEntry[],
  executionLogs: ExecutionLog[],
  timeWindowSeconds = 300
): MergedConversation[] {
  const merged: MergedConversation[] = []
  const usedLogIds = new Set<number>()

  // For each history entry, find closest execution log
  for (const historyEntry of historyEntries) {
    const historyTime = historyEntry.timestamp
    let closestLog: ExecutionLog | null = null
    let minTimeDiff = Infinity

    for (const log of executionLogs) {
      if (usedLogIds.has(log.id)) continue

      const logTime = new Date(log.executed_at).getTime()
      const timeDiff = Math.abs(historyTime - logTime) / 1000 // seconds

      if (timeDiff < minTimeDiff && timeDiff < timeWindowSeconds) {
        minTimeDiff = timeDiff
        closestLog = log
      }
    }

    if (closestLog) {
      usedLogIds.add(closestLog.id)
      merged.push({
        historyEntry,
        executionLog: closestLog,
        matchType: minTimeDiff < 5 ? 'exact' : 'fuzzy',
        timeDiff: minTimeDiff
      })
    } else {
      // Unmatched history entry
      merged.push({
        historyEntry,
        executionLog: null,
        matchType: 'none',
        timeDiff: 0
      })
    }
  }

  // Add unmatched execution logs
  for (const log of executionLogs) {
    if (!usedLogIds.has(log.id)) {
      merged.push({
        historyEntry: null,
        executionLog: log,
        matchType: 'none',
        timeDiff: 0
      })
    }
  }

  return merged
}

function getDayLabel(date: string): string {
  const targetDate = new Date(date + 'T00:00:00Z')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffTime = today.getTime() - targetDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays <= 7) return `${diffDays}天前`
  if (diffDays <= 30) return `${Math.floor(diffDays / 7)}週前`
  return `${Math.floor(diffDays / 30)}個月前`
}

function groupByDay(conversations: unknown[]): ConversationGroup[] {
  const groups = new Map<string, unknown[]>()

  for (const conv of conversations as Array<Record<string, unknown>>) {
    const executedAt = conv.executed_at as string
    const date = executedAt.split('T')[0]
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(conv)
  }

  return Array.from(groups.entries())
    .map(([date, conversations]) => ({
      date,
      label: getDayLabel(date),
      conversations,
      count: conversations.length
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// 按日期分組且支持日內排序
function groupByDayWithSort(conversations: unknown[], sortOrder: 'asc' | 'desc' = 'desc'): ConversationGroup[] {
  const groups = new Map<string, unknown[]>()

  for (const conv of conversations as Array<Record<string, unknown>>) {
    const executedAt = conv.executed_at as string
    const date = executedAt.split('T')[0]
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(conv)
  }

  return Array.from(groups.entries())
    .map(([date, conversations]) => {
      // 對每個日期分組內的對話按指定順序排序
      const sorted = [...conversations].sort((a, b) => {
        const timeA = new Date((a as any).executed_at).getTime()
        const timeB = new Date((b as any).executed_at).getTime()
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
      })

      return {
        date,
        label: getDayLabel(date),
        conversations: sorted,
        count: sorted.length
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date)) // 日期始終按降序（最新日期在前）
}

// ============ Projects JSONL Import Functions ============

function readProjectsJSONL(projectPath: string, sessionId: string): {
  userMessages: Array<{uuid: string, content: string, timestamp: string, sessionId: string}>,
  assistantMessages: Array<{uuid: string, parentUuid: string, content: string, timestamp: string, sessionId: string, usage: any}>
} {
  const filePath = join(homedir(), '.claude', 'projects', projectPath, `${sessionId}.jsonl`)

  if (!existsSync(filePath)) {
    console.warn(`[readProjectsJSONL] File not found: ${filePath}`)
    return { userMessages: [], assistantMessages: [] }
  }

  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim())

  const userMessages: Array<{uuid: string, content: string, timestamp: string, sessionId: string}> = []
  const assistantMessages: Array<{uuid: string, parentUuid: string, content: string, timestamp: string, sessionId: string, usage: any}> = []

  for (const line of lines) {
    try {
      const entry = JSON.parse(line)

      if (entry.type === 'user' && entry.message?.role === 'user') {
        let content = ''
        if (typeof entry.message.content === 'string') {
          content = entry.message.content
        } else if (Array.isArray(entry.message.content)) {
          content = entry.message.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')
        }

        if (content.trim()) {
          userMessages.push({
            uuid: entry.uuid,
            content,
            timestamp: entry.timestamp,
            sessionId: entry.sessionId
          })
        }
      }

      if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
        let responseText = ''
        if (Array.isArray(entry.message.content)) {
          responseText = entry.message.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')
        }

        if (responseText.trim()) {
          assistantMessages.push({
            uuid: entry.uuid,
            parentUuid: entry.parentUuid,
            content: responseText,
            timestamp: entry.timestamp,
            sessionId: entry.sessionId,
            usage: entry.message.usage || {}
          })
        }
      }
    } catch (e) {
      console.error(`[readProjectsJSONL] Failed to parse line: ${e}`)
      continue
    }
  }

  console.log(`[readProjectsJSONL] ${sessionId}: Found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`)

  return { userMessages, assistantMessages }
}

function pairConversations(userMessages: any[], assistantMessages: any[], projectPath?: string) {
  const conversations = []

  for (const user of userMessages) {
    const assistant = assistantMessages.find((a: any) => a.parentUuid === user.uuid)

    conversations.push({
      sessionId: user.sessionId,
      projectPath: projectPath, // 添加專案路徑
      userPrompt: user.content,
      assistantResponse: assistant?.content || null,
      executedAt: user.timestamp,
      inputTokens: assistant?.usage?.input_tokens || 0,
      outputTokens: assistant?.usage?.output_tokens || 0,
      totalTokens: (assistant?.usage?.input_tokens || 0) + (assistant?.usage?.output_tokens || 0),
      costUsd: 0, // TODO: Calculate based on model
      source: 'history_import',
      category: 'uncategorized'
    })
  }

  return conversations
}

function setupSchedule(schedule: Schedule): void {
  if (scheduledTasks.has(schedule.id)) {
    scheduledTasks.get(schedule.id)?.stop()
  }

  if (!schedule.enabled) return

  const task = cron.schedule(schedule.cron_expression, () => {
    // Pass schedule hour for plan import logic (4AM only)
    executeScheduleWithPlanImport(
      schedule.id,
      schedule.name,
      schedule.prompt,
      schedule.hour
    )
  }, {
    timezone: 'Asia/Taipei'
  })

  scheduledTasks.set(schedule.id, task)
  console.log(`📅 Schedule "${schedule.name}" set for ${schedule.cron_expression}`)
}

function initializeSchedules(): void {
  const schedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all() as Schedule[]

  for (const schedule of schedules) {
    setupSchedule(schedule)
  }

  console.log(`\n🚀 Initialized ${schedules.length} schedule(s)\n`)
}

// ============ API Handlers ============
function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function parsePlanFrontmatter(content: string): Record<string, string> {
  const frontmatter: Record<string, string> = {}
  const lines = content.split('\n').slice(0, 20)

  for (const line of lines) {
    const match = line.match(/\*\*(.+?)\*\*:\s*(.+)/)
    if (match) {
      frontmatter[match[1].toLowerCase()] = match[2].trim()
    }
  }

  return frontmatter
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const path = url.pathname
  const method = req.method || 'GET'

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    // GET /api/schedules - 取得所有排程
    if (path === '/api/schedules' && method === 'GET') {
      const schedules = db.prepare('SELECT * FROM schedules ORDER BY hour, minute').all()
      jsonResponse(res, { success: true, data: schedules })
      return
    }

    // POST /api/schedules - 建立排程
    if (path === '/api/schedules' && method === 'POST') {
      const body = await parseBody(req)
      const { name, hour, minute = 0, enabled = true, prompt = MINIMAL_PROMPT } = body as {
        name: string
        hour: number
        minute?: number
        enabled?: boolean
        prompt?: string
      }

      const cronExpression = `${minute} ${hour} * * *`

      const insert = db.prepare(`
        INSERT INTO schedules (name, cron_expression, hour, minute, enabled, prompt)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const result = insert.run(name, cronExpression, hour, minute, enabled ? 1 : 0, prompt)

      const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid) as Schedule
      setupSchedule(schedule)

      jsonResponse(res, { success: true, data: schedule }, 201)
      return
    }

    // PUT /api/schedules/:id - 更新排程
    if (path.match(/^\/api\/schedules\/\d+$/) && method === 'PUT') {
      const id = parseInt(path.split('/').pop()!)
      const body = await parseBody(req)
      const { name, hour, minute = 0, enabled, prompt } = body as {
        name?: string
        hour?: number
        minute?: number
        enabled?: boolean
        prompt?: string
      }

      const existing = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule
      if (!existing) {
        jsonResponse(res, { success: false, error: 'Schedule not found' }, 404)
        return
      }

      const newHour = hour ?? existing.hour
      const newMinute = minute ?? existing.minute
      const cronExpression = `${newMinute} ${newHour} * * *`

      const update = db.prepare(`
        UPDATE schedules
        SET name = ?, cron_expression = ?, hour = ?, minute = ?, enabled = ?, prompt = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      update.run(
        name ?? existing.name,
        cronExpression,
        newHour,
        newMinute,
        enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
        prompt ?? existing.prompt,
        id
      )

      const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule
      setupSchedule(schedule)

      jsonResponse(res, { success: true, data: schedule })
      return
    }

    // DELETE /api/schedules/:id - 刪除排程
    if (path.match(/^\/api\/schedules\/\d+$/) && method === 'DELETE') {
      const id = parseInt(path.split('/').pop()!)

      scheduledTasks.get(id)?.stop()
      scheduledTasks.delete(id)

      db.prepare('DELETE FROM schedules WHERE id = ?').run(id)
      jsonResponse(res, { success: true })
      return
    }

    // POST /api/schedules/:id/execute - 立即執行排程
    if (path.match(/^\/api\/schedules\/\d+\/execute$/) && method === 'POST') {
      const id = parseInt(path.split('/')[3])
      const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Schedule

      if (!schedule) {
        jsonResponse(res, { success: false, error: 'Schedule not found' }, 404)
        return
      }

      // 非同步執行，立即回應
      executeLLMCode(schedule.id, schedule.name, schedule.prompt)
      jsonResponse(res, { success: true, message: 'Execution started' })
      return
    }

    // GET /api/logs - 取得執行記錄
    if (path === '/api/logs' && method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')

      const logs = db.prepare(`
        SELECT * FROM execution_logs
        ORDER BY executed_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset)

      const total = (db.prepare('SELECT COUNT(*) as count FROM execution_logs').get() as { count: number }).count

      jsonResponse(res, { success: true, data: { logs, total, limit, offset } })
      return
    }

    // GET /api/stats - 取得統計資料
    if (path === '/api/stats' && method === 'GET') {
      const today = new Date().toISOString().split('T')[0]

      const todayStats = db.prepare(`
        SELECT
          COUNT(*) as execution_count,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(cost_usd) as total_cost_usd
        FROM execution_logs
        WHERE date(executed_at) = ?
      `).get(today) as {
        execution_count: number
        total_input_tokens: number
        total_output_tokens: number
        total_tokens: number
        total_cost_usd: number
      }

      const lastExecution = db.prepare(`
        SELECT * FROM execution_logs
        ORDER BY executed_at DESC
        LIMIT 1
      `).get()

      const activeSchedules = (db.prepare('SELECT COUNT(*) as count FROM schedules WHERE enabled = 1').get() as { count: number }).count

      // 計算下次執行時間
      const enabledSchedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1 ORDER BY hour, minute').all() as Schedule[]
      const now = new Date()
      const currentMinutes = now.getHours() * 60 + now.getMinutes()

      let nextExecution = null
      for (const s of enabledSchedules) {
        const scheduleMinutes = s.hour * 60 + s.minute
        if (scheduleMinutes > currentMinutes) {
          const nextTime = new Date(now)
          nextTime.setHours(s.hour, s.minute, 0, 0)
          nextExecution = {
            scheduleId: s.id,
            scheduleName: s.name,
            time: nextTime.toISOString()
          }
          break
        }
      }
      // 如果今天沒有更多執行，取明天第一個
      if (!nextExecution && enabledSchedules.length > 0) {
        const first = enabledSchedules[0]
        const nextTime = new Date(now)
        nextTime.setDate(nextTime.getDate() + 1)
        nextTime.setHours(first.hour, first.minute, 0, 0)
        nextExecution = {
          scheduleId: first.id,
          scheduleName: first.name,
          time: nextTime.toISOString()
        }
      }

      jsonResponse(res, {
        success: true,
        data: {
          isRunning: true,
          activeSchedules,
          nextExecution,
          lastExecution,
          todayStats
        }
      })
      return
    }

    // GET /api/usage - Token 使用量統計
    if (path === '/api/usage' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '7')

      const usage = db.prepare(`
        SELECT
          date(executed_at) as date,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(cost_usd) as total_cost_usd,
          COUNT(*) as execution_count
        FROM execution_logs
        WHERE executed_at >= datetime('now', '-' || ? || ' days')
        GROUP BY date(executed_at)
        ORDER BY date DESC
      `).all(days)

      jsonResponse(res, { success: true, data: usage })
      return
    }

    // POST /api/execute - 快速執行簡單對話
    if (path === '/api/execute' && method === 'POST') {
      const body = await parseBody(req)
      const { prompt = MINIMAL_PROMPT } = body as { prompt?: string }

      const startTime = Date.now()

      // 建立 pending log (無對應排程)
      const insertLog = db.prepare(`
        INSERT INTO execution_logs (schedule_id, schedule_name, status, response)
        VALUES (NULL, 'Quick Chat', 'pending', '')
      `)
      const result = insertLog.run()
      const logId = result.lastInsertRowid

      try {
        // 執行對話
        const response = await runLLMCommand(prompt, {
          maxTurns: 1,
          outputFormat: 'text',
          skipPermissions: true
        })
        const durationMs = Date.now() - startTime

        // 估算 token
        const tokenEstimate = estimateTokens(prompt, response)

        // 更新 log
        const updateLog = db.prepare(`
          UPDATE execution_logs
          SET status = 'success',
              input_tokens = ?,
              output_tokens = ?,
              total_tokens = ?,
              cost_usd = ?,
              duration_ms = ?,
              response = ?
          WHERE id = ?
        `)
        updateLog.run(
          tokenEstimate.input,
          tokenEstimate.output,
          tokenEstimate.total,
          tokenEstimate.cost,
          durationMs,
          response.substring(0, 10000),
          logId
        )

        console.log(`[${new Date().toISOString()}] ✅ Quick chat executed successfully`)
        console.log(`   Tokens: ${tokenEstimate.total} | Cost: $${tokenEstimate.cost.toFixed(6)} | Duration: ${durationMs}ms`)

        jsonResponse(res, {
          success: true,
          data: {
            response: response.substring(0, 10000),
            tokens: tokenEstimate.total,
            cost: tokenEstimate.cost,
            duration: durationMs
          }
        })
      } catch (error) {
        const durationMs = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)

        const updateLog = db.prepare(`
          UPDATE execution_logs
          SET status = 'failed',
              duration_ms = ?,
              error = ?
          WHERE id = ?
        `)
        updateLog.run(durationMs, errorMessage, logId)

        console.error(`[${new Date().toISOString()}] ❌ Quick chat failed: ${errorMessage}`)

        jsonResponse(res, {
          success: false,
          error: errorMessage
        }, 500)
      }
      return
    }

    // POST /api/presets/5hour - 快速設定 5 小時間隔 (WITH TRANSACTION SAFETY)
    if (path === '/api/presets/5hour' && method === 'POST') {
      try {
        const body = await parseBody(req)
        const { startHour = 4 } = body as { startHour?: number }

        // Validate input
        if (typeof startHour !== 'number' || startHour < 0 || startHour > 23) {
          jsonResponse(res, {
            success: false,
            error: 'Invalid start hour. Must be between 0 and 23.'
          }, 400)
          return
        }

        // Calculate 5 hours
        const hours = [
          startHour,
          (startHour + 5) % 24,
          (startHour + 10) % 24,
          (startHour + 15) % 24,
          (startHour + 20) % 24
        ].sort((a, b) => a - b)

        // BEGIN TRANSACTION
        const transaction = db.transaction(() => {
          // Step 1: Delete related execution logs first (foreign key constraint)
          db.prepare('DELETE FROM execution_logs WHERE schedule_id IS NOT NULL').run()

          // Step 2: Clear existing schedules in database
          db.prepare('DELETE FROM schedules').run()

          // Step 3: Insert new schedules
          const insert = db.prepare(`
            INSERT INTO schedules (name, cron_expression, hour, minute, enabled, prompt)
            VALUES (?, ?, ?, 0, 1, ?)
          `)

          const schedules: Schedule[] = []
          for (const hour of hours) {
            const name = `Reset @ ${hour.toString().padStart(2, '0')}:00`
            const cronExpression = `0 ${hour} * * *`
            const result = insert.run(name, cronExpression, hour, MINIMAL_PROMPT)
            const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid) as Schedule
            schedules.push(schedule)
          }

          // Verify 5 schedules were created
          if (schedules.length !== 5) {
            throw new Error(`Expected 5 schedules, but created ${schedules.length}`)
          }

          return schedules
        })

        // Execute transaction (atomic operation)
        const schedules = transaction()

        // Step 4: Stop old cron tasks (AFTER database transaction succeeds)
        scheduledTasks.forEach(task => {
          try {
            task.stop()
          } catch (e) {
            console.error('Failed to stop task:', e)
            // Log but don't fail - tasks will be cleaned up on next restart
          }
        })
        scheduledTasks.clear()

        // Step 5: Setup new cron tasks
        for (const schedule of schedules) {
          try {
            setupSchedule(schedule)
          } catch (e) {
            console.error(`Failed to setup schedule ${schedule.id}:`, e)
            // Log but don't fail - schedule exists in DB and will restart on server reboot
          }
        }

        console.log(`✅ 5-hour preset applied: ${hours.join(', ')}`)

        jsonResponse(res, {
          success: true,
          data: schedules,
          message: '5-hour preset applied successfully'
        }, 201)

      } catch (e) {
        console.error('Failed to apply 5-hour preset:', e)
        jsonResponse(res, {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to apply preset'
        }, 500)
      }
      return
    }

    // GET /api/conversations - 取得對話記錄
    if (path === '/api/conversations' && method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
      const offset = parseInt(url.searchParams.get('offset') || '0')
      const search = url.searchParams.get('search')
      const source = url.searchParams.get('source')
      const category = url.searchParams.get('category')
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')

      let query = 'SELECT * FROM conversations WHERE 1=1'
      const params: unknown[] = []

      if (search) {
        query += ` AND (user_prompt LIKE ? OR assistant_response LIKE ?)`
        const searchTerm = `%${search}%`
        params.push(searchTerm, searchTerm)
      }
      if (source) {
        query += ` AND source = ?`
        params.push(source)
      }
      if (category && category !== 'uncategorized') {
        query += ` AND category = ?`
        params.push(category)
      }
      if (startDate) {
        query += ` AND executed_at >= ?`
        params.push(startDate)
      }
      if (endDate) {
        query += ` AND executed_at < ?`
        params.push(`${endDate}T24:00:00`)
      }

      query += ` ORDER BY executed_at DESC LIMIT ? OFFSET ?`
      params.push(limit, offset)

      const conversations = db.prepare(query).all(...params)

      const countQuery = query
        .replace(/ORDER BY.*/, '')
        .replace(/LIMIT.*/, '')
        .replace(/SELECT \* FROM conversations/, 'SELECT COUNT(*) as count FROM conversations')
      const countParams = params.slice(0, -2)
      const total = (db.prepare(countQuery).get(...countParams) as { count: number }).count

      jsonResponse(res, {
        success: true,
        data: {
          conversations,
          total,
          limit,
          offset
        }
      })
      return
    }

    // GET /api/conversations/grouped-by-day - 按日期分組
    if (path === '/api/conversations/grouped-by-day' && method === 'GET') {
      const search = url.searchParams.get('search')
      const source = url.searchParams.get('source')
      const category = url.searchParams.get('category')

      let query = 'SELECT * FROM conversations WHERE 1=1'
      const params: unknown[] = []

      if (search) {
        query += ` AND (user_prompt LIKE ? OR assistant_response LIKE ?)`
        const searchTerm = `%${search}%`
        params.push(searchTerm, searchTerm)
      }
      if (source) {
        query += ` AND source = ?`
        params.push(source)
      }
      if (category && category !== 'uncategorized') {
        query += ` AND category = ?`
        params.push(category)
      }

      query += ` ORDER BY executed_at DESC`
      const conversations = db.prepare(query).all(...params) as any[]

      console.log('[GroupedByDay] Query params:', { search, source, category })
      console.log(`[GroupedByDay] Found ${conversations.length} conversations in database`)

      const groups = groupByDay(conversations)
      console.log(`[GroupedByDay] Grouped into ${groups.length} day groups`)

      // Log first group details
      if (groups.length > 0) {
        const firstConv = groups[0].conversations[0] as any
        console.log('[GroupedByDay] First group sample:', {
          date: groups[0].date,
          label: groups[0].label,
          conversationCount: groups[0].conversations.length,
          firstConvUserPrompt: (firstConv?.user_prompt || '').substring(0, 80) + '...'
        })
      }

      const total = conversations.length

      jsonResponse(res, {
        success: true,
        data: {
          groups,
          total
        }
      })
      return
    }

    // GET /api/conversations/projects/list - 列出所有可用專案
    if (path === '/api/conversations/projects/list' && method === 'GET') {
      try {
        const projectsDir = join(homedir(), '.claude', 'projects')

        if (!existsSync(projectsDir)) {
          jsonResponse(res, { success: true, data: [] }, 200)
          return
        }

        const projects = readdirSync(projectsDir, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => {
            const projectPath = dirent.name
            // 解碼專案路徑（去掉開頭的 - 並替換回 /）
            const decodedPath = projectPath.replace(/^-/, '').replace(/-/g, '/')

            // 從資料庫查詢該專案的對話數量
            const countResult = db.prepare(
              'SELECT COUNT(*) as count FROM conversations WHERE project_path = ?'
            ).get(projectPath) as { count: number } | undefined

            return {
              projectPath,
              decodedPath,
              conversationCount: countResult?.count || 0,
              displayName: projectPath.split('-').pop() || projectPath // 使用最後一部分作為顯示名稱
            }
          })
          .filter(p => p.conversationCount > 0) // 只返回有對話的專案

        jsonResponse(res, { success: true, data: projects }, 200)
      } catch (error) {
        console.error('Failed to list projects:', error)
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500)
      }
      return
    }

    // GET /api/conversations/groups - 按日期分組對話（支持專案篩選和排序）
    if (path === '/api/conversations/groups' && method === 'GET') {
      try {
        const search = url.searchParams.get('search')
        const source = url.searchParams.get('source')
        const category = url.searchParams.get('category')
        const projectPath = url.searchParams.get('projectPath')
        const sortOrder = (url.searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

        let query = 'SELECT * FROM conversations WHERE 1=1'
        const params: unknown[] = []

        if (search) {
          query += ` AND (user_prompt LIKE ? OR assistant_response LIKE ?)`
          const searchTerm = `%${search}%`
          params.push(searchTerm, searchTerm)
        }
        if (source) {
          query += ` AND source = ?`
          params.push(source)
        }
        if (category && category !== 'uncategorized') {
          query += ` AND category = ?`
          params.push(category)
        }
        // 新增：專案篩選
        if (projectPath && projectPath !== 'all') {
          query += ` AND project_path = ?`
          params.push(projectPath)
        }

        // 按時間排序
        query += ` ORDER BY executed_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`
        const conversations = db.prepare(query).all(...params) as any[]

        console.log('[Groups] Query params:', { search, source, category, projectPath, sortOrder })
        console.log(`[Groups] Found ${conversations.length} conversations in database`)

        // 按日期分組並在每個日期組內按指定順序排序
        const groups = groupByDayWithSort(conversations, sortOrder)
        console.log(`[Groups] Grouped into ${groups.length} day groups`)

        jsonResponse(res, {
          success: true,
          data: {
            groups,
            total: conversations.length
          }
        }, 200)
      } catch (error) {
        console.error('Failed to fetch groups:', error)
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500)
      }
      return
    }

    // GET /api/conversations/debug - 調試: 驗證數據庫中的對話
    if (path === '/api/conversations/debug' && method === 'GET') {
      try {
        // Get database stats
        const countResult = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }
        const totalCount = countResult.count

        // Get recent conversations
        const recent = db.prepare(`
          SELECT id, user_prompt, source, executed_at, created_at
          FROM conversations
          ORDER BY created_at DESC
          LIMIT 10
        `).all() as any[]

        // Get data by source
        const bySource = db.prepare(`
          SELECT source, COUNT(*) as count
          FROM conversations
          GROUP BY source
        `).all() as any[]

        // Get data by category
        const byCategory = db.prepare(`
          SELECT category, COUNT(*) as count
          FROM conversations
          GROUP BY category
        `).all() as any[]

        console.log('[Debug] Database verification:', {
          totalConversations: totalCount,
          recentCount: recent.length,
          bySource,
          byCategory
        })

        jsonResponse(res, {
          success: true,
          data: {
            totalConversations: totalCount,
            recentConversations: recent.map(r => ({
              id: r.id,
              userPrompt: r.user_prompt?.substring(0, 100) + (r.user_prompt?.length > 100 ? '...' : ''),
              source: r.source,
              executedAt: r.executed_at,
              createdAt: r.created_at
            })),
            bySource,
            byCategory
          }
        })
      } catch (error) {
        console.error('[Debug] Error:', error)
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Debug query failed'
        }, 500)
      }
      return
    }

    // DELETE /api/conversations/clear - 清除所有對話（用於修復損壞的數據）
    if (path === '/api/conversations/clear' && method === 'DELETE') {
      try {
        const deleted = db.prepare('DELETE FROM conversations').run()
        console.log('[Clear] Deleted all conversations:', deleted.changes)

        jsonResponse(res, {
          success: true,
          data: {
            deletedCount: deleted.changes
          }
        })
      } catch (error) {
        console.error('[Clear] Error:', error)
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to clear conversations'
        }, 500)
      }
      return
    }

    // GET /api/debug/read-history - 測試 readHistory 函數
    if (path === '/api/debug/read-history' && method === 'GET') {
      try {
        const limit = parseInt(url.searchParams.get('limit') || '5')
        console.log('[Debug] Testing readHistory with limit:', limit)

        const entries = await readHistory(limit)
        console.log('[Debug] readHistory returned:', entries.length, 'entries')

        jsonResponse(res, {
          success: true,
          data: {
            count: entries.length,
            entries: entries.map(e => ({
              display: e.display?.substring(0, 100),
              timestamp: e.timestamp,
              sessionId: e.sessionId,
              project: e.project,
              hasDisplay: !!e.display,
              displayLength: e.display?.length
            }))
          }
        })
      } catch (error) {
        console.error('[Debug] readHistory error:', error)
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed'
        }, 500)
      }
      return
    }

    // GET /api/conversations/history-import - 讀取 history.jsonl
    if (path === '/api/conversations/history-import' && method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '100')
      const project = url.searchParams.get('project') || undefined

      try {
        const entries = await readHistory(limit, project)
        jsonResponse(res, {
          success: true,
          data: {
            entries,
            total: entries.length
          }
        })
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read history'
        }, 500)
      }
      return
    }

    // POST /api/conversations/merge - 合併 history 和 execution_logs
    if (path === '/api/conversations/merge' && method === 'POST') {
      const body = await parseBody(req)
      const { timeWindowSeconds = 300 } = body as { timeWindowSeconds?: number }

      try {
        console.log('[Merge] Starting merge process...')
        const historyEntries = await readHistory(100)
        console.log('[Merge] ReadHistory result:', {
          count: historyEntries.length,
          firstEntry: historyEntries[0] ? {
            display: historyEntries[0].display?.substring(0, 50),
            timestamp: historyEntries[0].timestamp,
            hasDisplay: !!historyEntries[0].display
          } : 'NONE'
        })

        const executionLogs = db.prepare('SELECT * FROM execution_logs ORDER BY executed_at DESC LIMIT 100').all() as ExecutionLog[]
        console.log('[Merge] ExecutionLogs:', {
          count: executionLogs.length,
          firstLog: executionLogs[0] ? {
            id: executionLogs[0].id,
            response: executionLogs[0].response?.substring(0, 50),
            executed_at: executionLogs[0].executed_at
          } : 'NONE'
        })

        const merged = correlateConversations(historyEntries, executionLogs, timeWindowSeconds)
        console.log('[Merge] Correlation result:', {
          total: merged.length,
          withHistory: merged.filter(m => m.historyEntry).length,
          withoutHistory: merged.filter(m => !m.historyEntry).length,
          matched: merged.filter(m => m.matchType !== 'none').length,
          unmatched: merged.filter(m => m.matchType === 'none').length
        })

        jsonResponse(res, {
          success: true,
          data: {
            merged,
            stats: {
              totalHistory: historyEntries.length,
              totalLogs: executionLogs.length,
              matched: merged.filter(m => m.matchType !== 'none').length,
              unmatched: merged.filter(m => m.matchType === 'none').length
            }
          }
        })
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to merge'
        }, 500)
      }
      return
    }

    // GET /api/conversations/check-new - 檢查是否有新對話可以匯入
    if (path === '/api/conversations/check-new' && method === 'GET') {
      const params = new URL(req.url!, `http://${req.headers.host}`).searchParams
      const projectPath = params.get('projectPath')

      try {
        const projectsDir = join(homedir(), '.claude', 'projects')

        if (!existsSync(projectsDir)) {
          jsonResponse(res, {
            success: true,
            data: {
              hasNewConversations: false,
              newFileCount: 0,
              lastSyncTimestamp: '1970-01-01T00:00:00.000Z'
            }
          })
          return
        }

        // 取得上次同步時間
        const syncStatus = db.prepare(
          'SELECT last_sync_timestamp FROM project_sync_status WHERE project_path = ?'
        ).get(projectPath || 'all') as { last_sync_timestamp: string } | undefined

        const lastSync = syncStatus?.last_sync_timestamp || '1970-01-01T00:00:00.000Z'
        const lastSyncDate = new Date(lastSync)

        // 掃描檔案修改時間
        let newFileCount = 0
        const projects = projectPath ? [projectPath] : readdirSync(projectsDir).filter(f => {
          const fullPath = join(projectsDir, f)
          try {
            return statSync(fullPath).isDirectory()
          } catch {
            return false
          }
        })

        for (const proj of projects) {
          const projDir = join(projectsDir, proj)
          try {
            const files = readdirSync(projDir).filter(f => f.endsWith('.jsonl'))

            for (const file of files) {
              try {
                const filePath = join(projDir, file)
                const stat = statSync(filePath)
                if (stat.mtime > lastSyncDate) {
                  newFileCount++
                }
              } catch (e) {
                // Skip files that can't be accessed
                continue
              }
            }
          } catch (e) {
            // Skip projects that can't be read
            continue
          }
        }

        jsonResponse(res, {
          success: true,
          data: {
            hasNewConversations: newFileCount > 0,
            newFileCount,
            lastSyncTimestamp: lastSync
          }
        })
      } catch (e) {
        jsonResponse(res, {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to check for new conversations'
        }, 500)
      }
      return
    }

    // POST /api/conversations/import-from-projects - 從 Projects JSONL 匯入完整對話
    if (path === '/api/conversations/import-from-projects' && method === 'POST') {
      const body = await parseBody(req)
      const { projectPath, limit, incrementalOnly } = body as { projectPath?: string; limit?: number; incrementalOnly?: boolean }

      try {
        console.log('[ImportProjects] Starting import process...', { projectPath, limit })
        const projectsDir = join(homedir(), '.claude', 'projects')

        // 檢查 projects 目錄是否存在
        if (!existsSync(projectsDir)) {
          jsonResponse(res, {
            success: false,
            error: 'Projects directory not found: ' + projectsDir
          }, 404)
          return
        }

        // 確定要處理的 projects
        let projects: string[] = []
        if (projectPath) {
          projects = [projectPath]
        } else {
          // 掃描所有 project 目錄
          projects = readdirSync(projectsDir).filter(f => {
            const fullPath = join(projectsDir, f)
            try {
              const stat = statSync(fullPath)
              return stat.isDirectory()
            } catch {
              return false
            }
          })
        }

        console.log('[ImportProjects] Found projects:', projects.length)

        // 取得上次同步時間（如果是增量模式）
        let lastSync = '1970-01-01T00:00:00.000Z'
        if (incrementalOnly) {
          const syncStatus = db.prepare(
            'SELECT last_sync_timestamp FROM project_sync_status WHERE project_path = ?'
          ).get(projectPath || 'all') as { last_sync_timestamp: string } | undefined

          lastSync = syncStatus?.last_sync_timestamp || '1970-01-01T00:00:00.000Z'
          console.log(`[ImportProjects] Incremental mode enabled, lastSync: ${lastSync}`)
        }

        const lastSyncDate = new Date(lastSync)

        const allConversations: Array<{
          sessionId: string | null
          projectPath: string | undefined
          userPrompt: string
          assistantResponse: string | null
          executedAt: string
          inputTokens: number
          outputTokens: number
          totalTokens: number
          costUsd: number
          source: string
          category: string
        }> = []

        // 處理每個 project
        for (const project of projects) {
          const projectDir = join(projectsDir, project)

          try {
            // 讀取檔案並按修改時間排序（最新優先）
            const sessionFiles = readdirSync(projectDir)
              .filter(f => f.endsWith('.jsonl'))
              .map(f => ({
                name: f,
                mtime: statSync(join(projectDir, f)).mtime
              }))
              .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()) // 降序排序（最新優先）
              .filter(f => incrementalOnly ? f.mtime > lastSyncDate : true) // 增量模式：只處理新檔案
              .slice(0, limit || 100) // 限制檔案數量
              .map(f => f.name)

            console.log(`[ImportProjects] Processing project "${project}": ${sessionFiles.length} session files (incremental: ${incrementalOnly})`)

            for (const sessionFile of sessionFiles) {
              const sessionId = sessionFile.replace('.jsonl', '')

              try {
                const { userMessages, assistantMessages } = readProjectsJSONL(project, sessionId)
                let conversations = pairConversations(userMessages, assistantMessages, project)

                // 增量模式：過濾掉舊於上次同步時間的對話
                if (incrementalOnly) {
                  conversations = conversations.filter(conv => {
                    return new Date(conv.executedAt) > lastSyncDate
                  })
                }

                allConversations.push(...conversations)
              } catch (e) {
                console.error(`[ImportProjects] Failed to process session ${sessionId}:`, e)
              }
            }
          } catch (e) {
            console.error(`[ImportProjects] Failed to process project ${project}:`, e)
          }
        }

        console.log(`[ImportProjects] Parsed ${allConversations.length} total conversations`)

        // DEBUG: Log first conversation to verify data
        if (allConversations.length > 0) {
          console.log('[ImportProjects] First conversation sample:', {
            userPrompt: allConversations[0].userPrompt?.substring(0, 100),
            assistantResponse: allConversations[0].assistantResponse?.substring(0, 100),
            inputTokens: allConversations[0].inputTokens,
            outputTokens: allConversations[0].outputTokens
          })
        }

        // 儲存到資料庫（with duplicate detection）
        const insert = db.prepare(`
          INSERT OR IGNORE INTO conversations (
            session_id, project_path, user_prompt, assistant_response, executed_at, prompt_hash,
            category, source, input_tokens, output_tokens, total_tokens, cost_usd
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        let inserted = 0
        let duplicates = 0
        let failed = 0

        for (const conv of allConversations) {
          try {
            const hash = generatePromptHash(conv.userPrompt)
            const info = insert.run(
              conv.sessionId,
              conv.projectPath,
              conv.userPrompt,
              conv.assistantResponse,
              conv.executedAt,
              hash,
              conv.category,
              conv.source,
              conv.inputTokens,
              conv.outputTokens,
              conv.totalTokens,
              conv.costUsd
            )

            if (info.changes > 0) {
              inserted++
            } else {
              duplicates++
            }
          } catch (e) {
            console.error('[ImportProjects] Failed to insert:', e)
            failed++
          }
        }

        console.log(`[ImportProjects] Completed: Inserted ${inserted}, Duplicates ${duplicates}, Failed ${failed}`)

        // Update sync status after successful import
        if (inserted > 0 || duplicates > 0) {
          try {
            const upsertSync = db.prepare(`
              INSERT INTO project_sync_status (
                project_path,
                last_sync_timestamp,
                total_conversations_synced,
                last_sync_status,
                created_at,
                updated_at
              ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT(project_path) DO UPDATE SET
                last_sync_timestamp = excluded.last_sync_timestamp,
                total_conversations_synced = total_conversations_synced + excluded.total_conversations_synced,
                last_sync_status = excluded.last_sync_status,
                updated_at = CURRENT_TIMESTAMP
            `)

            const syncProjectPath = projectPath || 'all'
            const syncTimestamp = new Date().toISOString()

            upsertSync.run(
              syncProjectPath,
              syncTimestamp,
              inserted,
              'success'
            )

            console.log(`[ImportProjects] Updated sync status for ${syncProjectPath}: timestamp=${syncTimestamp}, synced=${inserted}`)
          } catch (syncError) {
            console.error('[ImportProjects] Failed to update sync status:', syncError)
            // Don't fail the whole import if sync status update fails
          }
        }

        jsonResponse(res, {
          success: true,
          data: {
            inserted,
            duplicates,
            failed,
            total: allConversations.length
          }
        }, 201)
      } catch (error) {
        console.error('[ImportProjects] Error:', error)
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Import failed'
        }, 500)
      }
      return
    }

    // POST /api/conversations - 保存對話
    if (path === '/api/conversations' && method === 'POST') {
      const body = await parseBody(req)
      const { conversations: conversationsToSave } = body as { conversations: Array<Record<string, unknown>> }

      if (!Array.isArray(conversationsToSave)) {
        jsonResponse(res, { success: false, error: 'Invalid conversations array' }, 400)
        return
      }

      console.log(`[SaveConversations] Attempting to save ${conversationsToSave.length} conversations`)

      try {
        const insert = db.prepare(`
          INSERT INTO conversations (
            execution_log_id, session_id, project_path, user_prompt, assistant_response,
            category, tags, source, executed_at, input_tokens, output_tokens, total_tokens,
            cost_usd, duration_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const ids: number[] = []
        let inserted = 0
        let failed = 0

        for (const conv of conversationsToSave) {
          try {
            // Handle both camelCase and snake_case property names
            const c = conv as Record<string, any>
            const executionLogId = c.execution_log_id || c.executionLogId || null
            const sessionId = c.session_id || c.sessionId || null
            const projectPath = c.project_path || c.projectPath || null
            const userPrompt = ((c.user_prompt || c.userPrompt || '') as string).trim() || '[Empty prompt]'
            const assistantResponse = c.assistant_response || c.assistantResponse || null
            const category = c.category || 'uncategorized'
            const tags = c.tags ? JSON.stringify(c.tags) : null
            const source = c.source || 'manual'
            const executedAt = c.executed_at || c.executedAt
            const inputTokens = c.input_tokens || c.inputTokens || 0
            const outputTokens = c.output_tokens || c.outputTokens || 0
            const totalTokens = c.total_tokens || c.totalTokens || 0
            const costUsd = c.cost_usd || c.costUsd || 0
            const durationMs = c.duration_ms || c.durationMs || 0

            // VALIDATION: Warn if userPrompt looks like a LLM response (data corruption detection)
            if (
              userPrompt.startsWith('Hi! I\'m Claude') ||
              userPrompt.includes('I\'m here to help') ||
              userPrompt.includes('I\'m Claude')
            ) {
              console.warn(
                '[SaveConversations] SUSPICIOUS: userPrompt looks like LLM response instead of user prompt:',
                userPrompt.substring(0, 200)
              )
            }

            // Log first conversation sample to verify data transformation
            if (inserted === 0 && failed === 0) {
              console.log('[SaveConversations] First conversation sample:', {
                userPrompt: userPrompt.substring(0, 80) + (userPrompt.length > 80 ? '...' : ''),
                source,
                executedAt,
                hasUserPrompt: !!userPrompt,
                userPromptLength: userPrompt.length,
                sessionId,
                category
              })
            }

            const result = insert.run(
              executionLogId,
              sessionId,
              projectPath,
              userPrompt,
              assistantResponse,
              category,
              tags,
              source,
              executedAt,
              inputTokens,
              outputTokens,
              totalTokens,
              costUsd,
              durationMs
            )
            ids.push(result.lastInsertRowid as number)
            inserted++
          } catch (e) {
            console.error('[SaveConversations] Failed to insert conversation:', e, 'Conversation:', JSON.stringify(conv).substring(0, 200))
            failed++
          }
        }

        console.log(`[SaveConversations] Completed: Inserted: ${inserted}, Failed: ${failed}`)

        jsonResponse(res, {
          success: true,
          data: {
            inserted,
            failed,
            ids
          }
        }, 201)
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save conversations'
        }, 500)
      }
      return
    }

    // PUT /api/conversations/:id - 更新對話
    if (path.match(/^\/api\/conversations\/\d+$/) && method === 'PUT') {
      const id = parseInt(path.split('/')[3])
      const body = await parseBody(req)
      const { category, tags } = body as { category?: string; tags?: string[] }

      try {
        const update = db.prepare(`
          UPDATE conversations
          SET category = ?, tags = ?, categorized_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        update.run(
          category || 'uncategorized',
          tags ? JSON.stringify(tags) : null,
          id
        )

        jsonResponse(res, { success: true, data: { id } })
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update conversation'
        }, 500)
      }
      return
    }

    // DELETE /api/conversations/:id - 刪除對話
    if (path.match(/^\/api\/conversations\/\d+$/) && method === 'DELETE') {
      const id = parseInt(path.split('/')[3])

      try {
        const del = db.prepare('DELETE FROM conversations WHERE id = ?')
        del.run(id)

        jsonResponse(res, { success: true, data: { id } })
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete conversation'
        }, 500)
      }
      return
    }

    // GET /api/config/history-paths - 獲取所有對話歷史路徑配置
    if (path === '/api/config/history-paths' && method === 'GET') {
      try {
        const defaultPath = join(homedir(), '.claude', 'history.jsonl')
        const pathsRow = db.prepare('SELECT value FROM config WHERE key = ?').get('history_paths') as { value: string } | undefined
        const indexRow = db.prepare('SELECT value FROM config WHERE key = ?').get('current_history_path_index') as { value: string } | undefined

        let paths: string[] = []
        let currentIndex = 0

        if (pathsRow?.value) {
          try {
            paths = JSON.parse(pathsRow.value)
          } catch (e) {
            console.error('Failed to parse paths config:', e)
            paths = []
          }
        }

        if (indexRow?.value) {
          currentIndex = parseInt(indexRow.value, 10)
        }

        // Ensure currentIndex is valid
        if (currentIndex >= paths.length) {
          currentIndex = 0
        }

        jsonResponse(res, {
          success: true,
          data: {
            paths: paths.length > 0 ? paths : [defaultPath],
            currentIndex,
            isConfigured: paths.length > 0
          }
        })
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get history paths configuration'
        }, 500)
      }
      return
    }

    // POST /api/config/history-paths - 添加新對話歷史路徑
    if (path === '/api/config/history-paths' && method === 'POST') {
      try {
        const body = await parseBody(req)
        const { path: newPath } = body as { path: string }

        if (!newPath || typeof newPath !== 'string' || newPath.trim() === '') {
          jsonResponse(res, { success: false, error: 'Invalid path provided' }, 400)
          return
        }

        // Validate the path exists
        if (!existsSync(newPath)) {
          jsonResponse(res, { success: false, error: `Path does not exist: ${newPath}` }, 400)
          return
        }

        // Get existing paths
        let paths: string[] = []
        const pathsRow = db.prepare('SELECT value FROM config WHERE key = ?').get('history_paths') as { value: string } | undefined
        if (pathsRow?.value) {
          try {
            paths = JSON.parse(pathsRow.value)
          } catch (e) {
            console.error('Failed to parse paths config:', e)
          }
        }

        // Add new path if not already exists
        if (!paths.includes(newPath)) {
          paths.push(newPath)
        }

        // Save updated paths
        const upsert = db.prepare(`
          INSERT INTO config (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `)
        upsert.run('history_paths', JSON.stringify(paths))

        jsonResponse(res, {
          success: true,
          data: {
            paths,
            message: 'History path added successfully'
          }
        }, 201)
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add history path'
        }, 500)
      }
      return
    }

    // DELETE /api/config/history-paths/:index - 刪除對話歷史路徑
    if (path.match(/^\/api\/config\/history-paths\/\d+$/) && method === 'DELETE') {
      try {
        const index = parseInt(path.split('/')[4], 10)

        // Get existing paths
        let paths: string[] = []
        const pathsRow = db.prepare('SELECT value FROM config WHERE key = ?').get('history_paths') as { value: string } | undefined
        if (pathsRow?.value) {
          try {
            paths = JSON.parse(pathsRow.value)
          } catch (e) {
            console.error('Failed to parse paths config:', e)
          }
        }

        if (index < 0 || index >= paths.length) {
          jsonResponse(res, { success: false, error: 'Invalid path index' }, 400)
          return
        }

        // Remove path at index
        paths.splice(index, 1)

        // Save updated paths
        const upsert = db.prepare(`
          INSERT INTO config (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `)
        upsert.run('history_paths', JSON.stringify(paths))

        // Update current index if necessary
        let currentIndex = 0
        const indexRow = db.prepare('SELECT value FROM config WHERE key = ?').get('current_history_path_index') as { value: string } | undefined
        if (indexRow?.value) {
          currentIndex = parseInt(indexRow.value, 10)
        }
        if (currentIndex >= paths.length && paths.length > 0) {
          currentIndex = paths.length - 1
        }
        db.prepare(`
          INSERT INTO config (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run('current_history_path_index', currentIndex.toString())

        jsonResponse(res, {
          success: true,
          data: {
            paths,
            currentIndex,
            message: 'History path deleted successfully'
          }
        })
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete history path'
        }, 500)
      }
      return
    }

    // PUT /api/config/history-paths/:index/select - 選擇對話歷史路徑
    if (path.match(/^\/api\/config\/history-paths\/\d+\/select$/) && method === 'PUT') {
      try {
        const index = parseInt(path.split('/')[4], 10)

        // Get existing paths
        let paths: string[] = []
        const pathsRow = db.prepare('SELECT value FROM config WHERE key = ?').get('history_paths') as { value: string } | undefined
        if (pathsRow?.value) {
          try {
            paths = JSON.parse(pathsRow.value)
          } catch (e) {
            console.error('Failed to parse paths config:', e)
          }
        }

        if (index < 0 || index >= paths.length) {
          jsonResponse(res, { success: false, error: 'Invalid path index' }, 400)
          return
        }

        // Save current index
        const upsert = db.prepare(`
          INSERT INTO config (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `)
        upsert.run('current_history_path_index', index.toString())

        jsonResponse(res, {
          success: true,
          data: {
            currentIndex: index,
            path: paths[index],
            message: 'History path selected successfully'
          }
        })
      } catch (error) {
        jsonResponse(res, {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to select history path'
        }, 500)
      }
      return
    }

    // GET /api/plans/imported - Get imported plans from database
    if (path === '/api/plans/imported' && method === 'GET') {
      try {
        const plans = db.prepare(`
          SELECT
            id, filename, title, frontmatter, file_hash, file_size,
            import_status, imported_at, updated_at, llm_analysis
          FROM plans
          ORDER BY imported_at DESC
        `).all()

        jsonResponse(res, { success: true, data: plans })
      } catch (e) {
        console.error('Failed to fetch imported plans:', e)
        jsonResponse(res, {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to fetch imported plans'
        }, 500)
      }
      return
    }

    // GET /api/plans/sync-status - Get plan sync status
    if (path === '/api/plans/sync-status' && method === 'GET') {
      try {
        const status = db.prepare(`
          SELECT * FROM plan_sync_status
          ORDER BY last_sync_timestamp DESC
          LIMIT 1
        `).get()

        jsonResponse(res, { success: true, data: status || null })
      } catch (e) {
        console.error('Failed to fetch sync status:', e)
        jsonResponse(res, {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to fetch sync status'
        }, 500)
      }
      return
    }

    // GET /api/plans - 取得計劃檔案列表
    if (path === '/api/plans' && method === 'GET') {
      try {
        const search = url.searchParams.get('search') || ''
        const startDate = url.searchParams.get('startDate') || ''
        const endDate = url.searchParams.get('endDate') || ''
        const sortBy = url.searchParams.get('sortBy') || 'date'

        const plansDir = join(homedir(), '.claude', 'plans')

        // Check if plans directory exists
        if (!existsSync(plansDir)) {
          jsonResponse(res, { success: true, data: [] })
          return
        }

        // Read all .md files
        const files = readdirSync(plansDir)
          .filter(f => f.endsWith('.md'))
          .map(filename => {
            const filePath = join(plansDir, filename)
            try {
              const stats = statSync(filePath)
              const content = readFileSync(filePath, 'utf-8')
              const frontmatter = parsePlanFrontmatter(content)

              return {
                filename,
                path: filePath,
                date: stats.mtime.toISOString(),
                size: stats.size,
                frontmatter,
                content
              }
            } catch (e) {
              console.error(`Failed to read plan file ${filename}:`, e)
              return null
            }
          })
          .filter((f): f is NonNullable<typeof f> => f !== null)

        // Apply filters
        let filtered = files

        if (search) {
          filtered = filtered.filter(f =>
            f.content.toLowerCase().includes(search.toLowerCase()) ||
            f.filename.toLowerCase().includes(search.toLowerCase())
          )
        }

        if (startDate) {
          const startTime = new Date(startDate).getTime()
          filtered = filtered.filter(f => new Date(f.date).getTime() >= startTime)
        }

        if (endDate) {
          const endTime = new Date(endDate).getTime()
          filtered = filtered.filter(f => new Date(f.date).getTime() <= endTime)
        }

        // Apply sorting
        if (sortBy === 'name') {
          filtered.sort((a, b) => a.filename.localeCompare(b.filename))
        } else if (sortBy === 'size') {
          filtered.sort((a, b) => b.size - a.size)
        } else {
          // Default: sort by date (newest first)
          filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        }

        jsonResponse(res, { success: true, data: filtered })
      } catch (e) {
        console.error('Failed to fetch plans:', e)
        jsonResponse(res, {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to fetch plans'
        }, 500)
      }
      return
    }

    // DELETE /api/plans/:filename - 刪除計劃檔案
    if (path.startsWith('/api/plans/') && method === 'DELETE') {
      try {
        const filename = decodeURIComponent(path.split('/').pop() || '')

        if (!filename.endsWith('.md')) {
          jsonResponse(res, { success: false, error: 'Invalid filename' }, 400)
          return
        }

        const plansDir = join(homedir(), '.claude', 'plans')
        const filePath = join(plansDir, filename)

        // Security: Ensure file is within plans directory
        if (!filePath.startsWith(plansDir)) {
          jsonResponse(res, { success: false, error: 'Invalid file path' }, 403)
          return
        }

        if (existsSync(filePath)) {
          unlinkSync(filePath)
          jsonResponse(res, { success: true })
        } else {
          jsonResponse(res, { success: false, error: 'File not found' }, 404)
        }
      } catch (e) {
        console.error('Failed to delete plan:', e)
        jsonResponse(res, {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to delete file'
        }, 500)
      }
      return
    }

    // ============ Deployment System API Routes ============

    // GET /api/deployment/builds - 獲取構建歷史
    if (path === '/api/deployment/builds' && method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
      const offset = parseInt(url.searchParams.get('offset') || '0')
      const builds = getBuildService().getBuildHistory(limit, offset)
      const total = (db.prepare('SELECT COUNT(*) as count FROM build_history').get() as any).count
      jsonResponse(res, { success: true, data: { builds, total, hasMore: offset + limit < total } })
      return
    }

    // GET /api/deployment/builds/:id - 獲取特定構建
    if (path.match(/^\/api\/deployment\/builds\/\d+$/) && method === 'GET') {
      const id = parseInt(path.split('/').pop()!)
      const build = getBuildService().getBuildById(id)
      jsonResponse(res, build ? { success: true, data: build } : { success: false, error: 'Build not found' }, build ? 200 : 404)
      return
    }

    // POST /api/deployment/builds/trigger - 手動觸發構建
    if (path === '/api/deployment/builds/trigger' && method === 'POST') {
      const body = await parseBody(req) as any
      const env = body?.environment as string | undefined
      getBuildService().executeBuild({
        triggerType: 'manual',
        triggerSource: (body?.reason as string | undefined) || 'Manual trigger from UI',
        environment: (env === 'production' || env === 'development' ? env : 'development') as 'development' | 'production'
      })
      jsonResponse(res, { success: true, message: 'Build triggered' }, 201)
      return
    }

    // GET /api/monitor/metrics/current - 獲取當前系統指標
    if (path === '/api/monitor/metrics/current' && method === 'GET') {
      const stmt = db.prepare('SELECT * FROM system_metrics ORDER BY timestamp DESC LIMIT 1')
      const metrics = stmt.get()
      jsonResponse(res, { success: true, data: metrics || {} })
      return
    }

    // GET /api/monitor/metrics/history - 獲取指標歷史
    if (path === '/api/monitor/metrics/history' && method === 'GET') {
      const range = url.searchParams.get('range') || '24h'
      const hours = range === '1h' ? 1 : range === '6h' ? 6 : range === '7d' ? 168 : 24
      const history = getSystemMonitor().getMetricsHistory(hours)
      jsonResponse(res, { success: true, data: history })
      return
    }

    // GET /api/monitor/git/status - 獲取 Git 狀態
    if (path === '/api/monitor/git/status' && method === 'GET') {
      const stmt = db.prepare('SELECT * FROM git_status_snapshots ORDER BY timestamp DESC LIMIT 1')
      const status = stmt.get()
      jsonResponse(res, { success: true, data: status || {} })
      return
    }

    // GET /api/dependencies/status - 獲取依賴狀態
    if (path === '/api/dependencies/status' && method === 'GET') {
      getDependencyService().checkUpdates().then(deps => {
        const summary = deps.reduce((acc, dep) => {
          acc.total++
          if (dep.update_type === 'major') acc.major++
          if (dep.update_type === 'minor') acc.minor++
          if (dep.update_type === 'patch') acc.patch++
          if (dep.has_security_issues) acc.security++
          return acc
        }, { total: 0, major: 0, minor: 0, patch: 0, security: 0 })

        jsonResponse(res, {
          success: true,
          data: { dependencies: deps, lastChecked: new Date().toISOString(), updatesSummary: summary }
        })
      }).catch(error => {
        jsonResponse(res, { success: false, error: String(error) }, 500)
      })
      return
    }

    // GET /api/deployment/config - 獲取部署配置
    if (path === '/api/deployment/config' && method === 'GET') {
      jsonResponse(res, {
        success: true,
        data: {
          fileWatchEnabled: process.env.FILE_WATCH_ENABLED !== 'false',
          fileWatchMode: process.env.FILE_WATCH_MODE || 'internal',
          debounceMs: parseInt(process.env.FILE_WATCH_DEBOUNCE_MS || '2000'),
          watchPaths: (process.env.WATCH_PATHS || 'src,server').split(','),
          monitorEnabled: process.env.ENABLE_MONITOR !== 'false',
          metricsInterval: parseInt(process.env.METRICS_INTERVAL_MS || '30000'),
          gitTrackingInterval: parseInt(process.env.GIT_TRACKING_INTERVAL_MS || '60000'),
          dependencyCheckSchedule: process.env.DEPENDENCY_CHECK_CRON || '0 9 * * *'
        }
      })
      return
    }

    // 404
    jsonResponse(res, { success: false, error: 'Not found' }, 404)

  } catch (error) {
    console.error('API Error:', error)
    jsonResponse(res, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, 500)
  }
}

// ============ Start Server ============
const PORT = process.env.PORT || 3001

const server = createServer(handleRequest)

// Initialize WebSocket
websocketService.initialize(server)

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         LLM Code Scheduler Server v1.0.0                   ║
╠════════════════════════════════════════════════════════════╣
║  🌐 Server running at http://localhost:${PORT}               ║
║  📁 Database: ${dbPath}
║  🕐 Timezone: Asia/Taipei                                  ║
╚════════════════════════════════════════════════════════════╝
  `)

  initializeSchedules()

  // Initialize deployment system services
  console.log('[Init] Initializing deployment system services...')
  try {
    // Initialize services
    initializeBuildService(db)
    initializeSystemMonitor(db).start()
    initializeGitTracker(db).start()
    initializeDependencyService(db)

    // Start file watcher if enabled
    const fileWatcher = initializeFileWatcher()
    if (process.env.FILE_WATCH_ENABLED !== 'false') {
      fileWatcher.start()
    }

    console.log('[Init] Deployment system services initialized')

    // Setup cleanup cron jobs
    const buildRetentionDays = parseInt(process.env.BUILD_RETENTION_DAYS || '7')
    const metricsRetentionDays = parseInt(process.env.METRICS_RETENTION_DAYS || '3')

    // Daily cleanup at 2 AM
    cron.schedule('0 2 * * *', () => {
      console.log('[Cleanup] Starting cleanup tasks...')
      getBuildService().cleanupOldBuilds(buildRetentionDays)
      getSystemMonitor().cleanupOldMetrics(metricsRetentionDays)
    })

    console.log('[Init] Cleanup tasks scheduled')
  } catch (error) {
    console.error('[Init] Error initializing deployment system:', error)
  }
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...')
  scheduledTasks.forEach(task => task.stop())
  db.close()
  server.close()
  process.exit(0)
})
