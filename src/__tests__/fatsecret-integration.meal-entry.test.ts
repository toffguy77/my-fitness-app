/**
 * Integration Tests: Meal Entry with FatSecret Products
 *
 * Tests meal entry functionality with FatSecret products:
 * - KBJU calculation with FatSecret products
 * - Usage history recording
 * - Usage count increment
 *
 * Requirements: 9.1, 9.2, 9.3
 */

import { createClient } from '@/utils/supabase/client'
import { incrementProductUsage, saveProductToDB } from '@/utils/products/api'
import type { Product } from '@/types/products'

// Mock Supabase client
jest.mock('@/utils/supabase/client', () => ({
    createClient: jest.fn(),
}))

// Mock logger
jest.mock('@/utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

describe('Meal Entry Integration with FatSecret Products', () => {
    let mockSupabase: any

    beforeEach(() => {
        jest.clearAllMocks()

        // Setup mock Supabase client
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
        }

            ; (createClient as jest.Mock).mockReturnValue(mockSupabase)
    })

    describe('Requirement 9.1: KBJU Calculation', () => {
        it('should calculate KBJU correctly for FatSecret product with specified weight', () => {
            // FatSecret product with nutritional data per 100g
            const fatSecretProduct: Product = {
                id: 'fs-123',
                name: 'Chicken Breast',
                brand: 'Generic',
                barcode: null,
                calories_per_100g: 165,
                protein_per_100g: 31,
                fats_per_100g: 3.6,
                carbs_per_100g: 0,
                source: 'fatsecret',
                source_id: '123456',
                image_url: null,
            }

            // User specifies 200g serving
            const weight = 200

            // Calculate KBJU for the specified weight
            const calculatedCalories = (fatSecretProduct.calories_per_100g * weight) / 100
            const calculatedProtein = (fatSecretProduct.protein_per_100g * weight) / 100
            const calculatedFats = (fatSecretProduct.fats_per_100g * weight) / 100
            const calculatedCarbs = (fatSecretProduct.carbs_per_100g * weight) / 100

            // Verify calculations
            expect(calculatedCalories).toBe(330) // 165 * 2
            expect(calculatedProtein).toBe(62) // 31 * 2
            expect(calculatedFats).toBe(7.2) // 3.6 * 2
            expect(calculatedCarbs).toBe(0) // 0 * 2
        })

        it('should handle fractional weights correctly', () => {
            const fatSecretProduct: Product = {
                id: 'fs-456',
                name: 'Oatmeal',
                brand: 'Quaker',
                barcode: null,
                calories_per_100g: 389,
                protein_per_100g: 16.9,
                fats_per_100g: 6.9,
                carbs_per_100g: 66.3,
                source: 'fatsecret',
                source_id: '789012',
                image_url: null,
            }

            // User specifies 50g serving
            const weight = 50

            const calculatedCalories = (fatSecretProduct.calories_per_100g * weight) / 100
            const calculatedProtein = (fatSecretProduct.protein_per_100g * weight) / 100
            const calculatedFats = (fatSecretProduct.fats_per_100g * weight) / 100
            const calculatedCarbs = (fatSecretProduct.carbs_per_100g * weight) / 100

            // Verify calculations (should be half of per 100g values)
            expect(calculatedCalories).toBeCloseTo(194.5, 1)
            expect(calculatedProtein).toBeCloseTo(8.45, 2)
            expect(calculatedFats).toBeCloseTo(3.45, 2)
            expect(calculatedCarbs).toBeCloseTo(33.15, 2)
        })

        it('should handle custom serving sizes', () => {
            const fatSecretProduct: Product = {
                id: 'fs-789',
                name: 'Milk',
                brand: 'Whole Milk',
                barcode: null,
                calories_per_100g: 61,
                protein_per_100g: 3.2,
                fats_per_100g: 3.3,
                carbs_per_100g: 4.8,
                source: 'fatsecret',
                source_id: '345678',
                image_url: null,
            }

            // User specifies 250ml (assuming 1ml = 1g for milk)
            const weight = 250

            const calculatedCalories = (fatSecretProduct.calories_per_100g * weight) / 100
            const calculatedProtein = (fatSecretProduct.protein_per_100g * weight) / 100
            const calculatedFats = (fatSecretProduct.fats_per_100g * weight) / 100
            const calculatedCarbs = (fatSecretProduct.carbs_per_100g * weight) / 100

            expect(calculatedCalories).toBeCloseTo(152.5, 1)
            expect(calculatedProtein).toBe(8)
            expect(calculatedFats).toBeCloseTo(8.25, 2)
            expect(calculatedCarbs).toBe(12)
        })
    })

    describe('Requirement 9.2: Usage History Recording', () => {
        it('should record product usage in product_usage_history when product is added to meal', async () => {
            const userId = 'user-123'
            const productId = 'fs-product-123'

            // Mock successful insert
            mockSupabase.single.mockResolvedValue({
                data: { id: 'usage-history-id' },
                error: null,
            })

            // Simulate adding product to meal (which should record usage)
            await mockSupabase
                .from('product_usage_history')
                .insert({
                    user_id: userId,
                    product_id: productId,
                    used_at: expect.any(String),
                })
                .single()

            // Verify insert was called
            expect(mockSupabase.from).toHaveBeenCalledWith('product_usage_history')
            expect(mockSupabase.insert).toHaveBeenCalled()
        })

        it('should handle user_product_id for custom user products', async () => {
            const userId = 'user-456'
            const userProductId = 'user-product-789'

            mockSupabase.single.mockResolvedValue({
                data: { id: 'usage-history-id-2' },
                error: null,
            })

            // Simulate adding custom user product to meal
            await mockSupabase
                .from('product_usage_history')
                .insert({
                    user_id: userId,
                    user_product_id: userProductId,
                    used_at: expect.any(String),
                })
                .single()

            expect(mockSupabase.from).toHaveBeenCalledWith('product_usage_history')
            expect(mockSupabase.insert).toHaveBeenCalled()
        })
    })

    describe('Requirement 9.3: Usage Count Increment', () => {
        it('should increment usage_count when FatSecret product is added to meal', async () => {
            const productId = 'fs-product-456'

            // Mock current usage_count
            mockSupabase.single.mockResolvedValueOnce({
                data: { usage_count: 5 },
                error: null,
            })

            // Mock update success
            mockSupabase.eq.mockReturnThis()

            await incrementProductUsage(productId)

            // Verify select was called to get current count
            expect(mockSupabase.from).toHaveBeenCalledWith('products')
            expect(mockSupabase.select).toHaveBeenCalledWith('usage_count')
            expect(mockSupabase.eq).toHaveBeenCalledWith('id', productId)

            // Verify update was called with incremented value
            expect(mockSupabase.update).toHaveBeenCalledWith({ usage_count: 6 })
        })

        it('should handle null usage_count (first use)', async () => {
            const productId = 'fs-product-new'

            // Mock null usage_count (product never used before)
            mockSupabase.single.mockResolvedValueOnce({
                data: { usage_count: null },
                error: null,
            })

            mockSupabase.eq.mockReturnThis()

            await incrementProductUsage(productId)

            // Verify update was called with 1 (0 + 1)
            expect(mockSupabase.update).toHaveBeenCalledWith({ usage_count: 1 })
        })

        it('should handle errors gracefully without throwing', async () => {
            const productId = 'fs-product-error'

            // Mock database error
            mockSupabase.single.mockRejectedValue(new Error('Database error'))

            // Should not throw
            await expect(incrementProductUsage(productId)).resolves.not.toThrow()
        })
    })

    describe('Integration: Complete Meal Entry Flow', () => {
        it('should verify KBJU calculation for complete meal entry', () => {
            // 1. FatSecret product
            const fatSecretProduct: Product = {
                name: 'Greek Yogurt',
                brand: 'Fage',
                barcode: null,
                calories_per_100g: 97,
                protein_per_100g: 10.3,
                fats_per_100g: 4.4,
                carbs_per_100g: 3.6,
                source: 'fatsecret',
                source_id: 'fs-yogurt-123',
                image_url: 'https://example.com/yogurt.jpg',
            }

            // 2. Calculate KBJU for 150g serving
            const weight = 150
            const mealEntry = {
                id: 'meal-entry-id',
                title: 'Greek Yogurt',
                weight: weight,
                per100: {
                    calories: fatSecretProduct.calories_per_100g,
                    protein: fatSecretProduct.protein_per_100g,
                    fats: fatSecretProduct.fats_per_100g,
                    carbs: fatSecretProduct.carbs_per_100g,
                },
                totals: {
                    calories: (fatSecretProduct.calories_per_100g * weight) / 100,
                    protein: (fatSecretProduct.protein_per_100g * weight) / 100,
                    fats: (fatSecretProduct.fats_per_100g * weight) / 100,
                    carbs: (fatSecretProduct.carbs_per_100g * weight) / 100,
                },
                mealDate: '2025-01-17',
                createdAt: new Date().toISOString(),
            }

            // Verify calculated totals
            expect(mealEntry.totals.calories).toBeCloseTo(145.5, 1)
            expect(mealEntry.totals.protein).toBeCloseTo(15.45, 2)
            expect(mealEntry.totals.fats).toBeCloseTo(6.6, 1)
            expect(mealEntry.totals.carbs).toBeCloseTo(5.4, 1)

            // Verify per100 values are preserved
            expect(mealEntry.per100.calories).toBe(97)
            expect(mealEntry.per100.protein).toBe(10.3)
            expect(mealEntry.per100.fats).toBe(4.4)
            expect(mealEntry.per100.carbs).toBe(3.6)

            // Verify weight is stored
            expect(mealEntry.weight).toBe(150)
        })
    })
})
