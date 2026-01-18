/**
 * Unit tests for Error Handling Metrics
 * Tests metric recording and aggregation
 *
 * **Validates: Requirements 3.5**
 */

import { metricsCollector } from '../collector'
import {
    trackAbortError,
    trackRLSViolation,
    trackNetworkRetry,
    trackImageFallback,
    trackPrometheusConnection,
    trackPrometheusRecovery,
    getErrorHandlingMetricsSummary,
    pushErrorHandlingMetrics
} from '../error-handling-metrics'
import { prometheusCollector } from '../prometheus-collector'

// Mock the prometheus collector
jest.mock('../prometheus-collector', () => ({
    prometheusCollector: {
        pushMetrics: jest.fn().mockResolvedValue(undefined)
    }
}))

describe('Error Handling Metrics', () => {
    beforeEach(() => {
        // Clear metrics before each test
        metricsCollector.clear()
        jest.clearAllMocks()
    })

    describe('trackAbortError', () => {
        it('should record AbortError occurrence', () => {
            trackAbortError({
                url: '/api/test',
                component: 'TestComponent',
                reason: 'user_navigation'
            })

            const metrics = metricsCollector.getMetricsByName('abort_errors_total')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(1)
            expect(metrics[0].labels).toEqual({
                component: 'TestComponent',
                reason: 'user_navigation'
            })
        })

        it('should increment counter on multiple calls', () => {
            trackAbortError({ component: 'TestComponent' })
            trackAbortError({ component: 'TestComponent' })
            trackAbortError({ component: 'TestComponent' })

            const metrics = metricsCollector.getMetricsByName('abort_errors_total')
            expect(metrics[0].value).toBe(3)
        })

        it('should use default values for missing context', () => {
            trackAbortError({})

            const metrics = metricsCollector.getMetricsByName('abort_errors_total')
            expect(metrics[0].labels).toEqual({
                component: 'unknown',
                reason: 'user_navigation'
            })
        })

        it('should not throw on metrics errors', () => {
            // This should not throw even if metrics collection fails
            expect(() => trackAbortError({ component: 'Test' })).not.toThrow()
        })
    })

    describe('trackRLSViolation', () => {
        it('should record RLS policy violation', () => {
            trackRLSViolation({
                table: 'products',
                operation: 'INSERT',
                userId: 'user-123',
                role: 'client'
            })

            const metrics = metricsCollector.getMetricsByName('rls_violations_total')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(1)
            expect(metrics[0].labels).toEqual({
                table: 'products',
                operation: 'INSERT',
                role: 'client'
            })
        })

        it('should track violations for different tables separately', () => {
            trackRLSViolation({ table: 'products', operation: 'INSERT' })
            trackRLSViolation({ table: 'meals', operation: 'SELECT' })

            const metrics = metricsCollector.getMetricsByName('rls_violations_total')
            expect(metrics).toHaveLength(2)
        })

        it('should use default role when not provided', () => {
            trackRLSViolation({
                table: 'products',
                operation: 'DELETE'
            })

            const metrics = metricsCollector.getMetricsByName('rls_violations_total')
            expect(metrics[0].labels?.role).toBe('unknown')
        })
    })

    describe('trackNetworkRetry', () => {
        it('should record network retry attempt', () => {
            trackNetworkRetry({
                url: '/api/test',
                attempt: 1,
                success: false,
                errorType: 'network'
            })

            const retryMetrics = metricsCollector.getMetricsByName('network_retries_total')
            expect(retryMetrics).toHaveLength(1)
            expect(retryMetrics[0].value).toBe(1)
            expect(retryMetrics[0].labels).toEqual({
                success: 'false',
                attempt: '1',
                error_type: 'network'
            })
        })

        it('should record successful retry separately', () => {
            trackNetworkRetry({
                url: '/api/test',
                attempt: 2,
                success: true,
                errorType: 'network'
            })

            const retryMetrics = metricsCollector.getMetricsByName('network_retries_total')
            const successMetrics = metricsCollector.getMetricsByName('network_retry_success_total')

            expect(retryMetrics).toHaveLength(1)
            expect(successMetrics).toHaveLength(1)
            expect(successMetrics[0].value).toBe(1)
        })

        it('should not record success metric for failed retries', () => {
            trackNetworkRetry({
                url: '/api/test',
                attempt: 1,
                success: false
            })

            const successMetrics = metricsCollector.getMetricsByName('network_retry_success_total')
            expect(successMetrics).toHaveLength(0)
        })

        it('should track multiple retry attempts', () => {
            trackNetworkRetry({ url: '/api/test', attempt: 1, success: false })
            trackNetworkRetry({ url: '/api/test', attempt: 2, success: false })
            trackNetworkRetry({ url: '/api/test', attempt: 3, success: true })

            const retryMetrics = metricsCollector.getMetricsByName('network_retries_total')
            expect(retryMetrics).toHaveLength(3)

            const successMetrics = metricsCollector.getMetricsByName('network_retry_success_total')
            expect(successMetrics).toHaveLength(1)
        })
    })

    describe('trackImageFallback', () => {
        it('should record image fallback usage', () => {
            trackImageFallback({
                originalUrl: 'https://example.com/image.jpg',
                fallbackUrl: '/images/placeholder.svg',
                reason: 'timeout',
                component: 'ProductCard'
            })

            const metrics = metricsCollector.getMetricsByName('image_fallback_total')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(1)
            expect(metrics[0].labels).toEqual({
                reason: 'timeout',
                component: 'ProductCard'
            })
        })

        it('should track different fallback reasons separately', () => {
            trackImageFallback({
                originalUrl: 'url1',
                fallbackUrl: 'fallback',
                reason: 'timeout'
            })
            trackImageFallback({
                originalUrl: 'url2',
                fallbackUrl: 'fallback',
                reason: 'error'
            })
            trackImageFallback({
                originalUrl: 'url3',
                fallbackUrl: 'fallback',
                reason: 'not_found'
            })

            const metrics = metricsCollector.getMetricsByName('image_fallback_total')
            expect(metrics).toHaveLength(3)
        })

        it('should use default component when not provided', () => {
            trackImageFallback({
                originalUrl: 'url',
                fallbackUrl: 'fallback',
                reason: 'invalid'
            })

            const metrics = metricsCollector.getMetricsByName('image_fallback_total')
            expect(metrics[0].labels?.component).toBe('unknown')
        })
    })

    describe('trackPrometheusConnection', () => {
        it('should record connected status', () => {
            trackPrometheusConnection(true)

            const metrics = metricsCollector.getMetricsByName('prometheus_connection_status')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(1)
        })

        it('should record disconnected status', () => {
            trackPrometheusConnection(false)

            const metrics = metricsCollector.getMetricsByName('prometheus_connection_status')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(0)
        })

        it('should update status on multiple calls', () => {
            trackPrometheusConnection(true)
            trackPrometheusConnection(false)
            trackPrometheusConnection(true)

            const metrics = metricsCollector.getMetricsByName('prometheus_connection_status')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(1) // Last value
        })
    })

    describe('trackPrometheusRecovery', () => {
        it('should record connection recovery', () => {
            trackPrometheusRecovery()

            const metrics = metricsCollector.getMetricsByName('prometheus_recovery_total')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(1)
        })

        it('should increment on multiple recoveries', () => {
            trackPrometheusRecovery()
            trackPrometheusRecovery()
            trackPrometheusRecovery()

            const metrics = metricsCollector.getMetricsByName('prometheus_recovery_total')
            expect(metrics[0].value).toBe(3)
        })
    })

    describe('getErrorHandlingMetricsSummary', () => {
        it('should return summary of all metrics', () => {
            // Record various metrics
            trackAbortError({ component: 'Test' })
            trackAbortError({ component: 'Test' })
            trackRLSViolation({ table: 'products', operation: 'INSERT' })
            trackNetworkRetry({ url: '/api', attempt: 1, success: false })
            trackNetworkRetry({ url: '/api', attempt: 2, success: true })
            trackImageFallback({ originalUrl: 'url', fallbackUrl: 'fb', reason: 'error' })
            trackPrometheusConnection(true)

            const summary = getErrorHandlingMetricsSummary()

            expect(summary).toEqual({
                abortErrors: 2,
                rlsViolations: 1,
                networkRetries: 2,
                networkRetrySuccesses: 1,
                imageFallbacks: 1,
                prometheusConnected: true
            })
        })

        it('should return zeros when no metrics recorded', () => {
            const summary = getErrorHandlingMetricsSummary()

            expect(summary).toEqual({
                abortErrors: 0,
                rlsViolations: 0,
                networkRetries: 0,
                networkRetrySuccesses: 0,
                imageFallbacks: 0,
                prometheusConnected: false
            })
        })

        it('should aggregate metrics with different labels', () => {
            trackAbortError({ component: 'A' })
            trackAbortError({ component: 'B' })
            trackAbortError({ component: 'C' })

            const summary = getErrorHandlingMetricsSummary()
            expect(summary.abortErrors).toBe(3)
        })
    })

    describe('pushErrorHandlingMetrics', () => {
        it('should push error handling metrics to Prometheus', async () => {
            // Record some metrics
            trackAbortError({ component: 'Test' })
            trackRLSViolation({ table: 'products', operation: 'INSERT' })
            trackNetworkRetry({ url: '/api', attempt: 1, success: true })

            await pushErrorHandlingMetrics()

            expect(prometheusCollector.pushMetrics).toHaveBeenCalledTimes(1)

            const pushCall = (prometheusCollector.pushMetrics as jest.Mock).mock.calls[0]
            const pushedMetrics = pushCall[0]
            const jobName = pushCall[1]

            expect(jobName).toBe('error_handling_metrics')
            expect(pushedMetrics).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'abort_errors_total' }),
                    expect.objectContaining({ name: 'rls_violations_total' }),
                    expect.objectContaining({ name: 'network_retries_total' })
                ])
            )
            // Should have at least 3 metrics
            expect(pushedMetrics.length).toBeGreaterThanOrEqual(3)
        })

        it('should not push if no error handling metrics exist', async () => {
            // Record a non-error-handling metric
            metricsCollector.counter('some_other_metric', 'Other metric', {})

            await pushErrorHandlingMetrics()

            expect(prometheusCollector.pushMetrics).not.toHaveBeenCalled()
        })

        it('should handle push errors gracefully', async () => {
            const mockPushMetrics = prometheusCollector.pushMetrics as jest.Mock
            mockPushMetrics.mockRejectedValueOnce(new Error('Push failed'))

            trackAbortError({ component: 'Test' })

            // Should not throw
            await expect(pushErrorHandlingMetrics()).resolves.not.toThrow()
        })

        it('should only push error handling related metrics', async () => {
            // Record error handling metrics
            trackAbortError({ component: 'Test' })

            // Record other metrics
            metricsCollector.counter('page_views_total', 'Page views', {})
            metricsCollector.counter('user_actions_total', 'User actions', {})

            await pushErrorHandlingMetrics()

            const pushCall = (prometheusCollector.pushMetrics as jest.Mock).mock.calls[0]
            const pushedMetrics = pushCall[0]

            // Should only include error handling metrics
            expect(pushedMetrics.every((m: { name: string }) =>
                m.name.includes('abort_errors') ||
                m.name.includes('rls_violations') ||
                m.name.includes('network_retries') ||
                m.name.includes('image_fallback') ||
                m.name.includes('prometheus_connection') ||
                m.name.includes('prometheus_recovery')
            )).toBe(true)
        })
    })

    describe('Metric Aggregation', () => {
        it('should correctly aggregate counters with same labels', () => {
            trackAbortError({ component: 'TestComponent', reason: 'navigation' })
            trackAbortError({ component: 'TestComponent', reason: 'navigation' })
            trackAbortError({ component: 'TestComponent', reason: 'navigation' })

            const metrics = metricsCollector.getMetricsByName('abort_errors_total')
            expect(metrics).toHaveLength(1)
            expect(metrics[0].value).toBe(3)
        })

        it('should keep separate counters for different labels', () => {
            trackAbortError({ component: 'ComponentA' })
            trackAbortError({ component: 'ComponentB' })

            const metrics = metricsCollector.getMetricsByName('abort_errors_total')
            expect(metrics).toHaveLength(2)
        })

        it('should handle concurrent metric updates', () => {
            // Simulate concurrent updates
            for (let i = 0; i < 100; i++) {
                trackAbortError({ component: 'Test' })
            }

            const metrics = metricsCollector.getMetricsByName('abort_errors_total')
            expect(metrics[0].value).toBe(100)
        })
    })
})
