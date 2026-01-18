/**
 * Unit tests for request handler
 * Tests AbortError detection, error filtering, and retry mechanism
 */

import {
    fetchWithAbort,
    isAbortError,
    isNetworkError,
    shouldLogError,
    createNetworkError,
    type ErrorContext
} from '../request-handler'

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

describe('Request Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch = jest.fn()
    })

    describe('isAbortError', () => {
        it('should detect AbortError correctly', () => {
            const abortError = new Error('The operation was aborted')
            abortError.name = 'AbortError'

            expect(isAbortError(abortError)).toBe(true)
        })

        it('should return false for regular errors', () => {
            const regularError = new Error('Regular error')
            expect(isAbortError(regularError)).toBe(false)
        })

        it('should return false for non-Error objects', () => {
            expect(isAbortError('string error')).toBe(false)
            expect(isAbortError(null)).toBe(false)
            expect(isAbortError(undefined)).toBe(false)
            expect(isAbortError({})).toBe(false)
        })
    })

    describe('isNetworkError', () => {
        it('should detect network errors by message', () => {
            const networkError = new Error('Failed to fetch')
            expect(isNetworkError(networkError)).toBe(true)
        })

        it('should detect NetworkError by name', () => {
            const error = new Error('Connection failed')
            error.name = 'NetworkError'
            expect(isNetworkError(error)).toBe(true)
        })

        it('should detect TypeError as network error', () => {
            const error = new TypeError('Network request failed')
            expect(isNetworkError(error)).toBe(true)
        })

        it('should return false for non-network errors', () => {
            const error = new Error('Validation error')
            expect(isNetworkError(error)).toBe(false)
        })

        it('should return false for non-Error objects', () => {
            expect(isNetworkError('error')).toBe(false)
            expect(isNetworkError(null)).toBe(false)
        })
    })

    describe('shouldLogError', () => {
        it('should return false for AbortError', () => {
            const abortError = new Error('Aborted')
            abortError.name = 'AbortError'

            expect(shouldLogError(abortError)).toBe(false)
        })

        it('should return true for other errors', () => {
            const networkError = new Error('Network error')
            expect(shouldLogError(networkError)).toBe(true)

            const serverError = new Error('Server error')
            expect(shouldLogError(serverError)).toBe(true)
        })
    })

    describe('fetchWithAbort', () => {
        it('should successfully fetch data', async () => {
            const mockData = { success: true }
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue(mockData),
                headers: new Headers({ 'content-type': 'application/json' })
            }

                ; (global.fetch as jest.Mock).mockResolvedValue(mockResponse)

            const result = await fetchWithAbort('https://api.example.com/data')

            expect(result).toEqual(mockData)
            expect(global.fetch).toHaveBeenCalledTimes(1)
        })

        it('should not log AbortError', async () => {
            const abortError = new Error('Aborted')
            abortError.name = 'AbortError'

                ; (global.fetch as jest.Mock).mockRejectedValue(abortError)

            await expect(
                fetchWithAbort('https://api.example.com/data')
            ).rejects.toThrow('Aborted')

            const { logger } = require('../logger')
            expect(logger.error).not.toHaveBeenCalled()
            expect(logger.warn).not.toHaveBeenCalled()
        })

        it('should retry on network errors', async () => {
            const networkError = new Error('Failed to fetch')
            const mockData = { success: true }
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue(mockData),
                headers: new Headers({ 'content-type': 'application/json' })
            }

                ; (global.fetch as jest.Mock)
                    .mockRejectedValueOnce(networkError)
                    .mockRejectedValueOnce(networkError)
                    .mockResolvedValueOnce(mockResponse)

            const result = await fetchWithAbort('https://api.example.com/data', {
                retries: 3,
                retryDelay: 10 // Short delay for tests
            })

            expect(result).toEqual(mockData)
            expect(global.fetch).toHaveBeenCalledTimes(3)
        })

        it('should use exponential backoff for retries', async () => {
            const networkError = new Error('Network error')
            const startTime = Date.now()

                ; (global.fetch as jest.Mock).mockRejectedValue(networkError)

            await expect(
                fetchWithAbort('https://api.example.com/data', {
                    retries: 2,
                    retryDelay: 100
                })
            ).rejects.toThrow()

            const elapsed = Date.now() - startTime
            // Should wait: 100ms (1st retry) + 200ms (2nd retry) = 300ms minimum
            expect(elapsed).toBeGreaterThanOrEqual(250) // Allow some margin
        })

        it('should call onRetry callback', async () => {
            const networkError = new Error('Network error')
            const onRetry = jest.fn()

                ; (global.fetch as jest.Mock).mockRejectedValue(networkError)

            await expect(
                fetchWithAbort('https://api.example.com/data', {
                    retries: 2,
                    retryDelay: 10,
                    onRetry
                })
            ).rejects.toThrow()

            expect(onRetry).toHaveBeenCalledTimes(2)
            expect(onRetry).toHaveBeenCalledWith(1)
            expect(onRetry).toHaveBeenCalledWith(2)
        })

        it('should log error after all retries exhausted', async () => {
            const networkError = new Error('Network error')

                ; (global.fetch as jest.Mock).mockRejectedValue(networkError)

            await expect(
                fetchWithAbort('https://api.example.com/data', {
                    retries: 2,
                    retryDelay: 10
                })
            ).rejects.toThrow()

            const { logger } = require('../logger')
            expect(logger.error).toHaveBeenCalledWith(
                'Request failed after all retries',
                networkError,
                expect.objectContaining({
                    url: 'https://api.example.com/data',
                    totalAttempts: 3,
                    maxRetries: 2
                })
            )
        })

        it('should handle non-JSON responses', async () => {
            const mockText = 'Plain text response'
            const mockResponse = {
                ok: true,
                text: jest.fn().mockResolvedValue(mockText),
                headers: new Headers({ 'content-type': 'text/plain' })
            }

                ; (global.fetch as jest.Mock).mockResolvedValue(mockResponse)

            const result = await fetchWithAbort('https://api.example.com/data')

            expect(result).toBe(mockText)
        })

        it('should throw on HTTP error status', async () => {
            const mockResponse = {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                headers: new Headers()
            }

                ; (global.fetch as jest.Mock).mockResolvedValue(mockResponse)

            await expect(
                fetchWithAbort('https://api.example.com/data', { retries: 0 })
            ).rejects.toThrow('HTTP 404: Not Found')
        })

        it('should pass AbortSignal to fetch', async () => {
            const controller = new AbortController()
            const mockData = { success: true }
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue(mockData),
                headers: new Headers({ 'content-type': 'application/json' })
            }

                ; (global.fetch as jest.Mock).mockResolvedValue(mockResponse)

            await fetchWithAbort('https://api.example.com/data', {
                signal: controller.signal
            })

            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.example.com/data',
                expect.objectContaining({
                    signal: controller.signal
                })
            )
        })

        it('should show user notification after exhausting retries when enabled', async () => {
            const networkError = new Error('Failed to fetch')
            const toast = require('react-hot-toast').default

                ; (global.fetch as jest.Mock).mockRejectedValue(networkError)

            await expect(
                fetchWithAbort('https://api.example.com/data', {
                    retries: 2,
                    retryDelay: 10,
                    showUserNotification: true
                })
            ).rejects.toThrow()

            expect(toast.error).toHaveBeenCalledWith(
                'Проблема с подключением. Проверьте интернет и попробуйте снова.'
            )
        })

        it('should not show user notification when disabled', async () => {
            const networkError = new Error('Failed to fetch')
            const toast = require('react-hot-toast').default

                ; (global.fetch as jest.Mock).mockRejectedValue(networkError)

            await expect(
                fetchWithAbort('https://api.example.com/data', {
                    retries: 2,
                    retryDelay: 10,
                    showUserNotification: false
                })
            ).rejects.toThrow()

            expect(toast.error).not.toHaveBeenCalled()
        })

        it('should not show user notification for non-network errors', async () => {
            const serverError = new Error('Internal server error')
            const toast = require('react-hot-toast').default

                ; (global.fetch as jest.Mock).mockRejectedValue(serverError)

            await expect(
                fetchWithAbort('https://api.example.com/data', {
                    retries: 0,
                    showUserNotification: true
                })
            ).rejects.toThrow()

            expect(toast.error).not.toHaveBeenCalled()
        })
    })

    describe('createNetworkError', () => {
        it('should create NetworkError with context', () => {
            const context: ErrorContext = {
                url: 'https://api.example.com',
                method: 'GET',
                attempt: 1,
                timestamp: new Date(),
                errorType: 'network'
            }

            const error = createNetworkError('Network failed', context, true)

            expect(error.name).toBe('NetworkError')
            expect(error.message).toBe('Network failed')
            expect(error.context).toEqual(context)
            expect(error.isRetryable).toBe(true)
        })

        it('should default isRetryable to true', () => {
            const context: ErrorContext = {
                url: 'https://api.example.com',
                method: 'GET',
                attempt: 1,
                timestamp: new Date(),
                errorType: 'network'
            }

            const error = createNetworkError('Network failed', context)

            expect(error.isRetryable).toBe(true)
        })
    })
})
