/**
 * Property-based tests for request handler
 * Feature: error-handling-improvements, Property 1: AbortError Silent Cancellation
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import * as fc from 'fast-check'
import {
    fetchWithAbort,
    isAbortError,
    shouldLogError,
    type RequestOptions
} from '../request-handler'
import { logger } from '../logger'

// Mock logger to track calls
jest.mock('../logger', () => ({
    logger: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
    }
}))

describe('Request Handler Property Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch = jest.fn()
    })

    describe('Property 1: AbortError Silent Cancellation', () => {
        /**
         * Property: For any request that is cancelled via AbortController,
         * the system should not log the AbortError as an unexpected error
         *
         * This property ensures that:
         * 1. AbortErrors are correctly identified
         * 2. AbortErrors are not logged (silent cancellation)
         * 3. This behavior is consistent across all request scenarios
         */
        it('should never log AbortError regardless of request parameters', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random URLs
                    fc.webUrl(),
                    // Generate random HTTP methods
                    fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
                    // Generate random retry configurations
                    fc.record({
                        retries: fc.integer({ min: 0, max: 5 }),
                        retryDelay: fc.integer({ min: 1, max: 100 })
                    }),
                    async (url, method, retryConfig) => {
                        // Setup: Create AbortError
                        const abortError = new Error('The operation was aborted')
                        abortError.name = 'AbortError'

                            // Mock fetch to throw AbortError
                            ; (global.fetch as jest.Mock).mockRejectedValue(abortError)

                        // Clear previous mock calls
                        jest.clearAllMocks()

                        const options: RequestOptions = {
                            method,
                            ...retryConfig
                        }

                        // Execute: Try to fetch with abort
                        try {
                            await fetchWithAbort(url, options)
                        } catch (error) {
                            // Verify: Error should be AbortError
                            expect(isAbortError(error)).toBe(true)
                        }

                        // Property assertion: Logger should NEVER be called for AbortError
                        expect(logger.error).not.toHaveBeenCalled()
                        expect(logger.warn).not.toHaveBeenCalled()
                    }
                ),
                { numRuns: 100 } // Run 100 iterations as per design requirements
            )
        })

        it('should correctly identify AbortError across different error formats', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random error messages
                    fc.string({ minLength: 1, maxLength: 100 }),
                    async (errorMessage) => {
                        // Create AbortError with random message
                        const abortError = new Error(errorMessage)
                        abortError.name = 'AbortError'

                        // Property: isAbortError should always return true for AbortError
                        expect(isAbortError(abortError)).toBe(true)

                        // Property: shouldLogError should always return false for AbortError
                        expect(shouldLogError(abortError)).toBe(false)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should distinguish AbortError from other errors', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random error names (excluding 'AbortError')
                    fc.constantFrom(
                        'Error',
                        'TypeError',
                        'NetworkError',
                        'ReferenceError',
                        'SyntaxError',
                        'RangeError'
                    ),
                    // Generate random error messages
                    fc.string({ minLength: 1, maxLength: 100 }),
                    async (errorName, errorMessage) => {
                        // Create non-AbortError
                        const error = new Error(errorMessage)
                        error.name = errorName

                        // Property: isAbortError should return false for non-AbortErrors
                        expect(isAbortError(error)).toBe(false)

                        // Property: shouldLogError should return true for non-AbortErrors
                        expect(shouldLogError(error)).toBe(true)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle AbortError consistently during component lifecycle', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate random number of concurrent requests
                    fc.integer({ min: 1, max: 10 }),
                    // Generate random URLs
                    fc.array(fc.webUrl(), { minLength: 1, maxLength: 10 }),
                    async (numRequests, urls) => {
                        // Setup: Create AbortController
                        const controller = new AbortController()

                        // Create AbortError
                        const abortError = new Error('Aborted')
                        abortError.name = 'AbortError'

                            ; (global.fetch as jest.Mock).mockRejectedValue(abortError)

                        jest.clearAllMocks()

                        // Execute: Start multiple requests
                        const requests = urls.slice(0, numRequests).map(url =>
                            fetchWithAbort(url, { signal: controller.signal })
                                .catch(error => error)
                        )

                        // Abort all requests
                        controller.abort()

                        // Wait for all requests to complete
                        const results = await Promise.all(requests)

                        // Property: All errors should be AbortErrors
                        results.forEach(result => {
                            if (result instanceof Error) {
                                expect(isAbortError(result)).toBe(true)
                            }
                        })

                        // Property: No logging should occur for any AbortError
                        expect(logger.error).not.toHaveBeenCalled()
                        expect(logger.warn).not.toHaveBeenCalled()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should not retry AbortError regardless of retry configuration', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(),
                    fc.record({
                        retries: fc.integer({ min: 1, max: 10 }),
                        retryDelay: fc.integer({ min: 1, max: 1000 })
                    }),
                    async (url, retryConfig) => {
                        const abortError = new Error('Aborted')
                        abortError.name = 'AbortError'

                            ; (global.fetch as jest.Mock).mockRejectedValue(abortError)

                        const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length

                        try {
                            await fetchWithAbort(url, retryConfig)
                        } catch (error) {
                            // Verify it's an AbortError
                            expect(isAbortError(error)).toBe(true)
                        }

                        const fetchCallsAfter = (global.fetch as jest.Mock).mock.calls.length

                        // Property: Should only attempt once, never retry on AbortError
                        expect(fetchCallsAfter - fetchCallsBefore).toBe(1)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property: Error Filtering Consistency', () => {
        /**
         * Property: The error filtering logic should be consistent
         * across all error types and scenarios
         */
        it('should have consistent error filtering logic', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.oneof(
                        // Generate AbortError
                        fc.constant({ name: 'AbortError', shouldLog: false }),
                        // Generate other errors
                        fc.record({
                            name: fc.constantFrom('Error', 'TypeError', 'NetworkError'),
                            shouldLog: fc.constant(true)
                        })
                    ),
                    fc.string({ minLength: 1, maxLength: 100 }),
                    async (errorConfig, message) => {
                        const error = new Error(message)
                        error.name = errorConfig.name

                        // Property: shouldLogError result should match expected behavior
                        expect(shouldLogError(error)).toBe(errorConfig.shouldLog)

                        // Property: isAbortError should be inverse of shouldLog for AbortError
                        if (errorConfig.name === 'AbortError') {
                            expect(isAbortError(error)).toBe(true)
                            expect(shouldLogError(error)).toBe(false)
                        } else {
                            expect(isAbortError(error)).toBe(false)
                            expect(shouldLogError(error)).toBe(true)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
