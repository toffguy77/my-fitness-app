/**
 * Integration Tests: FatSecret Error Logging
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * Tests that verify error logging behavior for FatSecret API integration.
 * These tests focus on verifying that errors are properly logged with context.
 */

import { searchProducts, getProductByBarcode } from '@/utils/products/api'
import { logger } from '@/utils/logger'
import { createClient } from '@/utils/supabase/client'

// Mock dependencies
jest.mock('@/utils/logger')
jest.mock('@/utils/supabase/client')
jest.mock('@/config/fatsecret')

describe('FatSecret Error Logging', () => {
    let mockSupabaseClient: any
    let originalFetch: typeof global.fetch
    let mockLogger: jest.Mocked<typeof logger>

    beforeAll(() => {
        originalFetch = global.fetch
        mockLogger = logger as jest.Mocked<typeof logger>
    })

    beforeEach(() => {
        jest.clearAllMocks()

        // Mock Supabase client
        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            or: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest.fn(),
            insert: jest.fn().mockReturnThis(),
        }

            ; (createClient as jest.Mock).mockReturnValue(mockSupabaseClient)

        // Mock FatSecret config
        const { getFatSecretConfig } = require('@/config/fatsecret')
            ; (getFatSecretConfig as jest.Mock).mockReturnValue({
                enabled: true,
                clientId: 'test_id',
                clientSecret: 'test_secret',
                baseUrl: 'https://platform.fatsecret.com/rest/server.api',
                timeout: 5000,
                maxResults: 20,
                fallbackEnabled: true
            })
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    describe('Requirement 8.1: Log API requests with parameters and timestamp', () => {
        it('should log search requests with query parameters', async () => {
            const query = 'test product'

            // Mock DB to return no results
            mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null })

            // Mock OAuth and API to succeed
            global.fetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        access_token: 'test_token',
                        token_type: 'Bearer',
                        expires_in: 3600
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ foods: { food: [] } })
                }) as jest.Mock

            await searchProducts(query, 20)

            // Verify request was logged with parameters
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('starting product search'),
                expect.objectContaining({
                    query,
                    limit: 20,
                    timestamp: expect.any(String)
                })
            )
        })
    })

    describe('Requirement 8.2: Log API errors with details and context', () => {
        it('should log FatSecret API errors with full context', async () => {
            const query = 'error test'

            // Mock DB to return no results
            mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null })

            // Mock OAuth to succeed
            const mockFetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        access_token: 'test_token',
                        token_type: 'Bearer',
                        expires_in: 3600
                    })
                })

            // Mock API to fail (initial + 2 retries = 3 total)
            for (let i = 0; i < 3; i++) {
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: async () => 'Server error'
                })
            }

            // Mock Open Food Facts fallback to also fail
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            })

            global.fetch = mockFetch as jest.Mock

            await searchProducts(query, 20)

            // Verify error was logged (either from FatSecret client or from the API layer)
            const errorCalls = mockLogger.error.mock.calls
            const hasApiError = errorCalls.some(call =>
                call[0].includes('API error') || call[0].includes('both APIs failed')
            )
            expect(hasApiError).toBe(true)
        })

        it('should log barcode search errors with barcode context', async () => {
            const barcode = '1234567890123'

            // Mock DB to return no result
            mockSupabaseClient.single.mockResolvedValue({ data: null, error: null })

            // Mock OAuth to succeed
            global.fetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        access_token: 'test_token',
                        token_type: 'Bearer',
                        expires_in: 3600
                    })
                })
                // Mock FatSecret barcode to fail
                .mockResolvedValue({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                    text: async () => 'Server error'
                })
                // Mock Open Food Facts to return not found
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found'
                }) as jest.Mock

            await getProductByBarcode(barcode)

            // Verify barcode context was logged
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('barcode'),
                expect.objectContaining({
                    barcode
                })
            )
        })
    })

    describe('Requirement 8.3: Log fallback activations with reason', () => {
        it('should log fallback when FatSecret returns no results', async () => {
            const query = 'fallback test'

            // Mock DB to return no results
            mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null })

            // Mock OAuth and FatSecret to return empty
            global.fetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        access_token: 'test_token',
                        token_type: 'Bearer',
                        expires_in: 3600
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ foods: {} }) // No results
                })
                // Mock Open Food Facts fallback
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        products: [{
                            code: 'off_123',
                            product_name: 'Fallback Product',
                            nutriments: {
                                'energy-kcal_100g': 150,
                                'proteins_100g': 8,
                                'fat_100g': 5,
                                'carbohydrates_100g': 20
                            }
                        }]
                    })
                }) as jest.Mock

            await searchProducts(query, 20)

            // Verify fallback was logged with reason
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('fallback'),
                expect.objectContaining({
                    query,
                    reason: 'no_results',
                    fallbackSource: 'openfoodfacts'
                })
            )
        })

        it('should log fallback when FatSecret API fails', async () => {
            const query = 'api error test'

            // Mock DB to return no results
            mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null })

            // Mock OAuth to succeed, API to fail
            global.fetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        access_token: 'test_token',
                        token_type: 'Bearer',
                        expires_in: 3600
                    })
                })
                .mockResolvedValue({
                    ok: false,
                    status: 503,
                    statusText: 'Service Unavailable',
                    text: async () => 'Service down'
                })
                // Mock Open Food Facts fallback
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ products: [] })
                }) as jest.Mock

            await searchProducts(query, 20)

            // Verify fallback activation was logged
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('activating fallback'),
                expect.objectContaining({
                    query,
                    reason: 'api_error',
                    fallbackSource: 'openfoodfacts',
                    timestamp: expect.any(String)
                })
            )
        })
    })

    describe('Graceful Error Handling', () => {
        it('should return database results when both APIs fail', async () => {
            const query = 'both fail test'
            const dbProducts = [
                {
                    id: 'db_1',
                    name: 'DB Product',
                    usage_count: 10,
                    calories_per_100g: 100,
                    protein_per_100g: 10,
                    fats_per_100g: 5,
                    carbs_per_100g: 15,
                    source: 'user'
                }
            ]

            // Mock DB to return products
            mockSupabaseClient.limit.mockResolvedValue({ data: dbProducts, error: null })

            // Mock OAuth to succeed
            global.fetch = jest.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        access_token: 'test_token',
                        token_type: 'Bearer',
                        expires_in: 3600
                    })
                })
                // Mock FatSecret to fail
                .mockRejectedValueOnce(new Error('FatSecret error'))
                // Mock Open Food Facts to fail
                .mockRejectedValueOnce(new Error('Open Food Facts error')) as jest.Mock

            const results = await searchProducts(query, 20)

            // Should return DB results
            expect(results.length).toBe(1)
            expect(results[0].name).toBe('DB Product')

            // Verify error was logged
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('both APIs failed'),
                expect.any(Object)
            )
        })
    })
})
