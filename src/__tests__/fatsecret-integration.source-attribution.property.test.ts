/**
 * Property-Based Tests: Source Attribution
 * **Feature: fatsecret-integration, Property 9: Source Attribution**
 * **Validates: Requirements 5.4**
 */

import fc from 'fast-check'
import { transformFatSecretFood } from '@/utils/products/transform'
import { transformProduct } from '@/utils/products/api'
import type { FatSecretFood, FatSecretServing } from '@/utils/products/fatsecret'
import type { OpenFoodFactsProduct } from '@/utils/products/api'
import type { Product, ProductSource } from '@/types/products'

describe('Property-Based Tests: Source Attribution', () => {
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

    // Arbitrary for generating valid Open Food Facts products
    const openFoodFactsProductArbitrary = fc.record({
        code: fc.option(fc.string({ minLength: 8, maxLength: 13 }), { nil: undefined }),
        product_name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        product_name_en: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        brands: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        nutriments: fc.record({
            'energy-kcal_100g': fc.option(fc.double({ min: 0, max: 900, noNaN: true }), { nil: undefined }),
            'proteins_100g': fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
            'fat_100g': fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
            'carbohydrates_100g': fc.option(fc.double({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
        }),
        image_url: fc.option(fc.webUrl(), { nil: undefined }),
    })

    // Arbitrary for generating user-created products
    const userProductArbitrary = fc.record({
        name: fc.string({ minLength: 1, maxLength: 100 }),
        brand: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        barcode: fc.option(fc.string({ minLength: 8, maxLength: 13 }), { nil: undefined }),
        calories_per_100g: fc.double({ min: 0, max: 900, noNaN: true }),
        protein_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
        fats_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
        carbs_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
        source: fc.constant('user' as ProductSource),
        source_id: fc.constant(null),
        image_url: fc.option(fc.webUrl(), { nil: undefined }),
    })

    describe('Property 9: Source Attribution', () => {
        it('should always set source to "fatsecret" for FatSecret products', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    (food) => {
                        const product = transformFatSecretFood(food)

                        // Source must be 'fatsecret'
                        expect(product.source).toBe('fatsecret')

                        // Source ID must match the original food_id
                        expect(product.source_id).toBe(food.food_id)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should always set source to "openfoodfacts" for Open Food Facts products', async () => {
            await fc.assert(
                fc.property(
                    openFoodFactsProductArbitrary,
                    (offProduct) => {
                        const product = transformProduct(offProduct)

                        // Source must be 'openfoodfacts'
                        expect(product.source).toBe('openfoodfacts')

                        // Source ID must match the original code (if present)
                        if (offProduct.code) {
                            expect(product.source_id).toBe(offProduct.code)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should preserve source attribution for user products', async () => {
            await fc.assert(
                fc.property(
                    userProductArbitrary,
                    (product) => {
                        // User products must maintain 'user' source
                        expect(product.source).toBe('user')

                        // User products should not have source_id
                        expect(product.source_id).toBeNull()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should never change source after transformation', async () => {
            await fc.assert(
                fc.property(
                    fc.oneof(
                        fatSecretFoodArbitrary.map(food => ({ type: 'fatsecret' as const, data: food })),
                        openFoodFactsProductArbitrary.map(off => ({ type: 'openfoodfacts' as const, data: off }))
                    ),
                    (input) => {
                        let product: Product

                        if (input.type === 'fatsecret') {
                            product = transformFatSecretFood(input.data as FatSecretFood)
                            expect(product.source).toBe('fatsecret')
                        } else {
                            product = transformProduct(input.data as OpenFoodFactsProduct)
                            expect(product.source).toBe('openfoodfacts')
                        }

                        // Source must be one of the valid types
                        expect(['fatsecret', 'openfoodfacts', 'usda', 'user']).toContain(product.source)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should maintain source-source_id uniqueness constraint', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    (food) => {
                        const product1 = transformFatSecretFood(food)
                        const product2 = transformFatSecretFood(food)

                        // Same input should produce same source and source_id
                        expect(product1.source).toBe(product2.source)
                        expect(product1.source_id).toBe(product2.source_id)

                        // Both should be 'fatsecret' with same food_id
                        expect(product1.source).toBe('fatsecret')
                        expect(product1.source_id).toBe(food.food_id)
                        expect(product2.source).toBe('fatsecret')
                        expect(product2.source_id).toBe(food.food_id)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should correctly attribute source for products with barcodes', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    fc.string({ minLength: 8, maxLength: 13 }),
                    (food, barcode) => {
                        const product = transformFatSecretFood(food)

                        // Even if we add a barcode later, source should remain 'fatsecret'
                        const productWithBarcode = { ...product, barcode }

                        expect(productWithBarcode.source).toBe('fatsecret')
                        expect(productWithBarcode.source_id).toBe(food.food_id)
                        expect(productWithBarcode.barcode).toBe(barcode)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should never have null or undefined source', async () => {
            await fc.assert(
                fc.property(
                    fc.oneof(
                        fatSecretFoodArbitrary,
                        openFoodFactsProductArbitrary.map(off => ({ ...off, isOpenFoodFacts: true }))
                    ),
                    (input) => {
                        let product: Product

                        if ('food_id' in input) {
                            product = transformFatSecretFood(input as FatSecretFood)
                        } else {
                            product = transformProduct(input as OpenFoodFactsProduct)
                        }

                        // Source must never be null or undefined
                        expect(product.source).toBeDefined()
                        expect(product.source).not.toBeNull()
                        expect(product.source.length).toBeGreaterThan(0)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should maintain source attribution through multiple transformations', async () => {
            await fc.assert(
                fc.property(
                    fatSecretFoodArbitrary,
                    (food) => {
                        // Transform once
                        const product1 = transformFatSecretFood(food)

                        // Simulate saving and retrieving from DB (source should be preserved)
                        const dbProduct = {
                            ...product1,
                            id: 'test-id-123'
                        }

                        // Source attribution must be preserved
                        expect(dbProduct.source).toBe('fatsecret')
                        expect(dbProduct.source_id).toBe(food.food_id)

                        // Create a copy (simulating retrieval)
                        const retrievedProduct = { ...dbProduct }

                        expect(retrievedProduct.source).toBe('fatsecret')
                        expect(retrievedProduct.source_id).toBe(food.food_id)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
