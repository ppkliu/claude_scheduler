/**
 * Unified process execution utility
 * Handles spawning child processes with proper error handling and output capture
 */

import { spawn, spawnSync, SpawnOptions } from 'child_process'

export interface ExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
  output: string
  success: boolean
  duration: number
}

export interface ExecutionOptions extends SpawnOptions {
  timeout?: number
  encoding?: string
  returnStderr?: boolean
  captureOutput?: boolean
}

/**
 * Execute a command asynchronously and stream output to callback
 */
export function executeCommandAsync(
  command: string,
  args: string[],
  onOutput?: (chunk: string, isError?: boolean) => void,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const spawnOptions: SpawnOptions = {
      cwd: process.cwd(),
      shell: true,
      ...options
    }

    let stdout = ''
    let stderr = ''

    try {
      const childProcess = spawn(command, args, spawnOptions)

      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          const chunk = data.toString()
          stdout += chunk

          if (onOutput) {
            onOutput(chunk)
          }
        })
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          const chunk = data.toString()
          stderr += chunk

          if (onOutput) {
            onOutput(chunk, true)
          }
        })
      }

      childProcess.on('error', (error) => {
        reject(error)
      })

      childProcess.on('close', (exitCode) => {
        const duration = Date.now() - startTime

        resolve({
          exitCode: exitCode || 0,
          stdout,
          stderr,
          output: stdout + stderr,
          success: exitCode === 0,
          duration
        })
      })

      // Handle timeout
      if (options?.timeout) {
        setTimeout(() => {
          childProcess.kill('SIGTERM')
          setTimeout(() => {
            childProcess.kill('SIGKILL')
          }, 1000)
        }, options.timeout)
      }
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Execute a command synchronously
 */
export function executeCommandSync(
  command: string,
  args: string[],
  options?: ExecutionOptions
): ExecutionResult {
  const startTime = Date.now()

  try {
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      encoding: 'utf-8' as const,
      ...options
    } as any)

    const duration = Date.now() - startTime

    return {
      exitCode: result.status || 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      output: (result.stdout || '') + (result.stderr || ''),
      success: result.status === 0,
      duration
    }
  } catch (error) {
    throw error
  }
}

/**
 * Check if a command exists in PATH
 */
export function commandExists(command: string): boolean {
  try {
    const result = spawnSync('which', [command], {
      stdio: 'ignore'
    })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Execute npm command
 */
export async function executeNpm(
  args: string[],
  onOutput?: (chunk: string, isError?: boolean) => void,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  // Check if npm exists, otherwise use npx
  const command = commandExists('npm') ? 'npm' : 'npx'
  return executeCommandAsync(command, args, onOutput, {
    ...options,
    env: {
      ...process.env,
      // Suppress npm progress bars
      npm_config_progress: 'false'
    }
  })
}

/**
 * Execute git command
 */
export function executeGit(args: string[]): ExecutionResult {
  return executeCommandSync('git', args, {
    cwd: process.cwd()
  })
}

/**
 * Execute npx command (ensures local version is used)
 */
export async function executeNpx(
  args: string[],
  onOutput?: (chunk: string, isError?: boolean) => void,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  return executeCommandAsync('npx', args, onOutput, {
    ...options,
    env: {
      ...process.env,
      // Use local packages
      npm_config_prefer_offline: 'true'
    }
  })
}

/**
 * Build project using vite (via npx)
 */
export async function executeBuild(
  environment: 'development' | 'production' = 'production',
  onOutput?: (chunk: string, isError?: boolean) => void,
  timeout: number = 300000 // 5 minutes default
): Promise<ExecutionResult> {
  console.log(`[Build] Starting ${environment} build...`)

  return executeNpx(['vite', 'build'], onOutput, {
    timeout,
    env: {
      ...process.env,
      NODE_ENV: environment
    }
  })
}

/**
 * Parse command output for errors
 */
export function parseBuildErrors(output: string): string[] {
  const errors: string[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    if (line.includes('error') || line.includes('ERROR')) {
      errors.push(line)
    }
  }

  return errors
}

/**
 * Extract token usage from build output (if applicable)
 */
export function extractTokensFromOutput(output: string): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
} {
  const defaultTokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  // Look for token information in output
  const tokenMatch = output.match(/tokens?:?\s*(\d+)/gi)
  if (tokenMatch && tokenMatch.length >= 2) {
    return {
      inputTokens: parseInt(tokenMatch[0]) || 0,
      outputTokens: parseInt(tokenMatch[1]) || 0,
      totalTokens: (parseInt(tokenMatch[0]) || 0) + (parseInt(tokenMatch[1]) || 0)
    }
  }

  return defaultTokens
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
