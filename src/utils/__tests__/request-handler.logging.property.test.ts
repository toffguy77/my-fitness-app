/**
 * Property-Based Tests: Network Error Logging
 * Validates: Requirements 3.5
 *
 * Property 7: Network Error Logging
 * For any network error, the system should:
 * 1. Log errors with structured context (URL, method, attempt, timestamp, error type)
 * 2. Not log AbortErrors (silent cancellation)
 * 3. Include retry information in error logs
 */

import fc from 'fast-check'
import { fetchWithAbort, isAbortError, shouldLogError } from '../request-handler'
import { logger } from '../logger'

// Mock logger to capture log calls
jest.mock('../logger', () => ({
    logger: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
    }
}))

// Mock toast notifications
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        error: jest.fn(),
        success: jest.fn(),
        loading: jest.fn()
    }
}))

describe('Property-Based Tests: Network Error Logging', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch = jest.fn()
    })

    describe('Property 7: Network Error Logging', () => {
        it('should log network errors with structured context', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(), // URL
                    fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'), // HTTP method
                    fc.integer({ min: 0, max: 3 }), // retries
                    fc.constantFrom(
                        'Failed to fetch',
                        'Network error',
                        'NetworkError: Connection failed'
                    ), // network error messages
                    async (url, method, retries, errorMessage) => {
                        // Clear mocks before each property test run
                        const mockLogger = logger as jest.Mocked<typeof logger>
                        mockLogger.error.mockClear()
                        mockLogger.warn.mockClear()
                        mockLogger.info.mockClear()
                        mockLogger.debug.mockClear()
                            ; (global.fetch as jest.Mock).mockClear()

                        const networkError = new Error(errorMessage)
                            ; (global.fetch as jest.Mock).mockRejectedValue(networkError)

                        try {
                            await fetchWithAbort(url, {
                                method,
                                retries,
                                retryDelay: 1
                            })
                        } catch (error) {
                            // Expected to fail
                        }

                        // Should have logged the error exactly once
                        expect(mockLogger.error).toHaveBeenCalledTimes(1)

                        // Check that error log includes structured context
                        const errorCall = mockLogger.error.mock.calls[0]
                        expect(errorCall[0]).toBe('Request failed after all retries')
                        expect(errorCall[1]).toBe(networkError)

                        const context = errorCall[2]
                        expect(context).toHaveProperty('url', url)
                        expect(context).toHaveProperty('method', method)
                        expect(context).toHaveProperty('totalAttempts')
                        expect(context).toHaveProperty('maxRetries', retries)
                        expect(context).toHaveProperty('errorType')
                        expect(context).toHaveProperty('timestamp')

                        return true
                    }
                ),
                { numRuns: 30 }
            )
        })

        it('should not log AbortErrors', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(), // URL
                    fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'), // HTTP method
                    async (url, method) => {
                        // Clear mocks before each property test run
                        const mockLogger = logger as jest.Mocked<typeof logger>
                        mockLogger.error.mockClear()
                        mockLogger.warn.mockClear()
                        mockLogger.info.mockClear()
                        mockLogger.debug.mockClear()
                            ; (global.fetch as jest.Mock).mockClear()

                        const abortError = new Error('The operation was aborted')
                        abortError.name = 'AbortError'
                            ; (global.fetch as jest.Mock).mockRejectedValue(abortError)

                        try {
                            await fetchWithAbort(url, {
                                method,
                                retries: 2,
                                retryDelay: 1
                            })
                        } catch (error) {
                            // Expected to fail
                        }

                        // Should NOT have logged the error
                        expect(mockLogger.error).not.toHaveBeenCalled()
                        expect(mockLogger.warn).not.toHaveBeenCalled()

                        return true
                    }
                ),
                { numRuns: 30 }
            )
        })

        it('should log retry attempts with context', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(), // URL
                    fc.integer({ min: 1, max: 3 }), // retries (at least 1)
                    async (url, retries) => {
                        // Clear mocks before each property test run
                        const mockLogger = logger as jest.Mocked<typeof logger>
                        mockLogger.error.mockClear()
                        mockLogger.warn.mockClear()
                        mockLogger.info.mockClear()
                        mockLogger.debug.mockClear()
                            ; (global.fetch as jest.Mock).mockClear()

                        const networkError = new Error('Network error')
                            ; (global.fetch as jest.Mock).mockRejectedValue(networkError)

                        try {
                            await fetchWithAbort(url, {
                                retries,
                                retryDelay: 1
                            })
                        } catch (error) {
                            // Expected to fail
                        }

                        // Should have logged warnings for each retry
                        expect(mockLogger.warn).toHaveBeenCalledTimes(retries)

                        // Check that each warning includes retry context
                        for (let i = 0; i < retries; i++) {
                            const warnCall = mockLogger.warn.mock.calls[i]
                            expect(warnCall[0]).toBe('Request failed, retrying')

                            const context = warnCall[1]
                            expect(context).toHaveProperty('url', url)
                            expect(context).toHaveProperty('attempt', i + 1)
                            expect(context).toHaveProperty('maxRetries', retries)
                            expect(context).toHaveProperty('nextRetryIn')
                            expect(context).toHaveProperty('error')
                        }

                        return true
                    }
                ),
                { numRuns: 30 }
            )
        })

        it('should identify error types correctly in logs', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.webUrl(), // URL
                    fc.constantFrom(
                        { message: 'Failed to fetch', expectedType: 'network' },
                        { message: 'Network error', expectedType: 'network' },
                        { message: 'The operation was aborted', expectedType: 'abort', name: 'AbortError' }
                    ),
                    async (url, errorConfig) => {
                        // Clear mocks before each property test run
                        const mockLogger = logger as jest.Mocked<typeof logger>
                        mockLogger.error.mockClear()
                        mockLogger.warn.mockClear()
                        mockLogger.info.mockClear()
                        mockLogger.debug.mockClear()
                            ; (global.fetch as jest.Mock).mockClear()

                        const error = new Error(errorConfig.message)
                        if (errorConfig.name) {
                            error.name = errorConfig.name
                        }
                        ; (global.fetch as jest.Mock).mockRejectedValue(error)

                        try {
                            await fetchWithAbort(url, {
                                retries: 0,
                                retryDelay: 1
                            })
                        } catch (e) {
                            // Expected to fail
                        }

                        if (errorConfig.expectedType === 'abort') {
                            // AbortErrors should not be logged
                            expect(mockLogger.error).not.toHaveBeenCalled()
                        } else {
                            // Other errors should be logged with correct type
                            expect(mockLogger.error).toHaveBeenCalledTimes(1)
                            const errorCall = mockLogger.error.mock.calls[0]
                            const context = errorCall[2]
                            if (context) {
                                expect(context.errorType).toBe(errorConfig.expectedType)
                            }
                        }

                        return true
                    }
                ),
                { numRuns: 30 }
            )
        })

        it('should use shouldLogError helper correctly', async () => {
            await fc.assert(
                fc.property(
                    fc.constantFrom(
                        { message: 'Network error', name: 'Error', shouldLog: true },
                        { message: 'Failed to fetch', name: 'TypeError', shouldLog: true },
                        { message: 'The operation was aborted', name: 'AbortError', shouldLog: false },
                        { message: 'Server error', name: 'Error', shouldLog: true }
                    ),
                    (errorConfig) => {
                        const error = new Error(errorConfig.message)
                        error.name = errorConfig.name

                        const result = shouldLogError(error)
                        return result === errorConfig.shouldLog
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should use isAbortError helper correctly', async () => {
            await fc.assert(
                fc.property(
                    fc.constantFrom(
                        { message: 'The operation was aborted', name: 'AbortError', isAbort: true },
                        { message: 'Aborted', name: 'AbortError', isAbort: true },
                        { message: 'Network error', name: 'Error', isAbort: false },
                        { message: 'Failed to fetch', name: 'TypeError', isAbort: false }
                    ),
                    (errorConfig) => {
                        const error = new Error(errorConfig.message)
                        error.name = errorConfig.name

                        const result = isAbortError(error)
                        return result === errorConfig.isAbort
                    }
                ),
                { numRuns: 50 }
            )
        })
    })
})
