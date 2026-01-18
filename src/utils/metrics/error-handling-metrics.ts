/**
 * Error Handling Metrics
 * Centralized metrics collection for error handling improvements
 *
 * Tracks:
 * - AbortError occurrence rate
 * - RLS policy violations
 * - Network retry success rate
 * - Image fallback usage
 * - Prometheus connection status
 *
 * **Validates: Requirements 3.5, 4.5**
 */

import { metricsCollector } from './collector'
import { prometheusCollector } from './prometheus-collector'

/**
 * Track AbortError occurrence
 * Records when a request is cancelled via AbortController
 *
 * @param context - Additional context about the abort
 */
export function trackAbortError(context: {
    url?: string
    component?: string
    reason?: string
}): void {
    try {
        metricsCollector.counter(
            'abort_errors_total',
            'Total number of AbortErrors (cancelled requests)',
            {
                component: context.component || 'unknown',
                reason: context.reason || 'user_navigation'
            }
        )
    } catch (error) {
        // Silently ignore metrics errors
    }
}

/**
 * Track RLS policy violation
 * Records when a database operation fails due to RLS policy
 *
 * @param context - Details about the violation
 */
export function trackRLSViolation(context: {
    table: string
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
    userId?: string
    role?: string
}): void {
    try {
        metricsCollector.counter(
            'rls_violations_total',
            'Total number of RLS policy violations',
            {
                table: context.table,
                operation: context.operation,
                role: context.role || 'unknown'
            }
        )
    } catch (error) {
        // Silently ignore metrics errors
    }
}

/**
 * Track network retry attempt
 * Records when a network request is retried
 *
 * @param context - Details about the retry
 */
export function trackNetworkRetry(context: {
    url: string
    attempt: number
    success: boolean
    errorType?: string
}): void {
    try {
        // Track retry attempts
        metricsCollector.counter(
            'network_retries_total',
            'Total number of network retry attempts',
            {
                success: context.success ? 'true' : 'false',
                attempt: String(context.attempt),
                error_type: context.errorType || 'unknown'
            }
        )

        // Track success rate separately
        if (context.success) {
            metricsCollector.counter(
                'network_retry_success_total',
                'Total number of successful network retries',
                {
                    attempt: String(context.attempt)
                }
            )
        }
    } catch (error) {
        // Silently ignore metrics errors
    }
}

/**
 * Track image fallback usage
 * Records when an image fails to load and fallback is used
 *
 * @param context - Details about the fallback
 */
export function trackImageFallback(context: {
    originalUrl: string
    fallbackUrl: string
    reason: 'timeout' | 'error' | 'invalid' | 'not_found'
    component?: string
}): void {
    try {
        metricsCollector.counter(
            'image_fallback_total',
            'Total number of image fallback usages',
            {
                reason: context.reason,
                component: context.component || 'unknown'
            }
        )
    } catch (error) {
        // Silently ignore metrics errors
    }
}

/**
 * Track Prometheus connection status
 * Records the current connection state to Prometheus Pushgateway
 *
 * @param connected - Whether Prometheus is currently connected
 */
export function trackPrometheusConnection(connected: boolean): void {
    try {
        metricsCollector.gauge(
            'prometheus_connection_status',
            'Prometheus Pushgateway connection status (1=connected, 0=disconnected)',
            connected ? 1 : 0,
            {}
        )
    } catch (error) {
        // Silently ignore metrics errors
    }
}

/**
 * Track Prometheus connection recovery
 * Records when connection to Prometheus is restored after failure
 */
export function trackPrometheusRecovery(): void {
    try {
        metricsCollector.counter(
            'prometheus_recovery_total',
            'Total number of Prometheus connection recoveries',
            {}
        )
    } catch (error) {
        // Silently ignore metrics errors
    }
}

/**
 * Get current error handling metrics summary
 * Useful for monitoring dashboards and health checks
 *
 * @returns Summary of error handling metrics
 */
export function getErrorHandlingMetricsSummary(): {
    abortErrors: number
    rlsViolations: number
    networkRetries: number
    networkRetrySuccesses: number
    imageFallbacks: number
    prometheusConnected: boolean
} {
    const abortErrorMetrics = metricsCollector.getMetricsByName('abort_errors_total')
    const rlsViolationMetrics = metricsCollector.getMetricsByName('rls_violations_total')
    const networkRetryMetrics = metricsCollector.getMetricsByName('network_retries_total')
    const networkRetrySuccessMetrics = metricsCollector.getMetricsByName('network_retry_success_total')
    const imageFallbackMetrics = metricsCollector.getMetricsByName('image_fallback_total')
    const prometheusStatusMetrics = metricsCollector.getMetricsByName('prometheus_connection_status')

    const sumMetrics = (metrics: Array<{ value: number }>) =>
        metrics.reduce((sum, m) => sum + m.value, 0)

    return {
        abortErrors: sumMetrics(abortErrorMetrics),
        rlsViolations: sumMetrics(rlsViolationMetrics),
        networkRetries: sumMetrics(networkRetryMetrics),
        networkRetrySuccesses: sumMetrics(networkRetrySuccessMetrics),
        imageFallbacks: sumMetrics(imageFallbackMetrics),
        prometheusConnected: prometheusStatusMetrics.length > 0 && prometheusStatusMetrics[0].value === 1
    }
}

/**
 * Push all error handling metrics to Prometheus
 * Should be called periodically to sync metrics
 */
export async function pushErrorHandlingMetrics(): Promise<void> {
    try {
        const metrics = metricsCollector.getAllMetrics()
        const errorHandlingMetrics = metrics.filter(m =>
            m.name.includes('abort_errors') ||
            m.name.includes('rls_violations') ||
            m.name.includes('network_retries') ||
            m.name.includes('image_fallback') ||
            m.name.includes('prometheus_connection') ||
            m.name.includes('prometheus_recovery')
        )

        if (errorHandlingMetrics.length > 0) {
            await prometheusCollector.pushMetrics(
                errorHandlingMetrics.map(m => ({
                    name: m.name,
                    value: m.value,
                    labels: m.labels
                })),
                'error_handling_metrics'
            )
        }
    } catch (error) {
        // Silently ignore push errors
    }
}
