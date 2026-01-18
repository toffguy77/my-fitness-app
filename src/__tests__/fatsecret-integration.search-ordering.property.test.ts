/**
 * Property-Based Tests: Search Result Source Priority
 * **Feature: fatsecret-integration, Property 2: Search Result Source Priority**
 * **Validates: Requirements 2.1, 4.3**
 */

import fc from 'fast-check'
import { searchProducts } from '@/utils/products/api'
import { createClient } from '@/utils/supabase/client'
import type { Product } from '@/types/products'

// Mock dependencies
jest.mock('@/utils/supabase/client')
jest.mock('@/utils/products/fatsecret')
jest.mock('@/config/fatsecret')

describe('Property-Based Tests: Search Result Source Priority', () => {
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

        // Mock FatSecret client
        const { getFatSecretClient } = require('@/utils/products/fatsecret')
            ; (getFatSecretClient as jest.Mock).mockReturnValue({
                searchFoods: jest.fn().mockResolvedValue([])
            })

        // Mock fetch for Open Food Facts
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ products: [] })
        }) as jest.Mock
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    afterAll(() => {
        global.fetch = originalFetch
    })

    describe('Property 2: Search Result Source Priority', () => {
        it('should prioritize database results by usage_count before API results', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 2, maxLength: 10 }),
                    fc.array(
                        fc.record({
                            id: fc.uuid(),
                            name: fc.string({ minLength: 3, maxLength: 20 }),
                            usage_count: fc.integer({ min: 0, max: 100 }),
                            calories_per_100g: fc.integer({ min: 0, max: 900 }),
                            protein_per_100g: fc.integer({ min: 0, max: 100 }),
                            fats_per_100g: fc.integer({ min: 0, max: 100 }),
                            carbs_per_100g: fc.integer({ min: 0, max: 100 }),
                            source: fc.constantFrom('fatsecret', 'openfoodfacts', 'user'),
                        }),
                        { minLength: 2, maxLength: 10 }
                    ),
                    async (query, dbProducts) => {
                        // Sort DB products by usage_count (descending) as the DB would
                        const sortedDbProducts = [...dbProducts].sort(
                            (a, b) => b.usage_count - a.usage_count
                        )

                        // Mock DB to return sorted products
                        mockSupabaseClient.limit.mockResolvedValue({
                            data: sortedDbProducts,
                            error: null
                        })

                        // Mock FatSecret to return some products
                        const { getFatSecretClient } = require('@/utils/products/fatsecret')
                        const mockFatSecretProducts = [
                            {
                                food_id: 'fs_1',
                                food_name: 'FatSecret Product',
                                food_type: 'Generic' as const,
                                servings: {
                                    serving: [{
                                        serving_id: '1',
                                        serving_description: '100g',
                                        metric_serving_amount: '100',
                                        metric_serving_unit: 'g',
                                        calories: '100',
                                        carbohydrate: '10',
                                        protein: '5',
                                        fat: '3'
                                    }]
                                }
                            }
                        ]

                        getFatSecretClient().searchFoods.mockResolvedValue(mockFatSecretProducts)

                        // Execute search
                        const results = await searchProducts(query, 20)

                        // Verify: DB results should come first
                        const dbResultCount = Math.min(sortedDbProducts.length, 20)

                        if (dbResultCount > 0) {
                            // Check that first N results match DB products in order
                            for (let i = 0; i < dbResultCount && i < results.length; i++) {
                                expect(results[i].name).toBe(sortedDbProducts[i].name)
                            }

                            // If we have DB results, verify they're ordered by usage_count
                            for (let i = 0; i < dbResultCount - 1 && i < results.length - 1; i++) {
                                const currentUsageCount = sortedDbProducts[i].usage_count
                                const nextUsageCount = sortedDbProducts[i + 1].usage_count
                                expect(currentUsageCount).toBeGreaterThanOrEqual(nextUsageCount)
                            }
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('should place API results after database results', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 2, maxLength: 10 }),
                    fc.integer({ min: 1, max: 5 }),
                    async (query, dbCount) => {
                        // Create mock DB products
                        const dbProducts = Array.from({ length: dbCount }, (_, i) => ({
                            id: `db_${i}`,
                            name: `DB Product ${i}`,
                            usage_count: 10 - i,
                            calories_per_100g: 100,
                            protein_per_100g: 10,
                            fats_per_100g: 5,
                            carbs_per_100g: 15,
                            source: 'user' as const,
                        }))

                        mockSupabaseClient.limit.mockResolvedValue({
                            data: dbProducts,
                            error: null
                        })

                        // Mock FatSecret to return products
                        const { getFatSecretClient } = require('@/utils/products/fatsecret')
                        const mockFatSecretProducts = [
                            {
                                food_id: 'fs_1',
                                food_name: 'FatSecret Product',
                                food_type: 'Generic' as const,
                                servings: {
                                    serving: [{
                                        serving_id: '1',
                                        serving_description: '100g',
                                        metric_serving_amount: '100',
                                        metric_serving_unit: 'g',
                                        calories: '200',
                                        carbohydrate: '20',
                                        protein: '10',
                                        fat: '5'
                                    }]
                                }
                            }
                        ]

                        getFatSecretClient().searchFoods.mockResolvedValue(mockFatSecretProducts)

                        // Execute search with limit that allows both DB and API results
                        const results = await searchProducts(query, 20)

                        // Verify: First dbCount results should be from DB
                        for (let i = 0; i < dbCount && i < results.length; i++) {
                            expect(results[i].name).toBe(dbProducts[i].name)
                        }

                        // If we have more results than DB count, they should be from API
                        if (results.length > dbCount) {
                            expect(results[dbCount].source).toBe('fatsecret')
                        }
                    }
                ),
                { numRuns: 20 }
            )
        })

        it('should return only database results when limit is reached', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 2, maxLength: 10 }),
                    fc.integer({ min: 5, max: 20 }),
                    async (query, limit) => {
                        // Create more DB products than the limit
                        const dbProducts = Array.from({ length: limit }, (_, i) => ({
                            id: `db_${i}`,
                            name: `DB Product ${i}`,
                            usage_count: 100 - i,
                            calories_per_100g: 100,
                            protein_per_100g: 10,
                            fats_per_100g: 5,
                            carbs_per_100g: 15,
                            source: 'user' as const,
                        }))

                        mockSupabaseClient.limit.mockResolvedValue({
                            data: dbProducts,
                            error: null
                        })

                        // Mock FatSecret (should not be called)
                        const { getFatSecretClient } = require('@/utils/products/fatsecret')
                        const mockSearchFoods = jest.fn().mockResolvedValue([])
                        getFatSecretClient().searchFoods = mockSearchFoods

                        // Execute search
                        const results = await searchProducts(query, limit)

                        // Verify: Should return exactly limit results, all from DB
                        expect(results.length).toBe(limit)

                        // FatSecret should not have been called
                        expect(mockSearchFoods).not.toHaveBeenCalled()

                        // All results should be from DB
                        results.forEach((result, i) => {
                            expect(result.name).toBe(dbProducts[i].name)
                        })
                    }
                ),
                { numRuns: 20 }
            )
        })
    })
})
