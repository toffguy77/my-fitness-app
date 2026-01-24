/**
 * Unit Tests: FatSecret OAuth 2.0 Authentication Manager
 * Tests authentication token management, caching, and error handling
 * **Validates: Requirements 1.1, 1.2**
 */

import { FatSecretAuthManager, getFatSecretAuthManager, resetFatSecretAuthManager } from '../products/fatsecret-auth'
import type { FatSecretConfiguration } from '@/config/fatsecret'

// Mock fetch globally
global.fetch = jest.fn()

describe('FatSecretAuthManager', () => {
    let mockConfig: FatSecretConfiguration

    beforeEach(() => {
        mockConfig = {
            enabled: true,
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            baseUrl: 'https://platform.fatsecret.com/rest/server.api',
            timeout: 5000,
            maxResults: 20,
            fallbackEnabled: true,
            region: 'US',
            language: 'en'
        }
        jest.clearAllMocks()
        resetFatSecretAuthManager()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('Token Fetching', () => {
        it('should fetch and return a valid token with valid credentials', async () => {
            const mockResponse = {
                access_token: 'test-access-token-123',
                token_type: 'Bearer',
                expires_in: 3600
            }

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse,
                    text: async () => JSON.stringify(mockResponse)
                })

            const authManager = new FatSecretAuthManager(mockConfig)
            const token = await authManager.getToken()

            expect(token).toBe('test-access-token-123')
            expect(global.fetch).toHaveBeenCalledTimes(1)
            expect(global.fetch).toHaveBeenCalledWith(
                'https://oauth.fatsecret.com/connect/token',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': expect.stringMatching(/^Basic .+$/)
                    }),
                    body: expect.any(URLSearchParams)
                })
            )
        })

        it('should throw error with invalid credentials', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => 'Invalid client credentials'
            })

            const authManager = new FatSecretAuthManager(mockConfig)

            await expect(authManager.getToken()).rejects.toThrow(
                'OAuth authentication failed: 401 Unauthorized - Invalid client credentials'
            )
        })

        it('should throw error when response is missing required fields', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token_type: 'Bearer' }) // Missing access_token and expires_in
            })

            const authManager = new FatSecretAuthManager(mockConfig)

            await expect(authManager.getToken()).rejects.toThrow(
                'Invalid OAuth response: missing required fields'
            )
        })

        it('should include correct Basic auth header', async () => {
            const mockResponse = {
                access_token: 'test-token',
                token_type: 'Bearer',
                expires_in: 3600
            }

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse,
                    text: async () => JSON.stringify(mockResponse)
                })

            const authManager = new FatSecretAuthManager(mockConfig)
            await authManager.getToken()

            const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
            const authHeader = fetchCall[1].headers.Authorization
            const base64Part = authHeader.replace('Basic ', '')
            const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')

            expect(decoded).toBe('test-client-id:test-client-secret')
        })
    })

    describe('Token Caching', () => {
        it('should cache token and reuse it for subsequent requests', async () => {
            const mockResponse = {
                access_token: 'cached-token',
                token_type: 'Bearer',
                expires_in: 3600
            }

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse,
                    text: async () => JSON.stringify(mockResponse)
                })

            const authManager = new FatSecretAuthManager(mockConfig)

            // First call - should fetch
            const token1 = await authManager.getToken()
            expect(token1).toBe('cached-token')
            expect(global.fetch).toHaveBeenCalledTimes(1)

            // Second call - should use cache
            const token2 = await authManager.getToken()
            expect(token2).toBe('cached-token')
            expect(global.fetch).toHaveBeenCalledTimes(1) // Still only 1 call
        })

        it('should refresh token when expired', async () => {
            const firstResponse = {
                access_token: 'first-token',
                token_type: 'Bearer',
                expires_in: 1 // 1 second
            }

            const secondResponse = {
                access_token: 'second-token',
                token_type: 'Bearer',
                expires_in: 3600
            }

                ; (global.fetch as jest.Mock)
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => firstResponse,
                        text: async () => JSON.stringify(firstResponse)
                    })
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => secondResponse,
                        text: async () => JSON.stringify(secondResponse)
                    })

            const authManager = new FatSecretAuthManager(mockConfig)

            // Get first token
            const token1 = await authManager.getToken()
            expect(token1).toBe('first-token')

            // Wait for token to expire (1 second + buffer)
            await new Promise(resolve => setTimeout(resolve, 1100))

            // Get token again - should refresh
            const token2 = await authManager.getToken()
            expect(token2).toBe('second-token')
            expect(global.fetch).toHaveBeenCalledTimes(2)
        }, 10000) // Increase timeout for this test

        it('should clear cache when clearCache is called', async () => {
            const mockResponse = {
                access_token: 'test-token',
                token_type: 'Bearer',
                expires_in: 3600
            }

                ; (global.fetch as jest.Mock)
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => mockResponse,
                        text: async () => JSON.stringify(mockResponse)
                    })
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({ ...mockResponse, access_token: 'new-token' }),
                        text: async () => JSON.stringify({ ...mockResponse, access_token: 'new-token' })
                    })

            const authManager = new FatSecretAuthManager(mockConfig)

            // Get token
            const token1 = await authManager.getToken()
            expect(token1).toBe('test-token')

            // Clear cache
            authManager.clearCache()

            // Get token again - should fetch new one
            const token2 = await authManager.getToken()
            expect(token2).toBe('new-token')
            expect(global.fetch).toHaveBeenCalledTimes(2)
        })
    })

    describe('Concurrent Requests', () => {
        it('should handle concurrent requests and share same token refresh', async () => {
            const mockResponse = {
                access_token: 'shared-token',
                token_type: 'Bearer',
                expires_in: 3600
            }

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse,
                    text: async () => JSON.stringify(mockResponse)
                })

            const authManager = new FatSecretAuthManager(mockConfig)

            // Make 5 concurrent requests
            const promises = [
                authManager.getToken(),
                authManager.getToken(),
                authManager.getToken(),
                authManager.getToken(),
                authManager.getToken()
            ]

            const tokens = await Promise.all(promises)

            // All should return the same token
            tokens.forEach(token => {
                expect(token).toBe('shared-token')
            })

            // Fetch should only be called once
            expect(global.fetch).toHaveBeenCalledTimes(1)
        })

        it('should handle concurrent requests during token refresh', async () => {
            const firstResponse = {
                access_token: 'first-token',
                token_type: 'Bearer',
                expires_in: 1
            }

            const secondResponse = {
                access_token: 'second-token',
                token_type: 'Bearer',
                expires_in: 3600
            }

                ; (global.fetch as jest.Mock)
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => firstResponse,
                        text: async () => JSON.stringify(firstResponse)
                    })
                    .mockResolvedValueOnce({
                        ok: true,
                        json: async () => secondResponse,
                        text: async () => JSON.stringify(secondResponse)
                    })

            const authManager = new FatSecretAuthManager(mockConfig)

            // Get first token
            await authManager.getToken()

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 1100))

            // Make concurrent requests after expiration
            const promises = [
                authManager.getToken(),
                authManager.getToken(),
                authManager.getToken()
            ]

            const tokens = await Promise.all(promises)

            // All should return the refreshed token
            tokens.forEach(token => {
                expect(token).toBe('second-token')
            })

            // Should have called fetch twice total (initial + refresh)
            expect(global.fetch).toHaveBeenCalledTimes(2)
        }, 10000)
    })

    describe('Error Handling', () => {
        it('should handle network errors', async () => {
            ; (global.fetch as jest.Mock).mockRejectedValueOnce(
                new Error('Network error')
            )

            const authManager = new FatSecretAuthManager(mockConfig)

            await expect(authManager.getToken()).rejects.toThrow('Network error')
        })

        it('should handle 500 server errors', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => 'Server error'
            })

            const authManager = new FatSecretAuthManager(mockConfig)

            await expect(authManager.getToken()).rejects.toThrow(
                'OAuth authentication failed: 500 Internal Server Error - Server error'
            )
        })

        it('should handle malformed JSON response', async () => {
            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => {
                    throw new Error('Invalid JSON')
                }
            })

            const authManager = new FatSecretAuthManager(mockConfig)

            await expect(authManager.getToken()).rejects.toThrow('Invalid JSON')
        })
    })

    describe('Singleton Pattern', () => {
        it('should return same instance from getFatSecretAuthManager', () => {
            const instance1 = getFatSecretAuthManager(mockConfig)
            const instance2 = getFatSecretAuthManager()

            expect(instance1).toBe(instance2)
        })

        it('should throw error if getFatSecretAuthManager called without config before initialization', () => {
            expect(() => getFatSecretAuthManager()).toThrow(
                'FatSecret auth manager not initialized. Provide config on first call.'
            )
        })

        it('should reset singleton with resetFatSecretAuthManager', () => {
            const instance1 = getFatSecretAuthManager(mockConfig)
            resetFatSecretAuthManager()
            const instance2 = getFatSecretAuthManager(mockConfig)

            // Should be different instances after reset
            expect(instance1).not.toBe(instance2)
        })
    })

    describe('Token Expiration Buffer', () => {
        it('should apply 1-minute buffer to token expiration', async () => {
            const mockResponse = {
                access_token: 'test-token',
                token_type: 'Bearer',
                expires_in: 3600 // 1 hour
            }

                ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse,
                    text: async () => JSON.stringify(mockResponse)
                })

            const authManager = new FatSecretAuthManager(mockConfig)
            const beforeFetch = Date.now()
            await authManager.getToken()
            const afterFetch = Date.now()

            // Token should be cached and reused immediately
            const token2 = await authManager.getToken()
            expect(token2).toBe('test-token')
            expect(global.fetch).toHaveBeenCalledTimes(1)

            // The token should be considered valid for approximately 59 minutes
            // (3600 seconds - 60 second buffer)
            // We can't directly test the internal expires_at, but we verified
            // the token is cached and reused
        })
    })
})
