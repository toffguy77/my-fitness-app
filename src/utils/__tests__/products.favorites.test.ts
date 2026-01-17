/**
 * Unit Tests: Favorites
 * Tests favorite products functionality
 * Requirements: 10.2, 10.3, 10.5, 10.7
 */

import {
    addToFavorites,
    removeFromFavorites,
    isFavorite,
    getFavoriteProducts,
} from '../products/favorites'
import { saveProductToDB } from '../products/api'
import type { Product } from '@/types/products'

// Mock Supabase
const mockFrom = jest.fn()

jest.mock('../supabase/client', () => ({
    createClient: jest.fn(() => ({
        from: mockFrom,
    })),
}))

// Mock saveProductToDB
jest.mock('../products/api', () => ({
    saveProductToDB: jest.fn(),
}))

// Mock logger
jest.mock('../logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}))

describe('Favorites', () => {
    const mockUserId = 'user-123'
    const mockProductId = 'product-456'
    const mockUserProductId = 'user-product-789'

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('addToFavorites', () => {
        it('should add product to favorites with productId', async () => {
            // Mock Supabase insert
            const mockInsert = jest.fn().mockResolvedValue({ error: null })
            mockFrom.mockReturnValue({
                insert: mockInsert,
            })

            const result = await addToFavorites(mockUserId, mockProductId)

            expect(result).toBe(true)
            expect(mockInsert).toHaveBeenCalledWith({
                user_id: mockUserId,
                product_id: mockProductId,
                user_product_id: null,
            })
        })

        it('should add product to favorites with userProductId', async () => {
            // Mock Supabase insert
            const mockInsert = jest.fn().mockResolvedValue({ error: null })
            mockFrom.mockReturnValue({
                insert: mockInsert,
            })

            const result = await addToFavorites(mockUserId, undefined, mockUserProductId)

            expect(result).toBe(true)
            expect(mockInsert).toHaveBeenCalledWith({
                user_id: mockUserId,
                product_id: null,
                user_product_id: mockUserProductId,
            })
        })

        it('should cache FatSecret product before favoriting', async () => {
            // Requirement 10.7: FatSecret products must be cached first
            const fatSecretProduct: Product = {
                name: 'FatSecret Product',
                calories_per_100g: 200,
                protein_per_100g: 15,
                fats_per_100g: 8,
                carbs_per_100g: 25,
                source: 'fatsecret',
                source_id: 'fs-123',
            }

            const cachedProductId = 'cached-product-id'
                ; (saveProductToDB as jest.Mock).mockResolvedValue(cachedProductId)

            const mockInsert = jest.fn().mockResolvedValue({ error: null })
            mockFrom.mockReturnValue({
                insert: mockInsert,
            })

            const result = await addToFavorites(mockUserId, undefined, undefined, fatSecretProduct)

            expect(result).toBe(true)
            expect(saveProductToDB).toHaveBeenCalledWith(fatSecretProduct)
            expect(mockInsert).toHaveBeenCalledWith({
                user_id: mockUserId,
                product_id: cachedProductId,
                user_product_id: null,
            })
        })

        it('should cache Open Food Facts product before favoriting', async () => {
            // Requirement 10.7: External products must be cached first
            const offProduct: Product = {
                name: 'OFF Product',
                calories_per_100g: 150,
                protein_per_100g: 10,
                fats_per_100g: 5,
                carbs_per_100g: 20,
                source: 'openfoodfacts',
                source_id: 'off-456',
            }

            const cachedProductId = 'cached-off-product-id'
                ; (saveProductToDB as jest.Mock).mockResolvedValue(cachedProductId)

            const mockInsert = jest.fn().mockResolvedValue({ error: null })
            mockFrom.mockReturnValue({
                insert: mockInsert,
            })

            const result = await addToFavorites(mockUserId, undefined, undefined, offProduct)

            expect(result).toBe(true)
            expect(saveProductToDB).toHaveBeenCalledWith(offProduct)
            expect(mockInsert).toHaveBeenCalledWith({
                user_id: mockUserId,
                product_id: cachedProductId,
                user_product_id: null,
            })
        })

        it('should not cache user products', async () => {
            // User products don't need caching
            const userProduct: Product = {
                name: 'User Product',
                calories_per_100g: 100,
                protein_per_100g: 5,
                fats_per_100g: 3,
                carbs_per_100g: 15,
                source: 'user',
            }

            const mockInsert = jest.fn().mockResolvedValue({ error: null })
            mockFrom.mockReturnValue({
                insert: mockInsert,
            })

            await addToFavorites(mockUserId, undefined, mockUserProductId, userProduct)

            expect(saveProductToDB).not.toHaveBeenCalled()
        })

        it('should not cache products that already have an ID', async () => {
            // Products with ID are already in database
            const productWithId: Product = {
                id: 'existing-id',
                name: 'Existing Product',
                calories_per_100g: 200,
                protein_per_100g: 15,
                fats_per_100g: 8,
                carbs_per_100g: 25,
                source: 'fatsecret',
                source_id: 'fs-123',
            }

            const mockInsert = jest.fn().mockResolvedValue({ error: null })
            mockFrom.mockReturnValue({
                insert: mockInsert,
            })

            await addToFavorites(mockUserId, 'existing-id', undefined, productWithId)

            expect(saveProductToDB).not.toHaveBeenCalled()
            expect(mockInsert).toHaveBeenCalledWith({
                user_id: mockUserId,
                product_id: 'existing-id',
                user_product_id: null,
            })
        })

        it('should throw error if caching fails', async () => {
            const fatSecretProduct: Product = {
                name: 'FatSecret Product',
                calories_per_100g: 200,
                protein_per_100g: 15,
                fats_per_100g: 8,
                carbs_per_100g: 25,
                source: 'fatsecret',
                source_id: 'fs-123',
            }

                ; (saveProductToDB as jest.Mock).mockResolvedValue(null)

            await expect(
                addToFavorites(mockUserId, undefined, undefined, fatSecretProduct)
            ).rejects.toThrow('Не удалось сохранить продукт в базу данных')
        })

        it('should return true if product already in favorites', async () => {
            // Requirement 10.2: Handle duplicate favorites gracefully
            const mockInsert = jest.fn().mockResolvedValue({
                error: { code: '23505' }, // Unique constraint violation
            })
            mockFrom.mockReturnValue({
                insert: mockInsert,
            })

            const result = await addToFavorites(mockUserId, mockProductId)

            expect(result).toBe(true)
        })

        it('should throw error for invalid parameters', async () => {
            await expect(
                addToFavorites(mockUserId)
            ).rejects.toThrow('Необходимо указать productId, userProductId или product')
        })

        it('should throw error if both productId and userProductId provided', async () => {
            await expect(
                addToFavorites(mockUserId, mockProductId, mockUserProductId)
            ).rejects.toThrow('Нельзя указать одновременно productId и userProductId')
        })
    })

    describe('removeFromFavorites', () => {
        it('should remove product from favorites by productId', async () => {
            // Requirement 10.3: Remove from favorites
            const mockEq2 = jest.fn().mockResolvedValue({ error: null })
            const mockEq1 = jest.fn().mockReturnValue({
                eq: mockEq2,
            })
            const mockDelete = jest.fn().mockReturnValue({
                eq: mockEq1,
            })
            mockFrom.mockReturnValue({
                delete: mockDelete,
            })

            const result = await removeFromFavorites(mockUserId, mockProductId)

            expect(result).toBe(true)
            expect(mockDelete).toHaveBeenCalled()
        })

        it('should remove product from favorites by userProductId', async () => {
            const mockEq2 = jest.fn().mockResolvedValue({ error: null })
            const mockEq1 = jest.fn().mockReturnValue({
                eq: mockEq2,
            })
            const mockDelete = jest.fn().mockReturnValue({
                eq: mockEq1,
            })
            mockFrom.mockReturnValue({
                delete: mockDelete,
            })

            const result = await removeFromFavorites(mockUserId, undefined, mockUserProductId)

            expect(result).toBe(true)
        })

        it('should throw error for invalid parameters', async () => {
            await expect(
                removeFromFavorites(mockUserId)
            ).rejects.toThrow('Необходимо указать productId или userProductId')
        })
    })

    describe('isFavorite', () => {
        it('should return true if product is favorite', async () => {
            const mockQuery = {
                eq: jest.fn().mockReturnThis(),
            }
            Object.assign(mockQuery, { count: 1, error: null })

            const mockSelect = jest.fn().mockReturnValue(mockQuery)
            mockFrom.mockReturnValue({
                select: mockSelect,
            })

            const result = await isFavorite(mockUserId, mockProductId)

            expect(result).toBe(true)
            expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact', head: true })
            expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId)
            expect(mockQuery.eq).toHaveBeenCalledWith('product_id', mockProductId)
        })

        it('should return false if product is not favorite', async () => {
            const mockQuery = {
                eq: jest.fn().mockReturnThis(),
            }
            Object.assign(mockQuery, { count: 0, error: null })

            const mockSelect = jest.fn().mockReturnValue(mockQuery)
            mockFrom.mockReturnValue({
                select: mockSelect,
            })

            const result = await isFavorite(mockUserId, mockProductId)

            expect(result).toBe(false)
        })

        it('should return false for invalid parameters', async () => {
            const result = await isFavorite(mockUserId)

            expect(result).toBe(false)
        })
    })

    describe('getFavoriteProducts', () => {
        it('should return list of favorite products ordered by created_at', async () => {
            // Requirement 10.5: Order by most recently added
            const mockData = [
                {
                    product_id: 'product-1',
                    user_product_id: null,
                    created_at: '2024-01-02',
                    products: {
                        id: 'product-1',
                        name: 'Product 1',
                        brand: 'Brand 1',
                        barcode: '123456',
                        calories_per_100g: 200,
                        protein_per_100g: 15,
                        fats_per_100g: 8,
                        carbs_per_100g: 25,
                        source: 'fatsecret',
                        source_id: 'fs-1',
                        image_url: 'https://example.com/1.jpg',
                    },
                },
                {
                    product_id: 'product-2',
                    user_product_id: null,
                    created_at: '2024-01-01',
                    products: {
                        id: 'product-2',
                        name: 'Product 2',
                        brand: 'Brand 2',
                        barcode: null,
                        calories_per_100g: 150,
                        protein_per_100g: 10,
                        fats_per_100g: 5,
                        carbs_per_100g: 20,
                        source: 'openfoodfacts',
                        source_id: 'off-2',
                        image_url: null,
                    },
                },
            ]

            const mockOrder = jest.fn().mockResolvedValue({ data: mockData, error: null })
            const mockEq = jest.fn().mockReturnValue({
                order: mockOrder,
            })
            const mockSelect = jest.fn().mockReturnValue({
                eq: mockEq,
            })
            mockFrom.mockReturnValue({
                select: mockSelect,
            })

            const result = await getFavoriteProducts(mockUserId)

            expect(result).toHaveLength(2)
            expect(result[0].name).toBe('Product 1')
            expect(result[0].source).toBe('fatsecret')
            expect(result[1].name).toBe('Product 2')
            expect(result[1].source).toBe('openfoodfacts')
            expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
        })

        it('should include FatSecret products in favorites list', async () => {
            // Requirement 10.2: Display FatSecret products
            const mockData = [
                {
                    product_id: 'product-1',
                    user_product_id: null,
                    created_at: '2024-01-01',
                    products: {
                        id: 'product-1',
                        name: 'FatSecret Product',
                        brand: 'Brand',
                        barcode: null,
                        calories_per_100g: 200,
                        protein_per_100g: 15,
                        fats_per_100g: 8,
                        carbs_per_100g: 25,
                        source: 'fatsecret',
                        source_id: 'fs-123',
                        image_url: 'https://example.com/image.jpg',
                    },
                },
            ]

            const mockOrder = jest.fn().mockResolvedValue({ data: mockData, error: null })
            const mockEq = jest.fn().mockReturnValue({
                order: mockOrder,
            })
            const mockSelect = jest.fn().mockReturnValue({
                eq: mockEq,
            })
            mockFrom.mockReturnValue({
                select: mockSelect,
            })

            const result = await getFavoriteProducts(mockUserId)

            expect(result).toHaveLength(1)
            expect(result[0].source).toBe('fatsecret')
            expect(result[0].source_id).toBe('fs-123')
            expect(result[0].name).toBe('FatSecret Product')
        })

        it('should include user products in favorites list', async () => {
            const mockData = [
                {
                    product_id: null,
                    user_product_id: 'user-product-1',
                    created_at: '2024-01-01',
                    user_products: {
                        id: 'user-product-1',
                        name: 'User Product',
                        calories_per_100g: 100,
                        protein_per_100g: 5,
                        fats_per_100g: 3,
                        carbs_per_100g: 15,
                    },
                },
            ]

            const mockOrder = jest.fn().mockResolvedValue({ data: mockData, error: null })
            const mockEq = jest.fn().mockReturnValue({
                order: mockOrder,
            })
            const mockSelect = jest.fn().mockReturnValue({
                eq: mockEq,
            })
            mockFrom.mockReturnValue({
                select: mockSelect,
            })

            const result = await getFavoriteProducts(mockUserId)

            expect(result).toHaveLength(1)
            expect(result[0].source).toBe('user')
            expect(result[0].name).toBe('User Product')
        })

        it('should return empty array if no favorites', async () => {
            const mockOrder = jest.fn().mockResolvedValue({ data: [], error: null })
            const mockEq = jest.fn().mockReturnValue({
                order: mockOrder,
            })
            const mockSelect = jest.fn().mockReturnValue({
                eq: mockEq,
            })
            mockFrom.mockReturnValue({
                select: mockSelect,
            })

            const result = await getFavoriteProducts(mockUserId)

            expect(result).toEqual([])
        })

        it('should handle mixed product types', async () => {
            const mockData = [
                {
                    product_id: 'product-1',
                    user_product_id: null,
                    created_at: '2024-01-03',
                    products: {
                        id: 'product-1',
                        name: 'FatSecret Product',
                        brand: 'Brand',
                        barcode: null,
                        calories_per_100g: 200,
                        protein_per_100g: 15,
                        fats_per_100g: 8,
                        carbs_per_100g: 25,
                        source: 'fatsecret',
                        source_id: 'fs-123',
                        image_url: null,
                    },
                },
                {
                    product_id: null,
                    user_product_id: 'user-product-1',
                    created_at: '2024-01-02',
                    user_products: {
                        id: 'user-product-1',
                        name: 'User Product',
                        calories_per_100g: 100,
                        protein_per_100g: 5,
                        fats_per_100g: 3,
                        carbs_per_100g: 15,
                    },
                },
                {
                    product_id: 'product-2',
                    user_product_id: null,
                    created_at: '2024-01-01',
                    products: {
                        id: 'product-2',
                        name: 'OFF Product',
                        brand: null,
                        barcode: '789',
                        calories_per_100g: 150,
                        protein_per_100g: 10,
                        fats_per_100g: 5,
                        carbs_per_100g: 20,
                        source: 'openfoodfacts',
                        source_id: 'off-456',
                        image_url: null,
                    },
                },
            ]

            const mockOrder = jest.fn().mockResolvedValue({ data: mockData, error: null })
            const mockEq = jest.fn().mockReturnValue({
                order: mockOrder,
            })
            const mockSelect = jest.fn().mockReturnValue({
                eq: mockEq,
            })
            mockFrom.mockReturnValue({
                select: mockSelect,
            })

            const result = await getFavoriteProducts(mockUserId)

            expect(result).toHaveLength(3)
            expect(result[0].source).toBe('fatsecret')
            expect(result[1].source).toBe('user')
            expect(result[2].source).toBe('openfoodfacts')
        })
    })
})
