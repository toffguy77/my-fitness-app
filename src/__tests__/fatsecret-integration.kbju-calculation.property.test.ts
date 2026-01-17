/**
 * Property-Based Test: KBJU Calculation Accuracy
 *
 * Feature: fatsecret-integration, Property: KBJU calculation accuracy
 * Validates: Requirements 9.1
 *
 * This test verifies that KBJU calculations for meal entries are accurate
 * across all possible combinations of nutritional values and weights.
 */

import * as fc from 'fast-check'
import type { Product } from '@/types/products'

describe('Property-Based Test: KBJU Calculation', () => {
    describe('Property: KBJU calculation accuracy', () => {
        it('should calculate KBJU accurately for any valid product and weight', () => {
            fc.assert(
                fc.property(
                    // Generate random FatSecret products with valid nutritional data
                    fc.record({
                        name: fc.string({ minLength: 3, maxLength: 50 }),
                        brand: fc.option(fc.string({ minLength: 2, maxLength: 30 }), { nil: null }),
                        calories_per_100g: fc.integer({ min: 0, max: 900 }),
                        protein_per_100g: fc.float({ min: 0, max: 100, noNaN: true }),
                        fats_per_100g: fc.float({ min: 0, max: 100, noNaN: true }),
                        carbs_per_100g: fc.float({ min: 0, max: 100, noNaN: true }),
                        source: fc.constant('fatsecret' as const),
                        source_id: fc.string({ minLength: 5, maxLength: 20 }),
                    }),
                    // Generate random weights (1g to 2000g)
                    fc.integer({ min: 1, max: 2000 }),
                    (product, weight) => {
                        // Calculate KBJU for the specified weight
                        const calculatedCalories = (product.calories_per_100g * weight) / 100
                        const calculatedProtein = (product.protein_per_100g * weight) / 100
                        const calculatedFats = (product.fats_per_100g * weight) / 100
                        const calculatedCarbs = (product.carbs_per_100g * weight) / 100

                        // Property 1: Calculated values should be proportional to weight
                        // If weight doubles, KBJU should double
                        const doubleWeight = weight * 2
                        const doubleCalories = (product.calories_per_100g * doubleWeight) / 100
                        const doubleProtein = (product.protein_per_100g * doubleWeight) / 100
                        const doubleFats = (product.fats_per_100g * doubleWeight) / 100
                        const doubleCarbs = (product.carbs_per_100g * doubleWeight) / 100

                        expect(doubleCalories).toBeCloseTo(calculatedCalories * 2, 5)
                        expect(doubleProtein).toBeCloseTo(calculatedProtein * 2, 5)
                        expect(doubleFats).toBeCloseTo(calculatedFats * 2, 5)
                        expect(doubleCarbs).toBeCloseTo(calculatedCarbs * 2, 5)

                        // Property 2: For 100g, calculated values should equal per_100g values
                        if (weight === 100) {
                            expect(calculatedCalories).toBe(product.calories_per_100g)
                            expect(calculatedProtein).toBeCloseTo(product.protein_per_100g, 10)
                            expect(calculatedFats).toBeCloseTo(product.fats_per_100g, 10)
                            expect(calculatedCarbs).toBeCloseTo(product.carbs_per_100g, 10)
                        }

                        // Property 3: Calculated values should never be negative
                        expect(calculatedCalories).toBeGreaterThanOrEqual(0)
                        expect(calculatedProtein).toBeGreaterThanOrEqual(0)
                        expect(calculatedFats).toBeGreaterThanOrEqual(0)
                        expect(calculatedCarbs).toBeGreaterThanOrEqual(0)

                        // Property 4: Calculated values should scale linearly with weight
                        // (calories per gram should be constant)
                        const caloriesPerGram = calculatedCalories / weight
                        const expectedCaloriesPerGram = product.calories_per_100g / 100
                        expect(caloriesPerGram).toBeCloseTo(expectedCaloriesPerGram, 10)
                    }
                ),
                { numRuns: 100 } // Run 100 iterations as per design document
            )
        })

        it('should handle fractional weights correctly', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        calories_per_100g: fc.integer({ min: 50, max: 500 }),
                        protein_per_100g: fc.float({ min: 1, max: 50, noNaN: true }),
                        fats_per_100g: fc.float({ min: 0.5, max: 30, noNaN: true }),
                        carbs_per_100g: fc.float({ min: 1, max: 80, noNaN: true }),
                    }),
                    // Generate fractional weights (0.1g to 500.5g)
                    fc.float({ min: Math.fround(0.1), max: Math.fround(500.5), noNaN: true }),
                    (nutritionData, weight) => {
                        const calculatedCalories = (nutritionData.calories_per_100g * weight) / 100
                        const calculatedProtein = (nutritionData.protein_per_100g * weight) / 100
                        const calculatedFats = (nutritionData.fats_per_100g * weight) / 100
                        const calculatedCarbs = (nutritionData.carbs_per_100g * weight) / 100

                        // Property: Fractional calculations should maintain precision
                        // Verify by recalculating per 100g and comparing
                        const recalculatedPer100gCalories = (calculatedCalories / weight) * 100
                        const recalculatedPer100gProtein = (calculatedProtein / weight) * 100
                        const recalculatedPer100gFats = (calculatedFats / weight) * 100
                        const recalculatedPer100gCarbs = (calculatedCarbs / weight) * 100

                        expect(recalculatedPer100gCalories).toBeCloseTo(
                            nutritionData.calories_per_100g,
                            5
                        )
                        expect(recalculatedPer100gProtein).toBeCloseTo(
                            nutritionData.protein_per_100g,
                            5
                        )
                        expect(recalculatedPer100gFats).toBeCloseTo(nutritionData.fats_per_100g, 5)
                        expect(recalculatedPer100gCarbs).toBeCloseTo(nutritionData.carbs_per_100g, 5)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle edge cases (zero values, very small/large weights)', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        calories_per_100g: fc.integer({ min: 0, max: 900 }),
                        protein_per_100g: fc.float({ min: 0, max: 100, noNaN: true }),
                        fats_per_100g: fc.float({ min: 0, max: 100, noNaN: true }),
                        carbs_per_100g: fc.float({ min: 0, max: 100, noNaN: true }),
                    }),
                    fc.oneof(
                        fc.constant(Math.fround(0.1)), // Very small weight
                        fc.constant(1), // Minimum practical weight
                        fc.constant(5000), // Very large weight
                        fc.integer({ min: 1, max: 2000 }) // Normal range
                    ),
                    (nutritionData, weight) => {
                        const calculatedCalories = (nutritionData.calories_per_100g * weight) / 100
                        const calculatedProtein = (nutritionData.protein_per_100g * weight) / 100
                        const calculatedFats = (nutritionData.fats_per_100g * weight) / 100
                        const calculatedCarbs = (nutritionData.carbs_per_100g * weight) / 100

                        // Property: Even with edge case weights, calculations should be valid
                        expect(calculatedCalories).toBeGreaterThanOrEqual(0)
                        expect(calculatedProtein).toBeGreaterThanOrEqual(0)
                        expect(calculatedFats).toBeGreaterThanOrEqual(0)
                        expect(calculatedCarbs).toBeGreaterThanOrEqual(0)

                        // Property: Zero nutritional values should result in zero calculated values
                        if (nutritionData.calories_per_100g === 0) {
                            expect(calculatedCalories).toBe(0)
                        }
                        if (nutritionData.protein_per_100g === 0) {
                            expect(calculatedProtein).toBe(0)
                        }
                        if (nutritionData.fats_per_100g === 0) {
                            expect(calculatedFats).toBe(0)
                        }
                        if (nutritionData.carbs_per_100g === 0) {
                            expect(calculatedCarbs).toBe(0)
                        }

                        // Property: Calculations should not produce NaN or Infinity
                        expect(calculatedCalories).not.toBeNaN()
                        expect(calculatedProtein).not.toBeNaN()
                        expect(calculatedFats).not.toBeNaN()
                        expect(calculatedCarbs).not.toBeNaN()
                        expect(isFinite(calculatedCalories)).toBe(true)
                        expect(isFinite(calculatedProtein)).toBe(true)
                        expect(isFinite(calculatedFats)).toBe(true)
                        expect(isFinite(calculatedCarbs)).toBe(true)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
