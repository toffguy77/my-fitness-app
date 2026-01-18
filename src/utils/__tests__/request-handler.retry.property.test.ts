/**
 * Property-Based Tests: Retry with Exponential Backoff
 * Validates: Requirements 3.3
 *
 * Property 6: Retry with Exponential Backoff
 * For any network error and retry configuration, the system should:
 * 1. Retry the specified number of times
 * 2. Use exponential backoff delays (1s, 2s, 4s, ...)
 * 3. Eventually fail after exhausting retries
 */

import fc from 'fast-check'
import { fetchWithAbort } from '../request-handler'

// Mock logger to prevent console output during tests
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

describe('Property-Based Tests: Retry with Exponential Backoff', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch = jest.fn()
    })

    describe('Property 6: Retry with Exponential Backoff', () => {
        it('should retry the specified number of times for network errors', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 0, max: 5 }), // retries
                    fc.constantFrom(
                        'Failed to fetch',
                        'Network error',
                        'NetworkError: Connection failed',
                        'TypeError: fetch failed'
                    ), // error messages
                    async (retries, errorMessage) => {
                        // Reset and reconfigure mock for each property test run
                        const fetchMock = global.fetch as jest.Mock
                        fetchMock.mockReset()

                        const networkError = new Error(errorMessage)

                        // Mock to reject for all attempts (initial + retries)
                        for (let i = 0; i <= retries; i++) {
                            fetchMock.mockRejectedValueOnce(networkError)
                        }

                        try {
                            await fetchWithAbort('https://api.example.com/test', {
                                retries,
                                retryDelay: 1 // Minimal delay for tests
                            })
                            // Should not reach here
                            return false
                        } catch (error) {
                            // Should have called fetch retries + 1 times (initial + retries)
                            const expectedCalls = retries + 1
                            const actualCalls = fetchMock.mock.calls.length
                            return actualCalls === expectedCalls
                        }
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should use exponential backoff delays between retries', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 3 }), // retries (at least 1 to test delay)
                    fc.integer({ min: 10, max: 100 }), // base delay in ms
                    async (retries, baseDelay) => {
                        // Reset and reconfigure mock for each property test run
                        const fetchMock = global.fetch as jest.Mock
                        fetchMock.mockReset()

                        const networkError = new Error('Network error')

                        // Mock to reject for all attempts
                        for (let i = 0; i <= retries; i++) {
                            fetchMock.mockRejectedValueOnce(networkError)
                        }

                        const startTime = Date.now()

                        try {
                            await fetchWithAbort('https://api.example.com/test', {
                                retries,
                                retryDelay: baseDelay
                            })
                        } catch (error) {
                            // Expected to fail
                        }

                        const elapsed = Date.now() - startTime

                        // Calculate expected minimum delay
                        // For retries=1: baseDelay * 2^0 = baseDelay
                        // For retries=2: baseDelay * 2^0 + baseDelay * 2^1 = baseDelay + 2*baseDelay
                        // For retries=3: baseDelay * 2^0 + baseDelay * 2^1 + baseDelay * 2^2 = baseDelay + 2*baseDelay + 4*baseDelay
                        let expectedMinDelay = 0
                        for (let i = 0; i < retries; i++) {
                            expectedMinDelay += baseDelay * Math.pow(2, i)
                        }

                        // Allow 20% margin for test execution overhead
                        const minAcceptable = expectedMinDelay * 0.8

                        return elapsed >= minAcceptable
                    }
                ),
                { numRuns: 30 }
            )
        }, 10000) // Increase timeout to 10 seconds for exponential backoff delays

        it('should call onRetry callback for each retry attempt', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 5 }), // retries (at least 1)
                    async (retries) => {
                        // Reset and reconfigure mock for each property test run
                        const fetchMock = global.fetch as jest.Mock
                        fetchMock.mockReset()

                        const networkError = new Error('Network error')

                        // Mock to reject for all attempts
                        for (let i = 0; i <= retries; i++) {
                            fetchMock.mockRejectedValueOnce(networkError)
                        }

                        const retryCalls: number[] = []
                        const onRetry = (attempt: number) => {
                            retryCalls.push(attempt)
                        }

                        try {
                            await fetchWithAbort('https://api.example.com/test', {
                                retries,
                                retryDelay: 1,
                                onRetry
                            })
                        } catch (error) {
                            // Expected to fail
                        }

                        // Should have called onRetry exactly 'retries' times
                        if (retryCalls.length !== retries) {
                            return false
                        }

                        // Should have called with sequential attempt numbers (1, 2, 3, ...)
                        for (let i = 0; i < retries; i++) {
                            if (retryCalls[i] !== i + 1) {
                                return false
                            }
                        }

                        return true
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should not retry for non-network errors', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 5 }), // retries
                    fc.constantFrom(
                        'Validation error',
                        'Internal server error',
                        'Database error',
                        'Authentication failed'
                    ), // non-network error messages
                    async (retries, errorMessage) => {
                        // Reset and reconfigure mock for each property test run
                        const fetchMock = global.fetch as jest.Mock
                        fetchMock.mockReset()

                        const nonNetworkError = new Error(errorMessage)
                        // Only need to mock once since non-network errors don't retry
                        fetchMock.mockRejectedValueOnce(nonNetworkError)

                        try {
                            await fetchWithAbort('https://api.example.com/test', {
                                retries,
                                retryDelay: 1
                            })
                            return false
                        } catch (error) {
                            // Should have called fetch only once (no retries for non-network errors)
                            const actualCalls = fetchMock.mock.calls.length
                            return actualCalls === 1
                        }
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should not retry for AbortErrors', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 5 }), // retries
                    async (retries) => {
                        // Reset and reconfigure mock for each property test run
                        const fetchMock = global.fetch as jest.Mock
                        fetchMock.mockReset()

                        const abortError = new Error('The operation was aborted')
                        abortError.name = 'AbortError'
                        // Only need to mock once since AbortErrors don't retry
                        fetchMock.mockRejectedValueOnce(abortError)

                        try {
                            await fetchWithAbort('https://api.example.com/test', {
                                retries,
                                retryDelay: 1
                            })
                            return false
                        } catch (error) {
                            // Should have called fetch only once (no retries for AbortErrors)
                            const actualCalls = fetchMock.mock.calls.length
                            return actualCalls === 1
                        }
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should succeed on retry if network recovers', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 5 }), // retries
                    fc.integer({ min: 1, max: 5 }), // failCount (how many times to fail before success)
                    async (retries, failCount) => {
                        // The implementation makes retries+1 total attempts (1 initial + retries)
                        // So we can only succeed if failCount <= retries (not retries+1)
                        // because the success happens on attempt failCount+1
                        if (failCount > retries) {
                            return true // Skip this case - will always fail
                        }

                        const networkError = new Error('Network error')
                        const mockData = { success: true }
                        const mockResponse = {
                            ok: true,
                            json: jest.fn().mockResolvedValue(mockData),
                            headers: new Headers({ 'content-type': 'application/json' })
                        }

                        const fetchMock = global.fetch as jest.Mock
                        fetchMock.mockClear()

                        // Fail 'failCount' times, then succeed
                        for (let i = 0; i < failCount; i++) {
                            fetchMock.mockRejectedValueOnce(networkError)
                        }
                        fetchMock.mockResolvedValueOnce(mockResponse)

                        try {
                            const result = await fetchWithAbort('https://api.example.com/test', {
                                retries,
                                retryDelay: 1
                            })

                            // Should have succeeded
                            if (result !== mockData) {
                                return false
                            }

                            // Should have called fetch failCount + 1 times
                            const actualCalls = fetchMock.mock.calls.length
                            return actualCalls === failCount + 1
                        } catch (error) {
                            // Should not fail if failCount <= retries
                            return false
                        }
                    }
                ),
                { numRuns: 50 }
            )
        })
    })
})
