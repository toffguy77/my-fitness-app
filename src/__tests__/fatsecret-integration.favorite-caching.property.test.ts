/**
 * Property-Based Tests: Favorite Product Database Persistence
 * **Feature: fatsecret-integration, Property 10: Favorite Product Database Persistence**
 * **Validates: Requirements 10.7**
 */

import fc from 'fast-check'
import { addToFavorites } from '@/utils/products/favorites'
import { saveProductToDB } from '@/utils/products/api'
import { createClient } from '@/utils/supabase/client'
import type { Product, ProductSource } from '@/types/products'

// Mock the dependencies
jest.mock('@/utils/supabase/client')
jest.mock('@/utils/products/api')
jest.mock('@/utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }
}))

describe('Property-Based Tests: Favorite Product Database Persistence', () => {
    const mockSupabase = {
        from: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
            ; (createClient as jest.Mock).mockReturnValue(mockSupabase)
    })

    // Arbitrary for generating valid external products (FatSecret, Open Food Facts)
    const externalProductArbitrary = fc.record({
        name: fc.string({ minLength: 1, maxLength: 100 }),
        brand: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
        barcode: fc.option(fc.string({ minLength: 8, maxLength: 13 }), { nil: undefined }),
        calories_per_100g: fc.double({ min: 0, max: 900, noNaN: true }),
        protein_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
        fats_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
        carbs_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
        source: fc.constantFrom('fatsecret' as ProductSource, 'openfoodfacts' as ProductSource),
        source_id: fc.string({ minLength: 1, maxLength: 20 }),
        image_url: fc.option(fc.webUrl(), { nil: undefined }),
    })

    // Arbitrary for generating user IDs
    const userIdArbitrary = fc.uuid()

    describe('Property 10: Favorite Product Database Persistence', () => {
        it('should cache FatSecret products before favoriting', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    externalProductArbitrary.filter(p => p.source === 'fatsecret'),
                    async (userId, product) => {
                        // Mock saveProductToDB to return a product ID
                        const mockProductId = 'cached-product-id-123'
                            ; (saveProductToDB as jest.Mock).mockResolvedValue(mockProductId)

                        // Mock Supabase insert
                        const mockInsert = jest.fn().mockResolvedValue({ error: null })
                        mockSupabase.from.mockReturnValue({
                            insert: mockInsert
                        })

                        // Add FatSecret product to favorites (without ID)
                        await addToFavorites(userId, undefined, undefined, product)

                        // Verify saveProductToDB was called with the product
                        expect(saveProductToDB).toHaveBeenCalledWith(product)

                        // Verify favorite was created with the cached product ID
                        expect(mockInsert).toHaveBeenCalledWith({
                            user_id: userId,
                            product_id: mockProductId,
                            user_product_id: null,
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should cache Open Food Facts products before favoriting', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    externalProductArbitrary.filter(p => p.source === 'openfoodfacts'),
                    async (userId, product) => {
                        // Mock saveProductToDB to return a product ID
                        const mockProductId = 'cached-product-id-456'
                            ; (saveProductToDB as jest.Mock).mockResolvedValue(mockProductId)

                        // Mock Supabase insert
                        const mockInsert = jest.fn().mockResolvedValue({ error: null })
                        mockSupabase.from.mockReturnValue({
                            insert: mockInsert
                        })

                        // Add Open Food Facts product to favorites (without ID)
                        await addToFavorites(userId, undefined, undefined, product)

                        // Verify saveProductToDB was called
                        expect(saveProductToDB).toHaveBeenCalledWith(product)

                        // Verify favorite was created with the cached product ID
                        expect(mockInsert).toHaveBeenCalledWith({
                            user_id: userId,
                            product_id: mockProductId,
                            user_product_id: null,
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should not cache products that already have an ID', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    externalProductArbitrary,
                    fc.uuid(),
                    async (userId, product, existingId) => {
                        // Product already has an ID (already in database)
                        const productWithId = { ...product, id: existingId }

                        // Mock Supabase insert
                        const mockInsert = jest.fn().mockResolvedValue({ error: null })
                        mockSupabase.from.mockReturnValue({
                            insert: mockInsert
                        })

                        // Add product to favorites using existing ID
                        await addToFavorites(userId, existingId, undefined, productWithId)

                        // Verify saveProductToDB was NOT called (product already cached)
                        expect(saveProductToDB).not.toHaveBeenCalled()

                        // Verify favorite was created with the existing product ID
                        expect(mockInsert).toHaveBeenCalledWith({
                            user_id: userId,
                            product_id: existingId,
                            user_product_id: null,
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should not cache user-created products', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    fc.record({
                        name: fc.string({ minLength: 1, maxLength: 100 }),
                        calories_per_100g: fc.double({ min: 0, max: 900, noNaN: true }),
                        protein_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        fats_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        carbs_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        source: fc.constant('user' as ProductSource),
                    }),
                    fc.uuid(),
                    async (userId, userProduct, userProductId) => {
                        // Mock Supabase insert
                        const mockInsert = jest.fn().mockResolvedValue({ error: null })
                        mockSupabase.from.mockReturnValue({
                            insert: mockInsert
                        })

                        // Add user product to favorites
                        await addToFavorites(userId, undefined, userProductId, userProduct)

                        // Verify saveProductToDB was NOT called (user products don't need caching)
                        expect(saveProductToDB).not.toHaveBeenCalled()

                        // Verify favorite was created with user_product_id
                        expect(mockInsert).toHaveBeenCalledWith({
                            user_id: userId,
                            product_id: null,
                            user_product_id: userProductId,
                        })
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should throw error if caching fails', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    externalProductArbitrary,
                    async (userId, product) => {
                        // Mock saveProductToDB to fail
                        ; (saveProductToDB as jest.Mock).mockResolvedValue(null)

                        // Attempt to add product to favorites should throw
                        await expect(
                            addToFavorites(userId, undefined, undefined, product)
                        ).rejects.toThrow('Не удалось сохранить продукт в базу данных')

                        // Verify saveProductToDB was called
                        expect(saveProductToDB).toHaveBeenCalledWith(product)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should always cache external products before creating favorite association', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    externalProductArbitrary,
                    async (userId, product) => {
                        // Track call order
                        const callOrder: string[] = []

                            // Mock saveProductToDB
                            ; (saveProductToDB as jest.Mock).mockImplementation(async () => {
                                callOrder.push('saveProductToDB')
                                return 'cached-id'
                            })

                        // Mock Supabase insert
                        const mockInsert = jest.fn().mockImplementation(async () => {
                            callOrder.push('insert')
                            return { error: null }
                        })
                        mockSupabase.from.mockReturnValue({
                            insert: mockInsert
                        })

                        // Add product to favorites
                        await addToFavorites(userId, undefined, undefined, product)

                        // Verify saveProductToDB was called before insert
                        expect(callOrder).toEqual(['saveProductToDB', 'insert'])
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should preserve product data during caching', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    externalProductArbitrary,
                    async (userId, product) => {
                        // Mock saveProductToDB
                        ; (saveProductToDB as jest.Mock).mockResolvedValue('cached-id')

                        // Mock Supabase insert
                        const mockInsert = jest.fn().mockResolvedValue({ error: null })
                        mockSupabase.from.mockReturnValue({
                            insert: mockInsert
                        })

                        // Add product to favorites
                        await addToFavorites(userId, undefined, undefined, product)

                        // Verify saveProductToDB was called with exact product data
                        expect(saveProductToDB).toHaveBeenCalledWith(
                            expect.objectContaining({
                                name: product.name,
                                brand: product.brand,
                                barcode: product.barcode,
                                calories_per_100g: product.calories_per_100g,
                                protein_per_100g: product.protein_per_100g,
                                fats_per_100g: product.fats_per_100g,
                                carbs_per_100g: product.carbs_per_100g,
                                source: product.source,
                                source_id: product.source_id,
                                image_url: product.image_url,
                            })
                        )
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle products with all optional fields', async () => {
            await fc.assert(
                fc.asyncProperty(
                    userIdArbitrary,
                    fc.record({
                        name: fc.string({ minLength: 1, maxLength: 100 }),
                        calories_per_100g: fc.double({ min: 0, max: 900, noNaN: true }),
                        protein_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        fats_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        carbs_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        source: fc.constantFrom('fatsecret' as ProductSource, 'openfoodfacts' as ProductSource),
                        source_id: fc.string({ minLength: 1, maxLength: 20 }),
                        // All optional fields undefined
                        brand: fc.constant(undefined),
                        barcode: fc.constant(undefined),
                        image_url: fc.constant(undefined),
                    }),
                    async (userId, product) => {
                        // Mock saveProductToDB
                        ; (saveProductToDB as jest.Mock).mockResolvedValue('cached-id')

                        // Mock Supabase insert
                        const mockInsert = jest.fn().mockResolvedValue({ error: null })
                        mockSupabase.from.mockReturnValue({
                            insert: mockInsert
                        })

                        // Should not throw even with minimal data
                        await expect(
                            addToFavorites(userId, undefined, undefined, product)
                        ).resolves.toBe(true)

                        // Verify saveProductToDB was called
                        expect(saveProductToDB).toHaveBeenCalledWith(product)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
