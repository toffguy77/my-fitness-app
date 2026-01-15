/**
 * Система кэширования для Supabase запросов
 * Использует Map для хранения кэша в памяти
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live в миллисекундах
}

class SupabaseCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTL = 5 * 60 * 1000 // 5 минут по умолчанию

  /**
   * Получить данные из кэша
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Проверяем, не истек ли срок действия
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Сохранить данные в кэш
   */
  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    })
  }

  /**
   * Удалить данные из кэша
   */
  delete(key: string): void {
    this.cache.delete(key)
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
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Получить ключ кэша для запроса
   */
  static getCacheKey(table: string, filters: Record<string, any>): string {
    const sortedFilters = Object.keys(filters)
      .sort()
      .map((key) => `${key}:${JSON.stringify(filters[key])}`)
      .join('|')
    return `${table}:${sortedFilters}`
  }
}

// Singleton instance
export const supabaseCache = new SupabaseCache()

// Периодическая очистка устаревших записей
if (typeof window !== 'undefined') {
  setInterval(() => {
    supabaseCache.cleanup()
  }, 60000) // Каждую минуту
}
