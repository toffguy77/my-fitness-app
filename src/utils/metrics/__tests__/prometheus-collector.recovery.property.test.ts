/**
 * Property-based test for Prometheus Collector Connection Recovery
 * Feature: error-handling-improvements, Property 9: Prometheus Connection Recovery
 *
 * Validates: Requirements 4.4, 4.5
 *
 * Property: For any sequence of connection failures followed by recovery,
 * the system should automatically resume pushing metrics and log only the recovery event.
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

describe('Prometheus Collector Property Tests - Connection Recovery', () => {
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

    describe('Property 9: Prometheus Connection Recovery', () => {
        /**
         * Property: For any sequence of failures followed by successful connection,
         * the system should automatically resume metric pushing.
         *
         * This property ensures that:
         * 1. After recovery, metrics are successfully pushed
         * 2. Recovery is logged exactly once
         * 3. System transitions from unavailable to available state
         *
         * **Validates: Requirements 4.4, 4.5**
         */
        it('should resume pushing metrics after any recovery sequence', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random number of failures before recovery
                    fc.integer({ min: 1, max: 10 }),
                    // Generate random metrics to push after recovery
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
                        { minLength: 1, maxLength: 20 }
                    ),
                    async (numFailures, metrics) => {
                        // Setup: Mock fetch to fail initially
                        ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        // Simulate failures
                        for (let i = 0; i < numFailures; i++) {
                            await collector.checkConnection()
                        }

                        // Property: Should have logged error only once
                        expect(logger.warn).toHaveBeenCalledTimes(1)

                        // Clear mocks
                        jest.clearAllMocks()
                            ; (global.fetch as jest.Mock).mockClear()

                            // Simulate recovery
                            ; (global.fetch as jest.Mock).mockResolvedValue({
                                ok: true,
                                status: 200,
                            } as Response)

                        await collector.checkConnection()

                        // Property: Should log recovery exactly once
                        expect(logger.info).toHaveBeenCalledTimes(1)
                        expect(logger.info).toHaveBeenCalledWith(
                            'Prometheus Pushgateway connection restored',
                            expect.any(Object)
                        )

                        // Property: Should be connected after recovery
                        expect(collector.isConnected()).toBe(true)

                            // Clear mocks to track metric pushes
                            ; (global.fetch as jest.Mock).mockClear()

                        // Property: Should successfully push metrics after recovery
                        for (const metric of metrics) {
                            await collector.pushMetric(metric)
                        }

                        // Property: All metrics should have been pushed
                        expect(global.fetch).toHaveBeenCalledTimes(metrics.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: For any batch of metrics, after recovery all should be pushed successfully.
         *
         * **Validates: Requirements 4.4**
         */
        it('should push batches successfully after recovery', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random batches
                    fc.array(
                        fc.array(
                            fc.record({
                                name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                                value: fc.double({ min: 0, max: 10000, noNaN: true }),
                            }),
                            { minLength: 1, maxLength: 5 }
                        ),
                        { minLength: 1, maxLength: 5 }
                    ),
                    async (batches) => {
                        // Setup: Start with failure
                        ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        await collector.checkConnection()

                            // Simulate recovery
                            ; (global.fetch as jest.Mock).mockResolvedValue({
                                ok: true,
                                status: 200,
                            } as Response)

                        await collector.checkConnection()
                            ; (global.fetch as jest.Mock).mockClear()

                        // Property: All batches should be pushed successfully
                        for (const batch of batches) {
                            await expect(
                                collector.pushMetrics(batch)
                            ).resolves.not.toThrow()
                        }

                        // Property: Correct number of batch pushes
                        expect(global.fetch).toHaveBeenCalledTimes(batches.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: Recovery should work regardless of error type encountered.
         *
         * **Validates: Requirements 4.4**
         */
        it('should recover from any error type', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate different error types
                    fc.oneof(
                        fc.constant(new Error('ECONNREFUSED')),
                        fc.constant(new Error('ETIMEDOUT')),
                        fc.constant(new Error('Network error')),
                        fc.constant(new TypeError('Failed to fetch')),
                        fc.constant(new Error('DNS lookup failed')),
                    ),
                    // Generate metrics to push after recovery
                    fc.array(
                        fc.record({
                            name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                            value: fc.double({ min: 0, max: 10000, noNaN: true }),
                        }),
                        { minLength: 1, maxLength: 10 }
                    ),
                    async (error, metrics) => {
                        // Setup: Fail with specific error
                        ; (global.fetch as jest.Mock).mockRejectedValue(error)

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        await collector.checkConnection()

                            // Simulate recovery
                            ; (global.fetch as jest.Mock).mockResolvedValue({
                                ok: true,
                                status: 200,
                            } as Response)

                        await collector.checkConnection()

                        // Property: Should be connected after recovery
                        expect(collector.isConnected()).toBe(true)

                            // Property: Should push metrics successfully
                            ; (global.fetch as jest.Mock).mockClear()
                        for (const metric of metrics) {
                            await collector.pushMetric(metric)
                        }

                        expect(global.fetch).toHaveBeenCalledTimes(metrics.length)
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: Multiple recovery cycles should work correctly.
         *
         * **Validates: Requirements 4.4, 4.5**
         */
        it('should handle multiple failure-recovery cycles', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random number of cycles
                    fc.integer({ min: 1, max: 5 }),
                    // Generate metrics for each cycle
                    fc.array(
                        fc.record({
                            name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                            value: fc.double({ min: 0, max: 10000, noNaN: true }),
                        }),
                        { minLength: 1, maxLength: 5 }
                    ),
                    async (numCycles, metricsPerCycle) => {
                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        for (let cycle = 0; cycle < numCycles; cycle++) {
                            // Fail
                            ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))
                            await collector.checkConnection()

                            // Property: Should be unavailable
                            expect(collector.isConnected()).toBe(false)

                                // Recover
                                ; (global.fetch as jest.Mock).mockResolvedValue({
                                    ok: true,
                                    status: 200,
                                } as Response)
                            await collector.checkConnection()

                            // Property: Should be available
                            expect(collector.isConnected()).toBe(true)

                                // Property: Should push metrics successfully
                                ; (global.fetch as jest.Mock).mockClear()
                            for (const metric of metricsPerCycle) {
                                await collector.pushMetric(metric)
                            }
                            expect(global.fetch).toHaveBeenCalledTimes(metricsPerCycle.length)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: Recovery logging should only occur once per failure period.
         *
         * **Validates: Requirements 4.5**
         */
        it('should log recovery only once per failure period', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random number of failed attempts before recovery
                    fc.integer({ min: 1, max: 20 }),
                    // Generate random number of successful checks after recovery
                    fc.integer({ min: 1, max: 10 }),
                    async (numFailedAttempts, numSuccessfulChecks) => {
                        // Setup: Start with failures
                        ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        // Multiple failed attempts
                        for (let i = 0; i < numFailedAttempts; i++) {
                            await collector.checkConnection()
                        }

                        // Property: Should log error only once
                        expect(logger.warn).toHaveBeenCalledTimes(1)

                        jest.clearAllMocks()

                            // Recover
                            ; (global.fetch as jest.Mock).mockResolvedValue({
                                ok: true,
                                status: 200,
                            } as Response)

                        // Multiple successful checks
                        for (let i = 0; i < numSuccessfulChecks; i++) {
                            await collector.checkConnection()
                        }

                        // Property: Should log recovery only once
                        expect(logger.info).toHaveBeenCalledTimes(1)
                        expect(logger.info).toHaveBeenCalledWith(
                            'Prometheus Pushgateway connection restored',
                            expect.any(Object)
                        )
                    }
                ),
                { numRuns: 100 }
            )
        })

        /**
         * Property: Concurrent metric pushes after recovery should all succeed.
         *
         * **Validates: Requirements 4.4**
         */
        it('should handle concurrent pushes after recovery', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random number of concurrent pushes
                    fc.integer({ min: 1, max: 20 }),
                    // Generate metrics
                    fc.array(
                        fc.record({
                            name: fc.stringMatching(/^[a-z_][a-z0-9_]*$/),
                            value: fc.double({ min: 0, max: 10000, noNaN: true }),
                        }),
                        { minLength: 1, maxLength: 20 }
                    ),
                    async (concurrentCount, metrics) => {
                        // Setup: Start with failure
                        ; (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'))

                        collector = new PrometheusCollector({
                            pushgatewayUrl: 'http://localhost:9091',
                            enabled: true,
                        })

                        await collector.checkConnection()

                            // Recover
                            ; (global.fetch as jest.Mock).mockResolvedValue({
                                ok: true,
                                status: 200,
                            } as Response)

                        await collector.checkConnection()
                            ; (global.fetch as jest.Mock).mockClear()

                        // Property: All concurrent pushes should succeed
                        const promises = metrics.slice(0, concurrentCount).map(metric =>
                            collector.pushMetric(metric)
                        )

                        await expect(
                            Promise.all(promises)
                        ).resolves.not.toThrow()

                        // Property: All pushes should have been attempted
                        expect(global.fetch).toHaveBeenCalledTimes(Math.min(concurrentCount, metrics.length))
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
