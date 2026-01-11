/**
 * Debounce utility for preventing frequent function calls
 * Useful for file watching, API calls, etc.
 */

export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void
  cancel(): void
  flush(): void
}

/**
 * Create a debounced function that delays execution
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - Additional options
 * @returns A debounced function
 *
 * @example
 * const debouncedSave = debounce(saveFile, 1000)
 * debouncedSave('data.txt') // Will call saveFile after 1 second
 * debouncedSave('data.txt') // Cancels previous call, reschedules
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: {
    leading?: boolean
    trailing?: boolean
    maxWait?: number
  }
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | null = null
  let maxTimeout: NodeJS.Timeout | null = null
  let lastArgs: any[] | null = null
  let lastThis: any = null
  let result: any = undefined
  let lastCallTime: number | null = null
  let lastInvokeTime = 0
  let leading = options?.leading ?? false
  let trailing = options?.trailing ?? true
  let maxWait = options?.maxWait

  const shouldInvoke = (time: number) => {
    const timeSinceLastCall = time - (lastCallTime ?? 0)
    const timeSinceLastInvoke = time - lastInvokeTime

    return (
      lastCallTime === null ||
      timeSinceLastCall >= wait ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    )
  }

  const invokeFunc = (time: number) => {
    const args = lastArgs
    const thisArg = lastThis

    lastArgs = lastThis = null

    if (args) {
      lastInvokeTime = time
      result = func.apply(thisArg, args)
    }
    return result
  }

  const debounced = function (this: any, ...args: any[]) {
    const time = Date.now()
    const isInvoking = shouldInvoke(time)

    lastArgs = args
    lastThis = this
    lastCallTime = time

    if (timeout !== null) {
      clearTimeout(timeout)
    }

    if (maxWait !== undefined && maxTimeout !== null) {
      clearTimeout(maxTimeout)
    }

    if (isInvoking) {
      if (leading) {
        result = invokeFunc(time)
      }
      if (maxWait !== undefined && maxTimeout === null) {
        maxTimeout = setTimeout(() => {
          if (shouldInvoke(Date.now())) {
            debounced.flush()
          }
        }, maxWait)
      }
    }

    timeout = setTimeout(() => {
      if (trailing) {
        invokeFunc(Date.now())
      }
      timeout = null
      maxTimeout = null
      lastArgs = lastThis = null
    }, wait)
  } as DebouncedFunction<T>

  debounced.cancel = function () {
    if (timeout !== null) {
      clearTimeout(timeout)
    }
    if (maxTimeout !== null) {
      clearTimeout(maxTimeout)
    }
    lastInvokeTime = 0
    lastArgs = lastCallTime = lastThis = timeout = maxTimeout = null
  }

  debounced.flush = function () {
    return timeout === null ? result : invokeFunc(Date.now())
  }

  return debounced
}

/**
 * Create a throttled function that limits execution frequency
 * @param func - The function to throttle
 * @param limit - The minimum milliseconds between executions
 * @returns A throttled function
 *
 * @example
 * const throttledScroll = throttle(handleScroll, 100)
 * window.addEventListener('scroll', throttledScroll)
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false
  let lastRun = 0

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now()
    if (now - lastRun > limit) {
      func.apply(this, args)
      lastRun = now
    } else if (!inThrottle) {
      inThrottle = true
      setTimeout(() => {
        func.apply(this, args)
        lastRun = Date.now()
        inThrottle = false
      }, limit - (now - lastRun))
    }
  }
}

/**
 * Create a debounce function with immediate invocation option
 * @param func - The function to debounce
 * @param wait - The debounce delay in milliseconds
 * @param immediate - If true, invoke immediately, then debounce subsequent calls
 * @returns A debounced function
 *
 * @example
 * const debouncedSearch = debounceImmediate(performSearch, 500, true)
 * debouncedSearch('query') // Executes immediately
 * debouncedSearch('query2') // Debounced until 500ms passes without calls
 */
export function debounceImmediate<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate: boolean = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(this: any, ...args: Parameters<T>) {
    const later = () => {
      timeout = null
      if (!immediate) func.apply(this, args)
    }

    const callNow = immediate && !timeout
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(later, wait)

    if (callNow) func.apply(this, args)
  }
}

/**
 * Remove all pending debounced calls for a function
 * @param debounced - The debounced function
 */
export function cancelDebounce<T extends DebouncedFunction<any>>(debounced: T) {
  debounced.cancel()
}
