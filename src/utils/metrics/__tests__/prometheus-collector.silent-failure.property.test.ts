/**
 * Property-based test for Prometheus Collector Silent Failure
 * Feature: error-handling-improvements, Property 8: Prometheus Silent Failure
 *
 * Validates: Requirements 4.2
 *
 * Property: For any sequence of metric push attempts when Pushgateway is unavailable,
 * the system should never throw errors and should silently skip all pushes.
 */

import * as fc from 'fast-check'
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

describe('Prometheus Collector Property Tests - Silent Failure', () => {
    let collector: PrometheusCollector

    beforeEach(() => {
        jest.clearAllMocks()
            ; (global.fetch as jest.Mock).mockClear()
    })

    afterEach(() => {
        if (collector) {
            collector.destroy()
        }
    })

    describe('Property 8: Prometheus Silent Failure', () => {
        /**
         * Property: For any sequence of metric push attempts when Pushgateway is unavailable,
         * the system should never throw errors and should silently skip all pushes.
         *
         * This property ensures that:
         * 1. No errors are thrown when Pushgateway is unavailable
         * 2. No fetch attempts are made when unavailable
         * 3. The system continues to operate normally
         *
         * **Validates: Requirements 4.2**
         */
        it('should silently fail for any sequence of metric pushes when unavailable', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random sequence of metrics to push
                    fc.array(
                        fc.record({
                            name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                            value: fc.double({ min: 0, max: 10000, noNaN: true }),
                            labels: fc.option(
                                fc.dictionary(
                                    fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                                    fc.oneof(fc.string(), fc.integer())
                                ),
                                { nil: undefined }
                            ),
                        }),
                        { minLength: 1, maxLength: 50 }
                    ),
                    async (metrics) => {
                        // Setup: Mock fetch to fail (Pushgateway unavailable)
                        ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                            retryIntervalMs: 60000,
                        })

                        // Trigger initial availability check
                        await collector.checkConnection()

                            // Clear fetch mock to track only metric pushes
                            ; (global.fetch as jest.Mock).mockClear()

                        // Property: Pushing any sequence of metrics should not throw
                        for (const metric of metrics) {
                            await expect(
                                collector.pushMetric(metric)
                            ).resolves.not.toThrow()
                        }

                        // Property: No fetch attempts should be made when unavailable
                        expect(global.fetch).not.toHaveBeenCalled()

                        // Property: System should still be operational (can check connection)
                        expect(collector.isConnected()).toBe(false)
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: For any configuration with disabled Prometheus or missing URL,
         * the system should silently skip all metric pushes without errors.
         *
         * **Validates: Requirements 4.2**
         */
        it('should silently skip pushes for any disabled configuration', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random configuration
                    fc.record({
                        enabled: fc.boolean(),
                        hasUrl: fc.boolean(),
                    }),
                    // Generate random metrics
                    fc.array(
                        fc.record({
                            name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                            value: fc.double({ min: 0, max: 10000, noNaN: true }),
                        }),
                        { minLength: 1, maxLength: 20 }
                    ),
                    async (config, metrics) => {
                        // Clear any previous fetch calls
                        ; (global.fetch as jest.Mock).mockClear()

                        // Setup: Create collector with potentially disabled config
                        collector = new PrometheusCollector({
                            pushgatewayUrl: config.hasUrl ? 'http://localhost:9091' : undefined,
                            enabled: config.enabled,
                        })

                        // Property: Pushing metrics should never throw
                        for (const metric of metrics) {
                            await expect(
                                collector.pushMetric(metric)
                            ).resolves.not.toThrow()
                        }

                        // Property: If disabled or no URL, no fetch should be attempted
                        if (!config.enabled || !config.hasUrl) {
                            expect(global.fetch).not.toHaveBeenCalled()
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: For any batch of metrics when Pushgateway is unavailable,
         * the system should silently skip the entire batch without errors.
         *
         * **Validates: Requirements 4.2**
         */
        it('should silently fail for any batch of metrics when unavailable', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random batches of metrics
                    fc.array(
                        fc.array(
                            fc.record({
                                name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                                value: fc.double({ min: 0, max: 10000, noNaN: true }),
                                labels: fc.option(
                                    fc.dictionary(
                                        fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                                        fc.string()
                                    ),
                                    { nil: undefined }
                                ),
                            }),
                            { minLength: 1, maxLength: 10 }
                        ),
                        { minLength: 1, maxLength: 10 }
                    ),
                    async (batches) => {
                        // Setup: Mock fetch to fail
                        ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        await collector.checkConnection()
                            ; (global.fetch as jest.Mock).mockClear()

                        // Property: Pushing any batch should not throw
                        for (const batch of batches) {
                            await expect(
                                collector.pushMetrics(batch)
                            ).resolves.not.toThrow()
                        }

                        // Property: No fetch attempts for unavailable Pushgateway
                        expect(global.fetch).not.toHaveBeenCalled()
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: For any error type from Pushgateway, the system should handle it silently.
         *
         * **Validates: Requirements 4.2**
         */
        it('should handle any error type silently', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate different error scenarios
                    fc.oneof(
                        fc.constant(new Error('Connection refused')),
                        fc.constant(new Error('ECONNREFUSED')),
                        fc.constant(new Error('Network error')),
                        fc.constant(new Error('Timeout')),
                        fc.constant(new TypeError('Failed to fetch')),
                        fc.constant(null), // Simulate null response
                    ),
                    // Generate random metrics
                    fc.array(
                        fc.record({
                            name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                            value: fc.double({ min: 0, max: 10000, noNaN: true }),
                        }),
                        { minLength: 1, maxLength: 10 }
                    ),
                    async (error, metrics) => {
                        // Setup: Mock fetch to fail with specific error
                        ; (global.fetch as jest.Mock).mockRejectedValue(error)

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        await collector.checkConnection()

                        // Property: Any error should be handled silently
                        for (const metric of metrics) {
                            await expect(
                                collector.pushMetric(metric)
                            ).resolves.not.toThrow()
                        }

                        // Property: System should mark as unavailable but not crash
                        expect(collector.isConnected()).toBe(false)
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: For any concurrent metric pushes when unavailable,
         * all should fail silently without interference.
         *
         * **Validates: Requirements 4.2**
         */
        it('should handle concurrent pushes silently when unavailable', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random number of concurrent pushes
                    fc.integer({ min: 1, max: 20 }),
                    // Generate random metrics
                    fc.array(
                        fc.record({
                            name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                            value: fc.double({ min: 0, max: 10000, noNaN: true }),
                        }),
                        { minLength: 1, maxLength: 20 }
                    ),
                    async (concurrentCount, metrics) => {
                        // Setup: Mock fetch to fail
                        ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        await collector.checkConnection()
                            ; (global.fetch as jest.Mock).mockClear()

                        // Property: All concurrent pushes should complete without errors
                        const promises = metrics.slice(0, concurrentCount).map(metric =>
                            collector.pushMetric(metric)
                        )

                        await expect(
                            Promise.all(promises)
                        ).resolves.not.toThrow()

                        // Property: No fetch attempts should be made
                        expect(global.fetch).not.toHaveBeenCalled()
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
