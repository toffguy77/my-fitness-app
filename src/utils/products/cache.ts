/**
 * Кэширование результатов поиска продуктов
 */

import { Product } from './api'

const CACHE_TTL = 5 * 60 * 1000 // 5 минут
const MAX_CACHE_SIZE = 50

interface CacheEntry {
    query: string
    results: Product[]
    timestamp: number
}

class ProductSearchCache {
    private cache: Map<string, CacheEntry> = new Map()

    /**
     * Получить результаты из кэша
     */
    get(query: string): Product[] | null {
        const normalizedQuery = query.toLowerCase().trim()
        const entry = this.cache.get(normalizedQuery)

        if (!entry) {
            return null
        }

        // Проверяем, не истек ли срок действия кэша
        const now = Date.now()
        if (now - entry.timestamp > CACHE_TTL) {
            this.cache.delete(normalizedQuery)
            return null
        }

        return entry.results
    }

    /**
     * Сохранить результаты в кэш
     */
    set(query: string, results: Product[]): void {
        const normalizedQuery = query.toLowerCase().trim()

        // Очищаем старые записи, если кэш переполнен
        if (this.cache.size >= MAX_CACHE_SIZE) {
            const oldestKey = Array.from(this.cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0]
            this.cache.delete(oldestKey)
        }

        this.cache.set(normalizedQuery, {
            query: normalizedQuery,
            results,
            timestamp: Date.now(),
        })
    }

    /**
     * Очистить весь кэш
     */
    clear(): void {
        this.cache.clear()
    }

    /**
     * Очистить устаревшие записи
     */
    cleanup(): void {
        const now = Date.now()
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > CACHE_TTL) {
                this.cache.delete(key)
            }
        }
    }
}

export const productSearchCache = new ProductSearchCache()

