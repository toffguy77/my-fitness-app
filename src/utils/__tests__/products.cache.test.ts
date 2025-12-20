/**
 * Unit Tests: Products Cache
 * Tests product search cache functionality
 */

import { productSearchCache } from '../products/cache'
import type { Product } from '../products/api'

describe('Products Cache', () => {
  beforeEach(() => {
    productSearchCache.clear()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const mockProducts: Product[] = [
    {
      name: 'Test Product',
      calories_per_100g: 250,
      protein_per_100g: 20,
      fats_per_100g: 10,
      carbs_per_100g: 30,
      source: 'user',
    },
  ]

  it('should return null for non-existent query', () => {
    const result = productSearchCache.get('nonexistent')
    expect(result).toBeNull()
  })

  it('should store and retrieve cached results', () => {
    productSearchCache.set('test', mockProducts)
    const result = productSearchCache.get('test')

    expect(result).toEqual(mockProducts)
  })

  it('should normalize query (lowercase, trim)', () => {
    productSearchCache.set('  TEST  ', mockProducts)
    const result = productSearchCache.get('test')

    expect(result).toEqual(mockProducts)
  })

  it('should expire cache entries after TTL', () => {
    productSearchCache.set('test', mockProducts)

    // Fast-forward time beyond TTL (5 minutes)
    jest.advanceTimersByTime(6 * 60 * 1000)

    const result = productSearchCache.get('test')
    expect(result).toBeNull()
  })

  it('should not expire cache entries within TTL', () => {
    productSearchCache.set('test', mockProducts)

    // Fast-forward time within TTL
    jest.advanceTimersByTime(4 * 60 * 1000)

    const result = productSearchCache.get('test')
    expect(result).toEqual(mockProducts)
  })

  it('should limit cache size to MAX_CACHE_SIZE', () => {
    // Fill cache beyond limit
    for (let i = 0; i < 60; i++) {
      productSearchCache.set(`query-${i}`, mockProducts)
    }

    // Oldest entries should be removed
    const oldestResult = productSearchCache.get('query-0')
    expect(oldestResult).toBeNull()

    // Newer entries should still be present
    const newerResult = productSearchCache.get('query-59')
    expect(newerResult).toEqual(mockProducts)
  })

  it('should clear all cache entries', () => {
    productSearchCache.set('test1', mockProducts)
    productSearchCache.set('test2', mockProducts)

    productSearchCache.clear()

    expect(productSearchCache.get('test1')).toBeNull()
    expect(productSearchCache.get('test2')).toBeNull()
  })

  it('should cleanup expired entries', () => {
    productSearchCache.set('test1', mockProducts)
    productSearchCache.set('test2', mockProducts)

    // Fast-forward time for one entry
    jest.advanceTimersByTime(6 * 60 * 1000)

    productSearchCache.cleanup()

    expect(productSearchCache.get('test1')).toBeNull()
    expect(productSearchCache.get('test2')).toBeNull()
  })
})

