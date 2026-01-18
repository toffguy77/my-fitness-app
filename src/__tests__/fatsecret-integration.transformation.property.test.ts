/**
 * Property-Based Tests: Product Transformation Consistency
 * **Feature: fatsecret-integration, Property 4: Product Transformation Consistency**
 * **Validates: Requirements 2.2, 3.1**
 */

import fc from 'fast-check'
import {
    transformFatSecretFood,
    findOrCalculate100gServing,
    extractImageUrl
} from '@/utils/products/transform'
import type { FatSecretFood, FatSecretServing } from '@/utils/products/fatsecret'

describe('Property-Based Tests: Product Transformation Consistency', () => {
    // Arbitrary for generating valid FatSecret servings
    const servingArbitrary = fc.record({
        serving_id: fc.string({ minLength: 1, maxLength: 10 }),
        serving_description: fc.string({ minLength: 1, maxLength: 50 }),
        metric_serving_amount: fc.double({ min: 1, max: 1000, noNaN: true }).map(n => n.toFixed(2)),
        metric_serving_unit: fc.constantFrom('g', 'ml'),
        calories: fc.double({ min: 0, max: 900, noNaN: true }).map(n => n.toFixed(2)),
        carbohydrate: fc.double({ min: 0, max: 100, noNaN: true }).map(n => n.toFixed(2)),
        protein: fc.double({ min: 0, max: 100, noNaN: true }).map(n => n.toFixed(2)),
        fat: fc.double({ min: 0, max: 100, noNaN: true }).map(n => n.toFixed(2)),
    })

    // Arbitrary for generating valid FatSecret foods
    const fatSecretFoodArbitrary = fc.record({
        food_id: fc.string({ minLength: 1, maxLength: 10 }),
        food_name: fc.string({ minLength: 1, maxLength: 100 }),
        brand_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        food_type: fc.constantFrom('Generic' as const, 'Brand' as const),
        servings: fc.record({
            serving: fc.array(servingArbitrary, { minLength: 1, maxLength: 5 })
        })
    })

    describe('Property 4: Product Transformation Consistency', () => {
        it('should preserve KBJU values within 1% error when transforming foods with 100g serving', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    (food) => {
                        // Add exact 100g serving
                        const serving100g: FatSecretServing = {
                            serving_id: '100g',
                            serving_description: '100g',
                            metric_serving_amount: '100',
                            metric_serving_unit: 'g',
                            calories: '250',
                            carbohydrate: '30',
                            protein: '20',
                            fat: '10'
                        }

                        const foodWith100g: FatSecretFood = {
                            ...food,
                            servings: {
                                serving: [serving100g, ...food.servings.serving]
                            }
                        }

                        const product = transformFatSecretFood(foodWith100g)

                        // Verify KBJU values match within 1% error
                        const expectedCalories = parseFloat(serving100g.calories)
                        const expectedProtein = parseFloat(serving100g.protein)
                        const expectedFat = parseFloat(serving100g.fat)
                        const expectedCarbs = parseFloat(serving100g.carbohydrate)

                        const caloriesError = Math.abs(product.calories_per_100g - expectedCalories) / expectedCalories
                        const proteinError = Math.abs(product.protein_per_100g - expectedProtein) / expectedProtein
                        const fatError = Math.abs(product.fats_per_100g - expectedFat) / expectedFat
                        const carbsError = Math.abs(product.carbs_per_100g - expectedCarbs) / expectedCarbs

                        expect(caloriesError).toBeLessThanOrEqual(0.01)
                        expect(proteinError).toBeLessThanOrEqual(0.01)
                        expect(fatError).toBeLessThanOrEqual(0.01)
                        expect(carbsError).toBeLessThanOrEqual(0.01)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should preserve KBJU values within 1% error when calculating from metric servings', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    fc.double({ min: 10, max: 500, noNaN: true }),
                    (food, servingAmount) => {
                        // Create a metric serving with known values
                        const baseCalories = 200
                        const baseProtein = 15
                        const baseFat = 8
                        const baseCarbs = 25

                        const metricServing: FatSecretServing = {
                            serving_id: 'metric',
                            serving_description: `${servingAmount}g`,
                            metric_serving_amount: servingAmount.toFixed(2),
                            metric_serving_unit: 'g',
                            calories: baseCalories.toFixed(2),
                            carbohydrate: baseCarbs.toFixed(2),
                            protein: baseProtein.toFixed(2),
                            fat: baseFat.toFixed(2)
                        }

                        const foodWithMetric: FatSecretFood = {
                            ...food,
                            servings: {
                                serving: [metricServing]
                            }
                        }

                        const product = transformFatSecretFood(foodWithMetric)

                        // Calculate expected values per 100g
                        const scaleFactor = 100 / servingAmount
                        const expectedCalories = baseCalories * scaleFactor
                        const expectedProtein = baseProtein * scaleFactor
                        const expectedFat = baseFat * scaleFactor
                        const expectedCarbs = baseCarbs * scaleFactor

                        // Verify within 1% error
                        const caloriesError = Math.abs(product.calories_per_100g - expectedCalories) / expectedCalories
                        const proteinError = Math.abs(product.protein_per_100g - expectedProtein) / expectedProtein
                        const fatError = Math.abs(product.fats_per_100g - expectedFat) / expectedFat
                        const carbsError = Math.abs(product.carbs_per_100g - expectedCarbs) / expectedCarbs

                        expect(caloriesError).toBeLessThanOrEqual(0.01)
                        expect(proteinError).toBeLessThanOrEqual(0.01)
                        expect(fatError).toBeLessThanOrEqual(0.01)
                        expect(carbsError).toBeLessThanOrEqual(0.01)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should always populate required Product fields', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    (food) => {
                        const product = transformFatSecretFood(food)

                        // Required fields must be present
                        expect(product.name).toBeDefined()
                        expect(product.name.length).toBeGreaterThan(0)
                        expect(product.calories_per_100g).toBeGreaterThanOrEqual(0)
                        expect(product.protein_per_100g).toBeGreaterThanOrEqual(0)
                        expect(product.fats_per_100g).toBeGreaterThanOrEqual(0)
                        expect(product.carbs_per_100g).toBeGreaterThanOrEqual(0)
                        expect(product.source).toBe('fatsecret')
                        expect(product.source_id).toBe(food.food_id)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should correctly handle brand vs generic foods', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    (food) => {
                        const product = transformFatSecretFood(food)

                        if (food.food_type === 'Brand' && food.brand_name) {
                            expect(product.brand).toBe(food.brand_name)
                        }

                        if (food.food_type === 'Generic') {
                            // Generic foods may or may not have brand
                            if (food.brand_name) {
                                expect(product.brand).toBe(food.brand_name)
                            }
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle missing optional nutritional fields gracefully', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    (food) => {
                        // Remove optional fields from servings
                        const servingsWithoutOptional = food.servings.serving.map(s => ({
                            serving_id: s.serving_id,
                            serving_description: s.serving_description,
                            metric_serving_amount: s.metric_serving_amount,
                            metric_serving_unit: s.metric_serving_unit,
                            calories: s.calories,
                            carbohydrate: s.carbohydrate,
                            protein: s.protein,
                            fat: s.fat
                            // No saturated_fat, fiber, sugar, sodium
                        }))

                        const foodWithoutOptional: FatSecretFood = {
                            ...food,
                            servings: {
                                serving: servingsWithoutOptional
                            }
                        }

                        // Should not throw
                        const product = transformFatSecretFood(foodWithoutOptional)

                        // Required fields should still be present
                        expect(product.calories_per_100g).toBeGreaterThanOrEqual(0)
                        expect(product.protein_per_100g).toBeGreaterThanOrEqual(0)
                        expect(product.fats_per_100g).toBeGreaterThanOrEqual(0)
                        expect(product.carbs_per_100g).toBeGreaterThanOrEqual(0)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property: 100g Serving Calculation', () => {
        it('should find exact 100g serving when available', async () => {
            await fc.assert(
                fc.property(
                    fc.array(servingArbitrary, { minLength: 1, maxLength: 5 }),
                    (servings) => {
                        // Add exact 100g serving
                        const serving100g: FatSecretServing = {
                            serving_id: '100g',
                            serving_description: '100g',
                            metric_serving_amount: '100',
                            metric_serving_unit: 'g',
                            calories: '300',
                            carbohydrate: '40',
                            protein: '25',
                            fat: '12'
                        }

                        const allServings = [serving100g, ...servings]
                        const result = findOrCalculate100gServing(allServings)

                        expect(result).not.toBeNull()
                        expect(result?.metric_serving_amount).toBe('100')
                        expect(result?.calories).toBe('300')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should calculate proportionally from metric servings', async () => {
            await fc.assert(
                fc.property(
                    fc.double({ min: 10, max: 500, noNaN: true }),
                    fc.double({ min: 50, max: 500, noNaN: true }),
                    (amount, calories) => {
                        const serving: FatSecretServing = {
                            serving_id: 'test',
                            serving_description: `${amount}g`,
                            metric_serving_amount: amount.toFixed(2),
                            metric_serving_unit: 'g',
                            calories: calories.toFixed(2),
                            carbohydrate: '10',
                            protein: '5',
                            fat: '3'
                        }

                        const result = findOrCalculate100gServing([serving])

                        expect(result).not.toBeNull()
                        expect(result?.metric_serving_amount).toBe('100')

                        // Verify proportional calculation
                        const scaleFactor = 100 / amount
                        const expectedCalories = calories * scaleFactor
                        const actualCalories = parseFloat(result!.calories)

                        const error = Math.abs(actualCalories - expectedCalories) / expectedCalories
                        expect(error).toBeLessThanOrEqual(0.01)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    describe('Property: Image URL Extraction', () => {
        it('should return null for missing or empty images', async () => {
            await fc.assert(
                fc.property(
                    fc.constantFrom(undefined, null, { food_image: [] }),
                    (images) => {
                        const result = extractImageUrl(images as any)
                        expect(result).toBeNull()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should extract first available image URL', async () => {
            await fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            image_url: fc.webUrl(),
                            image_type: fc.constantFrom('front', 'product', 'nutrition', 'other')
                        }),
                        { minLength: 1, maxLength: 5 }
                    ),
                    (images) => {
                        const foodImages = { food_image: images }
                        const result = extractImageUrl(foodImages)

                        expect(result).not.toBeNull()
                        expect(images.some(img => img.image_url === result)).toBe(true)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
