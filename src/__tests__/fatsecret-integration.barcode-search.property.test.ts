/**
 * Property-Based Tests: Barcode Search Priority
 * **Feature: fatsecret-integration, Property 7: Barcode Search Priority**
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

import fc from 'fast-check'
import { getProductByBarcode } from '@/utils/products/api'
import { createClient } from '@/utils/supabase/client'

// Mock dependencies
jest.mock('@/utils/supabase/client')
jest.mock('@/utils/products/fatsecret')
jest.mock('@/config/fatsecret')

describe('Property-Based Tests: Barcode Search Priority', () => {
    let mockSupabaseClient: any
    let originalFetch: typeof global.fetch

    beforeAll(() => {
        originalFetch = global.fetch
    })

    beforeEach(() => {
        jest.clearAllMocks()

        // Mock Supabase client
        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
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

    describe('Property 7: Barcode Search Priority', () => {
        it('should check database first before calling APIs', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('1234567890123', '5449000000996', '0123456789012'),
                    async (barcode) => {
                        // Mock DB to return a product
                        mockSupabaseClient.single.mockResolvedValue({
                            data: {
                                id: 'db_123',
                                name: 'DB Product',
                                barcode,
                                calories_per_100g: 100,
                                protein_per_100g: 10,
                                fats_per_100g: 5,
                                carbs_per_100g: 15,
                                source: 'user'
                            },
                            error: null
                        })

                        // Mock FatSecret (should not be called)
                        const { getFatSecretClient } = require('@/utils/products/fatsecret')
                        const mockFindFoodByBarcode = jest.fn()
                            ; (getFatSecretClient as jest.Mock).mockReturnValue({
                                findFoodByBarcode: mockFindFoodByBarcode
                            })

                        // Mock Open Food Facts (should not be called)
                        const mockFetch = jest.fn()
                        global.fetch = mockFetch as jest.Mock

                        // Execute barcode search
                        const result = await getProductByBarcode(barcode)

                        // Verify: Should return DB result
                        expect(result).not.toBeNull()
                        expect(result?.source).toBe('user')
                        expect(result?.barcode).toBe(barcode)

                        // APIs should not have been called
                        expect(mockFindFoodByBarcode).not.toHaveBeenCalled()
                        expect(mockFetch).not.toHaveBeenCalled()
                    }
                ),
                { numRuns: 3 }
            )
        })

        it('should try FatSecret after database miss', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('9876543210987', '4006381333931', '8712100000000'),
                    async (barcode) => {
                        // Mock DB to return no result
                        mockSupabaseClient.single.mockResolvedValue({
                            data: null,
                            error: null
                        })

                        // Mock FatSecret to return a product
                        const { getFatSecretClient } = require('@/utils/products/fatsecret')
                            ; (getFatSecretClient as jest.Mock).mockReturnValue({
                                findFoodByBarcode: jest.fn().mockResolvedValue({
                                    food_id: 'fs_456',
                                    food_name: 'FatSecret Product',
                                    food_type: 'Generic' as const,
                                    servings: {
                                        serving: [{
                                            serving_id: '1',
                                            serving_description: '100g',
                                            metric_serving_amount: '100',
                                            metric_serving_unit: 'g',
                                            calories: '150',
                                            carbohydrate: '20',
                                            protein: '8',
                                            fat: '6'
                                        }]
                                    }
                                })
                            })

                        // Mock Open Food Facts (should not be called)
                        const mockFetch = jest.fn()
                        global.fetch = mockFetch as jest.Mock

                        // Execute barcode search
                        const result = await getProductByBarcode(barcode)

                        // Verify: Should return FatSecret result
                        expect(result).not.toBeNull()
                        expect(result?.source).toBe('fatsecret')
                        expect(result?.barcode).toBe(barcode)

                        // Open Food Facts should not have been called
                        expect(mockFetch).not.toHaveBeenCalled()
                    }
                ),
                { numRuns: 3 }
            )
        })

        it('should try Open Food Facts after FatSecret fails', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('1111111111111', '2222222222222', '3333333333333'),
                    async (barcode) => {
                        // Mock DB to return no result
                        mockSupabaseClient.single.mockResolvedValue({
                            data: null,
                            error: null
                        })

                        // Mock FatSecret to throw error
                        const { getFatSecretClient } = require('@/utils/products/fatsecret')
                            ; (getFatSecretClient as jest.Mock).mockReturnValue({
                                findFoodByBarcode: jest.fn().mockRejectedValue(new Error('Not found'))
                            })

                        // Mock Open Food Facts to return a product
                        global.fetch = jest.fn().mockResolvedValue({
                            ok: true,
                            json: async () => ({
                                status: 1,
                                product: {
                                    code: barcode,
                                    product_name: 'OFF Product',
                                    nutriments: {
                                        'energy-kcal_100g': 180,
                                        'proteins_100g': 7,
                                        'fat_100g': 6,
                                        'carbohydrates_100g': 22
                                    }
                                }
                            })
                        }) as jest.Mock

                        // Execute barcode search
                        const result = await getProductByBarcode(barcode)

                        // Verify: Should return Open Food Facts result
                        expect(result).not.toBeNull()
                        expect(result?.source).toBe('openfoodfacts')
                        expect(result?.barcode).toBe(barcode)
                    }
                ),
                { numRuns: 3 }
            )
        })
    })
})
