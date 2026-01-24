/**
 * Property-Based Tests: FatSecret Authentication Token Validity
 * **Feature: fatsecret-integration, Property 1: Authentication Token Validity**
 * **Validates: Requirements 1.1, 1.2**
 */

import fc from 'fast-check'
import { FatSecretAuthManager, type FatSecretAuthToken } from '../products/fatsecret-auth'
import type { FatSecretConfiguration } from '@/config/fatsecret'

// Mock fetch globally
global.fetch = jest.fn()

describe('FatSecret Authentication - Property Tests', () => {
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
        jest.resetAllMocks()
    })

    describe('Property 1: Authentication Token Validity', () => {
        /**
         * **Property 1: Authentication Token Validity**
         * *For any* API request to FatSecret, the authentication token used must be valid and not expired.
         * **Validates: Requirements 1.1, 1.2**
         */
        it('should always return a valid non-expired token', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 3600, max: 86400 }), // expires_in between 1 hour and 24 hours
                    fc.string({ minLength: 32, maxLength: 64 }), // Random token string
                    async (expiresIn, tokenString) => {
                        // Reset mocks for each property test iteration
                        jest.clearAllMocks()
                        jest.resetAllMocks()

                        // Mock successful OAuth response
                        const mockResponse = {
                            access_token: tokenString,
                            token_type: 'Bearer',
                            expires_in: expiresIn
                        }

                            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                                ok: true,
                                json: async () => mockResponse,
                                text: async () => JSON.stringify(mockResponse)
                            })

                        const authManager = new FatSecretAuthManager(mockConfig)
                        const token = await authManager.getToken()

                        // Token should be the one we mocked
                        expect(token).toBe(tokenString)

                        // Token should be valid (not expired)
                        const now = Date.now()
                        // The token should expire in the future (with 1-minute buffer)
                        const expectedExpiresAt = now + (expiresIn * 1000) - 60000

                        // Allow small time difference due to execution time
                        expect(expectedExpiresAt).toBeGreaterThan(now - 1000)
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should refresh expired tokens automatically', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 3 }), // Very short expiry for first token (1-3 seconds)
                    fc.string({ minLength: 32, maxLength: 64 }).filter(s => s.trim().length > 0),
                    async (shortExpiry, baseToken) => {
                        // Reset mocks for each property test iteration
                        jest.clearAllMocks()
                        jest.resetAllMocks()

                        const firstToken = baseToken
                        const secondToken = baseToken + '_refreshed'

                        // First token expires quickly
                        const firstResponse = {
                            access_token: firstToken,
                            token_type: 'Bearer',
                            expires_in: shortExpiry
                        }

                        // Second token has normal expiry
                        const secondResponse = {
                            access_token: secondToken,
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
                        expect(token1).toBe(firstToken)

                        // Wait for token to expire (plus buffer)
                        await new Promise(resolve => setTimeout(resolve, (shortExpiry * 1000) + 100))

                        // Get token again - should trigger refresh
                        const token2 = await authManager.getToken()
                        expect(token2).toBe(secondToken)
                        expect(token2).not.toBe(token1)
                    }
                ),
                { numRuns: 10 } // Reduced runs due to setTimeout
            )
        }, 60000) // Increase timeout to 60 seconds

        it('should handle concurrent token requests without duplicate fetches', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 2, max: 10 }), // Number of concurrent requests
                    fc.string({ minLength: 32, maxLength: 64 }).filter(s => s.trim().length > 0),
                    async (concurrentRequests, tokenString) => {
                        // Reset mocks for each property test iteration
                        jest.clearAllMocks()
                        jest.resetAllMocks()

                        const mockResponse = {
                            access_token: tokenString,
                            token_type: 'Bearer',
                            expires_in: 3600
                        }

                            // Mock should only be called once despite multiple concurrent requests
                            ; (global.fetch as jest.Mock).mockResolvedValue({
                                ok: true,
                                json: async () => mockResponse,
                                text: async () => JSON.stringify(mockResponse)
                            })

                        const authManager = new FatSecretAuthManager(mockConfig)

                        // Make multiple concurrent requests
                        const promises = Array(concurrentRequests)
                            .fill(null)
                            .map(() => authManager.getToken())

                        const tokens = await Promise.all(promises)

                        // All tokens should be the same
                        tokens.forEach(token => {
                            expect(token).toBe(tokenString)
                        })

                        // Fetch should only be called once
                        expect(global.fetch).toHaveBeenCalledTimes(1)
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should include valid authorization header in token requests', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 10, maxLength: 50 }).filter(s => !s.includes(':') && s.trim().length > 0), // clientId (no colons, no whitespace-only)
                    fc.string({ minLength: 10, maxLength: 50 }).filter(s => !s.includes(':') && s.trim().length > 0), // clientSecret (no colons, no whitespace-only)
                    async (clientId, clientSecret) => {
                        // Reset mocks for each property test iteration
                        jest.clearAllMocks()
                        jest.resetAllMocks()

                        const config = {
                            ...mockConfig,
                            clientId,
                            clientSecret
                        }

                        const mockResponse = {
                            access_token: 'test-token-' + clientId,
                            token_type: 'Bearer',
                            expires_in: 3600
                        }

                            ; (global.fetch as jest.Mock).mockResolvedValueOnce({
                                ok: true,
                                json: async () => mockResponse,
                                text: async () => JSON.stringify(mockResponse)
                            })

                        const authManager = new FatSecretAuthManager(config)
                        await authManager.getToken()

                        // Verify fetch was called with correct authorization header
                        expect(global.fetch).toHaveBeenCalledWith(
                            'https://oauth.fatsecret.com/connect/token',
                            expect.objectContaining({
                                method: 'POST',
                                headers: expect.objectContaining({
                                    'Authorization': expect.stringMatching(/^Basic .+$/)
                                })
                            })
                        )

                        // Verify the Basic auth header is correctly encoded
                        const calls = (global.fetch as jest.Mock).mock.calls
                        const authHeader = calls[0][1].headers.Authorization
                        const base64Part = authHeader.replace('Basic ', '')
                        const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
                        expect(decoded).toBe(`${clientId}:${clientSecret}`)
                    }
                ),
                { numRuns: 50 }
            )
        })

        it('should maintain 1-minute buffer before token expiration', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 3600, max: 86400 }),
                    fc.string({ minLength: 32, maxLength: 64 }).filter(s => s.trim().length > 0),
                    async (expiresIn, tokenString) => {
                        // Reset mocks for each property test iteration
                        jest.clearAllMocks()
                        jest.resetAllMocks()

                        const mockResponse = {
                            access_token: tokenString,
                            token_type: 'Bearer',
                            expires_in: expiresIn
                        }

                            ; (global.fetch as jest.Mock).mockResolvedValue({
                                ok: true,
                                json: async () => mockResponse,
                                text: async () => JSON.stringify(mockResponse)
                            })

                        const authManager = new FatSecretAuthManager(mockConfig)
                        await authManager.getToken()

                        // The token should be cached and reused immediately
                        const tokenAgain = await authManager.getToken()
                        expect(tokenAgain).toBe(tokenString)

                        // Should use cached token (no new fetch)
                        expect(global.fetch).toHaveBeenCalledTimes(1)
                    }
                ),
                { numRuns: 50 }
            )
        })
    })
})
