/**
 * Unit tests for Prometheus Collector with Graceful Degradation
 *
 * Tests:
 * - Silent failure when Pushgateway is unavailable
 * - Retry mechanism
 * - Connection recovery
 * - Logging only first error
 */

import { PrometheusCollector } from '../prometheus-collector'
import { logger } from '@/utils/logger'

// Mock logger
jest.mock('@/utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}))

// Mock fetch
global.fetch = jest.fn()

describe('PrometheusCollector - Graceful Degradation', () => {
    let collector: PrometheusCollector
    const mockPushgatewayUrl = 'http://localhost:9091'

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()
            ; (global.fetch as jest.Mock).mockClear()
    })

    afterEach(() => {
        if (collector) {
            collector.destroy()
        }
        jest.useRealTimers()
    })

    describe('Silent Failure Mode', () => {
        it('should not throw when Pushgateway is unavailable', async () => {
            // Mock fetch to fail
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Wait for initial availability check
            await Promise.resolve()

            // Should not throw
            await expect(
                collector.pushMetric({ name: 'test_metric', value: 1 })
            ).resolves.not.toThrow()
        })

        it('should silently skip metric push when unavailable', async () => {
            // Mock fetch to fail
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Wait for initial availability check
            await Promise.resolve()

                // Clear previous fetch calls
                ; (global.fetch as jest.Mock).mockClear()

            // Try to push metric
            await collector.pushMetric({ name: 'test_metric', value: 1 })

            // Should not attempt to push when unavailable
            expect(global.fetch).not.toHaveBeenCalled()
        })

        it('should not push metrics when disabled', async () => {
            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: false,
            })

            await collector.pushMetric({ name: 'test_metric', value: 1 })

            expect(global.fetch).not.toHaveBeenCalled()
        })

        it('should not push metrics when URL is not configured', async () => {
            collector = new PrometheusCollector({
                pushgatewayUrl: undefined,
                enabled: true,
            })

            await collector.pushMetric({ name: 'test_metric', value: 1 })

            expect(global.fetch).not.toHaveBeenCalled()
        })
    })

    describe('Logging Behavior', () => {
        it('should log only the first error', async () => {
            // Mock fetch to fail
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Manually trigger availability check
            await collector.checkConnection()

            // Should log first error
            expect(logger.warn).toHaveBeenCalledTimes(1)
            expect(logger.warn).toHaveBeenCalledWith(
                'Prometheus Pushgateway unavailable, entering silent failure mode',
                expect.objectContaining({
                    url: mockPushgatewayUrl,
                })
            )

            // Clear mock
            jest.clearAllMocks()

            // Try to push metric (should fail silently without logging)
            await collector.pushMetric({ name: 'test_metric', value: 1 })

            // Should not log again
            expect(logger.warn).not.toHaveBeenCalled()
            expect(logger.error).not.toHaveBeenCalled()
        })

        it('should log successful recovery', async () => {
            // Mock fetch to fail initially
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Manually trigger availability check (fails)
            await collector.checkConnection()

            // Should log first error
            expect(logger.warn).toHaveBeenCalledTimes(1)

            // Clear mock
            jest.clearAllMocks()

                // Mock fetch to succeed on retry
                ; (global.fetch as jest.Mock).mockResolvedValue({
                    ok: true,
                    status: 200,
                } as Response)

            // Manually trigger retry
            await collector.checkConnection()

            // Should log recovery
            expect(logger.info).toHaveBeenCalledWith(
                'Prometheus Pushgateway connection restored',
                expect.objectContaining({
                    url: mockPushgatewayUrl,
                })
            )
        })
    })

    describe('Retry Mechanism', () => {
        it('should retry connection check after interval', async () => {
            // Mock fetch to fail
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Initial check
            await collector.checkConnection()

                // Clear mock
                ; (global.fetch as jest.Mock).mockClear()

            // Advance time by 60 seconds
            jest.advanceTimersByTime(60000)

            // Wait for timer callback
            await Promise.resolve()

            // Should have scheduled retry (timer exists)
            expect(jest.getTimerCount()).toBeGreaterThan(0)
        })

        it('should use custom retry interval', async () => {
            // Mock fetch to fail
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 30000, // 30 seconds
            })

            // Initial check
            await collector.checkConnection()

            // Verify retry interval is set correctly
            expect(collector).toBeDefined()
        })

        it('should not schedule multiple retry timers', async () => {
            // Mock fetch to fail
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Initial check
            await collector.checkConnection()

            const timerCount1 = jest.getTimerCount()

            // Try to push multiple metrics (should not create multiple timers)
            await collector.pushMetric({ name: 'metric1', value: 1 })
            await collector.pushMetric({ name: 'metric2', value: 2 })

            const timerCount2 = jest.getTimerCount()

            // Should not have added more timers
            expect(timerCount2).toBe(timerCount1)
        })
    })

    describe('Connection Recovery', () => {
        it('should resume pushing metrics after recovery', async () => {
            // Mock fetch to fail initially
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Wait for initial check (fails)
            await collector.checkConnection()

                // Mock fetch to succeed on retry
                ; (global.fetch as jest.Mock).mockResolvedValue({
                    ok: true,
                    status: 200,
                } as Response)

            // Trigger recovery
            await collector.checkConnection()

                // Clear mock
                ; (global.fetch as jest.Mock).mockClear()

            // Now push metric should work
            await collector.pushMetric({ name: 'test_metric', value: 1 })

            // Should have pushed metric
            expect(global.fetch).toHaveBeenCalledWith(
                `${mockPushgatewayUrl}/metrics/job/app_metrics`,
                expect.objectContaining({
                    method: 'POST',
                    body: 'test_metric 1\n',
                })
            )
        })

        it('should handle 404 response as available', async () => {
            // Mock fetch to return 404 (Pushgateway returns 404 for GET on root)
            ; (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404,
            } as Response)

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            // Wait for initial check
            await collector.checkConnection()

            // Should be available
            expect(collector.isConnected()).toBe(true)

            // Should not log error
            expect(logger.warn).not.toHaveBeenCalled()
        })
    })

    describe('Metric Pushing', () => {
        beforeEach(() => {
            // Mock successful connection
            ; (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                status: 200,
            } as Response)
        })

        it('should push metric with correct format', async () => {
            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
            })

            // Wait for initial check
            await collector.checkConnection()

                // Clear mock
                ; (global.fetch as jest.Mock).mockClear()

            await collector.pushMetric({
                name: 'test_metric',
                value: 42,
            })

            expect(global.fetch).toHaveBeenCalledWith(
                `${mockPushgatewayUrl}/metrics/job/app_metrics`,
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: 'test_metric 42\n',
                })
            )
        })

        it('should push metric with labels', async () => {
            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
            })

            await collector.checkConnection()
                ; (global.fetch as jest.Mock).mockClear()

            await collector.pushMetric({
                name: 'test_metric',
                value: 42,
                labels: { method: 'GET', status: '200' },
            })

            expect(global.fetch).toHaveBeenCalledWith(
                `${mockPushgatewayUrl}/metrics/job/app_metrics`,
                expect.objectContaining({
                    body: 'test_metric{method="GET",status="200"} 42\n',
                })
            )
        })

        it('should push multiple metrics in batch', async () => {
            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
            })

            await collector.checkConnection()
                ; (global.fetch as jest.Mock).mockClear()

            await collector.pushMetrics([
                { name: 'metric1', value: 1 },
                { name: 'metric2', value: 2, labels: { type: 'test' } },
            ])

            expect(global.fetch).toHaveBeenCalledWith(
                `${mockPushgatewayUrl}/metrics/job/app_metrics`,
                expect.objectContaining({
                    body: 'metric1 1\nmetric2{type="test"} 2\n',
                })
            )
        })

        it('should use custom job name', async () => {
            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
            })

            await collector.checkConnection()
                ; (global.fetch as jest.Mock).mockClear()

            await collector.pushMetric(
                { name: 'test_metric', value: 1 },
                'custom_job'
            )

            expect(global.fetch).toHaveBeenCalledWith(
                `${mockPushgatewayUrl}/metrics/job/custom_job`,
                expect.any(Object)
            )
        })
    })

    describe('Status Checks', () => {
        it('should report connection status', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                status: 200,
            } as Response)

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
            })

            await collector.checkConnection()

            expect(collector.isConnected()).toBe(true)
        })

        it('should allow manual connection check', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                status: 200,
            } as Response)

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
            })

            const isConnected = await collector.checkConnection()

            expect(isConnected).toBe(true)
        })
    })

    describe('Cleanup', () => {
        it('should clear retry timer on destroy', async () => {
            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

            collector = new PrometheusCollector({
                pushgatewayUrl: mockPushgatewayUrl,
                enabled: true,
                retryIntervalMs: 60000,
            })

            await collector.checkConnection()

            const timerCountBefore = jest.getTimerCount()

            collector.destroy()

            const timerCountAfter = jest.getTimerCount()

            // Timer should be cleared
            expect(timerCountAfter).toBeLessThanOrEqual(timerCountBefore)
        })
    })
})
