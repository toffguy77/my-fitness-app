/**
 * Property-Based Tests: FatSecret API Request Authentication
 * **Feature: fatsecret-integration, Property: All API requests include valid auth token**
 * **Validates: Requirements 1.1**
 */

import fc from 'fast-check'
import { FatSecretClient, resetFatSecretClient } from '@/utils/products/fatsecret'
import { resetFatSecretAuthManager } from '@/utils/products/fatsecret-auth'
import type { FatSecretConfiguration } from '@/config/fatsecret'

describe('Property-Based Tests: FatSecret API Request Authentication', () => {
    let capturedAuthHeaders: string[]
    let originalFetch: typeof global.fetch

    beforeAll(() => {
        originalFetch = global.fetch
    })

    beforeEach(() => {
        capturedAuthHeaders = []

        global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input.toString()

            // Capture Authorization header
            if (init?.headers) {
                const headers = init.headers as Record<string, string>
                if (headers['Authorization']) {
                    capturedAuthHeaders.push(headers['Authorization'])
                }
            }

            // Mock OAuth response
            if (url.includes('oauth.fatsecret.com')) {
                return {
                    ok: true,
                    json: async () => ({
                        access_token: 'test_token_123',
                        token_type: 'Bearer',
                        expires_in: 3600
                    })
                } as Response
            }

            // Mock API responses
            return {
                ok: true,
                json: async () => ({ foods: { food: [] } })
            } as Response
        }) as jest.Mock
    })

    afterEach(() => {
        jest.clearAllMocks()
        resetFatSecretClient()
        resetFatSecretAuthManager()
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    const testConfig: FatSecretConfiguration = {
        enabled: true,
        clientId: 'test_id',
        clientSecret: 'test_secret',
        baseUrl: 'https://platform.fatsecret.com/rest/server.api',
        timeout: 5000,
        maxResults: 20,
        fallbackEnabled: true,
        region: 'US',
        language: 'en'
    }

    describe('Property: All API requests include valid auth token', () => {
        it('should include Bearer token in search requests', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 2, maxLength: 10 }),
                    async (query) => {
                        capturedAuthHeaders = []
                        resetFatSecretClient()
                        resetFatSecretAuthManager()

                        const client = new FatSecretClient(testConfig)
                        await client.searchFoods(query, 10, 0)

                        // Should have at least one auth header (from API call, not OAuth)
                        const apiAuthHeaders = capturedAuthHeaders.filter(h => h.includes('test_token'))
                        expect(apiAuthHeaders.length).toBeGreaterThan(0)

                        // All should be Bearer tokens
                        apiAuthHeaders.forEach(header => {
                            expect(header).toMatch(/^Bearer .+/)
                        })
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should include Bearer token in getFoodById requests', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 10 }),
                    async (foodId) => {
                        capturedAuthHeaders = []
                        resetFatSecretClient()
                        resetFatSecretAuthManager()

                        const client = new FatSecretClient(testConfig)
                        await client.getFoodById(foodId)

                        const apiAuthHeaders = capturedAuthHeaders.filter(h => h.includes('test_token'))
                        expect(apiAuthHeaders.length).toBeGreaterThan(0)

                        apiAuthHeaders.forEach(header => {
                            expect(header).toMatch(/^Bearer .+/)
                        })
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should reuse same token for multiple requests', async () => {
            capturedAuthHeaders = []
            resetFatSecretClient()
            resetFatSecretAuthManager()

            const client = new FatSecretClient(testConfig)

            // Make multiple requests
            await client.searchFoods('apple', 10, 0)
            await client.searchFoods('banana', 10, 0)
            await client.getFoodById('123')

            const apiAuthHeaders = capturedAuthHeaders.filter(h => h.includes('test_token'))

            // Should have multiple headers
            expect(apiAuthHeaders.length).toBeGreaterThan(1)

            // All should be the same token
            const uniqueHeaders = new Set(apiAuthHeaders)
            expect(uniqueHeaders.size).toBe(1)
        })
    })
})
