/**
 * Unit Tests: Products API
 * Tests product search and API functions
 */

import type { Product } from '@/types/products'
import {
  transformProduct,
  searchProductsInDB,
  saveProductToDB,
  incrementProductUsage,
  searchProducts,
  getProductByBarcode,
  type OpenFoodFactsProduct,
} from '../products/api'

// Mock Supabase
const mockFrom = jest.fn()

jest.mock('../supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
  })),
}))

// Mock fetch
global.fetch = jest.fn()

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('Products API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
      ; (global.fetch as jest.Mock).mockClear()
  })

  describe('transformProduct', () => {
    it('should transform Open Food Facts product correctly', () => {
      const offProduct: OpenFoodFactsProduct = {
        code: '123456789',
        product_name: 'Test Product',
        brands: 'Test Brand',
        nutriments: {
          'energy-kcal_100g': 250,
          'proteins_100g': 20,
          'fat_100g': 10,
          'carbohydrates_100g': 30,
        },
        image_url: 'https://example.com/image.jpg',
      }

      const result = transformProduct(offProduct)

      expect(result.name).toBe('Test Product')
      expect(result.brand).toBe('Test Brand')
      expect(result.barcode).toBe('123456789')
      expect(result.calories_per_100g).toBe(250)
      expect(result.protein_per_100g).toBe(20)
      expect(result.fats_per_100g).toBe(10)
      expect(result.carbs_per_100g).toBe(30)
      expect(result.source).toBe('openfoodfacts')
    })

    it('should use product_name_en if product_name is missing', () => {
      const offProduct: OpenFoodFactsProduct = {
        product_name_en: 'English Name',
        nutriments: {},
      }

      const result = transformProduct(offProduct)

      expect(result.name).toBe('English Name')
    })

    it('should handle missing nutriments', () => {
      const offProduct: OpenFoodFactsProduct = {
        product_name: 'Test Product',
      }

      const result = transformProduct(offProduct)

      expect(result.calories_per_100g).toBe(0)
      expect(result.protein_per_100g).toBe(0)
      expect(result.fats_per_100g).toBe(0)
      expect(result.carbs_per_100g).toBe(0)
    })

    it('should use image_front_url if image_url is missing', () => {
      const offProduct: OpenFoodFactsProduct = {
        product_name: 'Test Product',
        image_front_url: 'https://example.com/front.jpg',
        nutriments: {},
      }

      const result = transformProduct(offProduct)

      expect(result.image_url).toBe('https://example.com/front.jpg')
    })
  })

  describe('searchProductsInDB', () => {
    it('should search products in database', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          brand: 'Brand 1',
          calories_per_100g: 200,
          protein_per_100g: 15,
          fats_per_100g: 10,
          carbs_per_100g: 25,
          source: 'openfoodfacts',
        },
      ]

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockProducts,
          error: null,
        }),
      })

      const result = await searchProductsInDB('test', 20)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Product 1')
    })

    it('should return empty array on error', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      })

      const result = await searchProductsInDB('test', 20)

      expect(result).toEqual([])
    })

    it('should handle empty query', async () => {
      const result = await searchProductsInDB('', 20)

      expect(mockFrom).toHaveBeenCalled()
    })
  })

  describe('saveProductToDB', () => {
    it('should save new product to database', async () => {
      const product: Product = {
        name: 'New Product',
        calories_per_100g: 200,
        protein_per_100g: 15,
        fats_per_100g: 10,
        carbs_per_100g: 25,
        source: 'user',
      }

      // Mock for checking existing product (by source_id) - returns not found
      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      })

      // Mock for insert().select('id').single() - returns new product
      const mockInsertSelect = jest.fn().mockResolvedValue({
        data: { id: 'new-id' },
        error: null,
      })

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: mockSingle,
        insert: jest.fn().mockImplementation(() => ({
          select: jest.fn().mockReturnThis(),
          single: mockInsertSelect,
        })),
      })

      const result = await saveProductToDB(product)

      expect(result).toBe('new-id')
    })

    it('should return existing product ID if product exists', async () => {
      const product: Product = {
        name: 'Existing Product',
        barcode: '123456789',
        calories_per_100g: 200,
        protein_per_100g: 15,
        fats_per_100g: 10,
        carbs_per_100g: 25,
        source: 'openfoodfacts',
      }

      // Mock for checking existing product - returns existing product
      const mockSelectSingle = jest.fn()
        .mockResolvedValueOnce({
          data: { id: 'existing-id' },
          error: null,
        })
        // Mock for getting usage_count
        .mockResolvedValueOnce({
          data: { usage_count: 5 },
          error: null,
        })

      // Mock for update
      const mockUpdate = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockResolvedValue({
        error: null,
      })

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: mockSelectSingle,
        update: jest.fn().mockImplementation(() => ({
          eq: mockEq,
        })),
      })

      const result = await saveProductToDB(product)

      expect(result).toBe('existing-id')
    })

    it('should return null on error', async () => {
      const product: Product = {
        name: 'Product',
        calories_per_100g: 200,
        protein_per_100g: 15,
        fats_per_100g: 10,
        carbs_per_100g: 25,
        source: 'user',
      }

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn()
          .mockResolvedValueOnce({
            data: null,
            error: { code: 'PGRST116' },
          })
          .mockResolvedValueOnce({
            data: null,
            error: { message: 'Save error' },
          }),
        insert: jest.fn().mockReturnThis(),
      })

      const result = await saveProductToDB(product)

      expect(result).toBeNull()
    })
  })

  describe('incrementProductUsage', () => {
    it('should increment product usage count', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { usage_count: 5 },
          error: null,
        }),
        update: jest.fn().mockReturnThis(),
      })

      await incrementProductUsage('product-id')

      expect(mockFrom).toHaveBeenCalled()
    })

    it('should handle missing usage_count', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { usage_count: null },
          error: null,
        }),
        update: jest.fn().mockReturnThis(),
      })

      await incrementProductUsage('product-id')

      expect(mockFrom).toHaveBeenCalled()
    })
  })

  describe('searchProducts', () => {
    it('should return empty array for short query', async () => {
      const result = await searchProducts('a', 20)

      expect(result).toEqual([])
    })

    it('should return empty array for empty query', async () => {
      const result = await searchProducts('', 20)

      expect(result).toEqual([])
    })

    it('should search in database first', async () => {
      const mockProducts = [
        {
          id: '1',
          name: 'Product 1',
          calories_per_100g: 200,
          protein_per_100g: 15,
          fats_per_100g: 10,
          carbs_per_100g: 25,
          source: 'openfoodfacts',
        },
      ]

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockProducts,
          error: null,
        }),
      })

      const result = await searchProducts('test', 20)

      expect(result).toHaveLength(1)
    })
  })

  describe('getProductByBarcode', () => {
    it('should return product from database if exists', async () => {
      const mockProduct = {
        id: '1',
        name: 'Product',
        barcode: '123456789',
        calories_per_100g: 200,
        protein_per_100g: 15,
        fats_per_100g: 10,
        carbs_per_100g: 25,
        source: 'openfoodfacts',
        source_id: '123',
        image_url: null,
      }

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockProduct,
          error: null,
        }),
      })

      const result = await getProductByBarcode('123456789')

      expect(result).toBeDefined()
      expect(result?.name).toBe('Product')
    })

    it('should return null if product not found in database and API', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      })

        ; (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({ status: 0 }),
        })

      const result = await getProductByBarcode('123456789')

      expect(result).toBeNull()
    })
  })
})
