/**
 * Request handler with AbortController support and retry logic
 * Handles network errors gracefully with exponential backoff
 */

import { logger } from './logger'
import toast from 'react-hot-toast'
import { trackAbortError, trackNetworkRetry } from './metrics/error-handling-metrics'

export interface RequestOptions extends RequestInit {
    signal?: AbortSignal
    retries?: number
    retryDelay?: number
    onRetry?: (attempt: number) => void
    showUserNotification?: boolean // Show toast notification on final failure
}

export interface ErrorContext {
    url: string
    method: string
    attempt: number
    timestamp: Date
    userId?: string
    errorType: 'network' | 'abort' | 'server' | 'unknown'
}

export interface NetworkError extends Error {
    context: ErrorContext
    isRetryable: boolean
}

/**
 * Check if error is an AbortError
 * AbortErrors are expected when requests are cancelled and should not be logged
 */
export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
}

/**
 * Check if error is a network error that should be retried
 */
export function isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    const message = error.message.toLowerCase()
    return (
        message.includes('network') ||
        message.includes('fetch') ||
        message.includes('failed to fetch') ||
        error.name === 'NetworkError' ||
        error.name === 'TypeError'
    )
}

/**
 * Determine if error should be logged
 * AbortErrors are expected and should not be logged
 */
export function shouldLogError(error: unknown): boolean {
    return !isAbortError(error)
}

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create error context for logging
 */
function createErrorContext(
    url: string,
    method: string,
    attempt: number,
    error: unknown
): ErrorContext {
    let errorType: ErrorContext['errorType'] = 'unknown'

    if (isAbortError(error)) {
        errorType = 'abort'
    } else if (isNetworkError(error)) {
        errorType = 'network'
    } else if (error instanceof Error && error.message.includes('server')) {
        errorType = 'server'
    }

    return {
        url,
        method,
        attempt,
        timestamp: new Date(),
        errorType
    }
}

/**
 * Fetch with AbortController support and retry logic
 *
 * Features:
 * - Automatic retry with exponential backoff for network errors
 * - Silent cancellation for AbortErrors (no logging)
 * - Structured error logging with context
 * - User notifications after exhausting retries
 * - Configurable retry attempts and delays
 *
 * @param url - URL to fetch
 * @param options - Request options including retry configuration
 * @returns Promise with response data
 * @throws Error if all retry attempts fail or request is aborted
 */
export async function fetchWithAbort<T = unknown>(
    url: string,
    options: RequestOptions = {}
): Promise<T> {
    const {
        signal,
        retries = 3,
        retryDelay = 1000,
        onRetry,
        showUserNotification = false,
        ...fetchOptions
    } = options

    const method = fetchOptions.method || 'GET'

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            // Track successful retry if this wasn't the first attempt
            if (attempt > 0) {
                trackNetworkRetry({
                    url,
                    attempt,
                    success: true,
                    errorType: 'network'
                })
            }

            // Try to parse as JSON, fallback to text
            const contentType = response.headers.get('content-type')
            if (contentType?.includes('application/json')) {
                return await response.json() as T
            }

            return await response.text() as T
        } catch (error) {
            const context = createErrorContext(url, method, attempt, error)

            // Don't log or retry AbortErrors - they are expected
            if (isAbortError(error)) {
                // Track AbortError occurrence for metrics
                trackAbortError({
                    url,
                    reason: 'request_cancelled'
                })
                throw error
            }

            // Retry on network errors
            if (attempt < retries && isNetworkError(error)) {
                const delayMs = retryDelay * Math.pow(2, attempt)

                // Track retry attempt
                trackNetworkRetry({
                    url,
                    attempt: attempt + 1,
                    success: false,
                    errorType: context.errorType
                })

                logger.warn('Request failed, retrying', {
                    url,
                    attempt: attempt + 1,
                    maxRetries: retries,
                    nextRetryIn: `${delayMs}ms`,
                    error: error instanceof Error ? error.message : String(error)
                })

                onRetry?.(attempt + 1)
                await delay(delayMs)
                continue
            }

            // Log unexpected errors with full context
            if (shouldLogError(error)) {
                logger.error(
                    'Request failed after all retries',
                    error,
                    {
                        ...context,
                        totalAttempts: attempt + 1,
                        maxRetries: retries
                    }
                )

                // Show user notification if requested and all retries exhausted
                if (showUserNotification && isNetworkError(error)) {
                    toast.error('Проблема с подключением. Проверьте интернет и попробуйте снова.')
                }
            }

            throw error
        }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error('Request failed after all retries')
}

/**
 * Create a NetworkError with context
 */
export function createNetworkError(
    message: string,
    context: ErrorContext,
    isRetryable = true
): NetworkError {
    const error = new Error(message) as NetworkError
    error.name = 'NetworkError'
    error.context = context
    error.isRetryable = isRetryable
    return error
}
