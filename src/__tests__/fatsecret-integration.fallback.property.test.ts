/**
 * Property-Based Tests: Fallback Activation
 * **Feature: fatsecret-integration, Property 3: Fallback Activation**
 * **Validates: Requirements 2.3, 2.6, 5.1, 5.2**
 */

import { searchProducts, getProductByBarcode } from '@/utils/products/api'
import { createClient } from '@/utils/supabase/client'

// Mock dependencies
jest.mock('@/utils/supabase/client')
jest.mock('@/utils/products/fatsecret')
jest.mock('@/config/fatsecret')

describe('Property-Based Tests: Fallback Activation', () => {
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

    describe('Property 3: Fallback Activation', () => {
        it('should fallback to Open Food Facts when FatSecret returns no results', async () => {
            // Mock DB to return no results
            mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null })

            // Mock FatSecret to return empty results
            const { getFatSecretClient } = require('@/utils/products/fatsecret')
                ; (getFatSecretClient as jest.Mock).mockReturnValue({
                    searchFoods: jest.fn().mockResolvedValue([])
                })

            // Mock Open Food Facts to return results
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    products: [{
                        code: 'off_123',
                        product_name: 'OFF Product',
                        nutriments: {
                            'energy-kcal_100g': 150,
                            'proteins_100g': 8,
                            'fat_100g': 5,
                            'carbohydrates_100g': 20
                        }
                    }]
                })
            }) as jest.Mock

            const results = await searchProducts('apple', 20)

            expect(results.length).toBeGreaterThan(0)
            expect(results[0].source).toBe('openfoodfacts')
            expect(results[0].name).toBe('OFF Product')
        })

        it('should fallback to Open Food Facts when FatSecret throws error', async () => {
            // Mock DB to return no results
            mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null })

            // Mock FatSecret to throw error
            const { getFatSecretClient } = require('@/utils/products/fatsecret')
                ; (getFatSecretClient as jest.Mock).mockReturnValue({
                    searchFoods: jest.fn().mockRejectedValue(new Error('API error'))
                })

            // Mock Open Food Facts to return results
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    products: [{
                        code: 'off_456',
                        product_name: 'Fallback Product',
                        nutriments: {
                            'energy-kcal_100g': 200,
                            'proteins_100g': 10,
                            'fat_100g': 8,
                            'carbohydrates_100g': 25
                        }
                    }]
                })
            }) as jest.Mock

            const results = await searchProducts('pasta', 20)

            expect(results.length).toBeGreaterThan(0)
            expect(results[0].source).toBe('openfoodfacts')
            expect(results[0].name).toBe('Fallback Product')
        })

        it('should not use fallback when FatSecret succeeds', async () => {
            // Mock DB to return no results
            mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null })

            // Mock FatSecret to return results
            const { getFatSecretClient } = require('@/utils/products/fatsecret')
                ; (getFatSecretClient as jest.Mock).mockReturnValue({
                    searchFoods: jest.fn().mockResolvedValue([{
                        food_id: 'fs_789',
                        food_name: 'FatSecret Product',
                        food_type: 'Generic' as const,
                        servings: {
                            serving: [{
                                serving_id: '1',
                                serving_description: '100g',
                                metric_serving_amount: '100',
                                metric_serving_unit: 'g',
                                calories: '250',
                                carbohydrate: '30',
                                protein: '12',
                                fat: '10'
                            }]
                        }
                    }])
                })

            const mockFetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ products: [] })
            })
            global.fetch = mockFetch as jest.Mock

            const results = await searchProducts('tomato', 20)

            expect(results.length).toBeGreaterThan(0)
            expect(results[0].source).toBe('fatsecret')
            expect(results[0].name).toBe('FatSecret Product')
            expect(mockFetch).not.toHaveBeenCalled()
        })

        it('should return only DB results when both APIs fail', async () => {
            // Mock DB to return products
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
            mockSupabaseClient.limit.mockResolvedValue({ data: dbProducts, error: null })

            // Mock FatSecret to throw error
            const { getFatSecretClient } = require('@/utils/products/fatsecret')
                ; (getFatSecretClient as jest.Mock).mockReturnValue({
                    searchFoods: jest.fn().mockRejectedValue(new Error('FatSecret error'))
                })

            // Mock Open Food Facts to also fail
            global.fetch = jest.fn().mockRejectedValue(new Error('Open Food Facts error')) as jest.Mock

            const results = await searchProducts('chicken', 20)

            expect(results.length).toBe(1)
            expect(results[0].name).toBe('DB Product')
            expect(results[0].source).toBe('user')
        })

        it('should fallback for barcode search when FatSecret fails', async () => {
            const barcode = '1234567890123'

            // Mock DB to return no result
            mockSupabaseClient.single.mockResolvedValue({ data: null, error: null })

            // Mock FatSecret to throw error
            const { getFatSecretClient } = require('@/utils/products/fatsecret')
                ; (getFatSecretClient as jest.Mock).mockReturnValue({
                    findFoodByBarcode: jest.fn().mockRejectedValue(new Error('Not found'))
                })

            // Mock Open Food Facts to return product
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    status: 1,
                    product: {
                        code: barcode,
                        product_name: 'Barcode Product',
                        nutriments: {
                            'energy-kcal_100g': 180,
                            'proteins_100g': 7,
                            'fat_100g': 6,
                            'carbohydrates_100g': 22
                        }
                    }
                })
            }) as jest.Mock

            const result = await getProductByBarcode(barcode)

            expect(result).not.toBeNull()
            expect(result?.source).toBe('openfoodfacts')
            expect(result?.barcode).toBe(barcode)
            expect(result?.name).toBe('Barcode Product')
        })
    })
})
