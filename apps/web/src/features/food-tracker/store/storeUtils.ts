/**
 * Shared utilities for food tracker store slices
 * Contains cache helpers, error mapping, retry logic, and KBZHU calculations
 */

import type {
    FoodEntry,
    MealType,
    KBZHU,
    WaterLog,
    FoodTrackerError,
    EntriesByMealType,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * LocalStorage keys for caching
 */
export const CACHE_KEYS = {
    ENTRIES: 'food_tracker_entries',
    DAILY_TOTALS: 'food_tracker_daily_totals',
    TARGET_GOALS: 'food_tracker_target_goals',
    WATER_LOG: 'food_tracker_water_log',
    LAST_SYNC: 'food_tracker_last_sync',
} as const;

/**
 * Cache expiration time (5 minutes)
 */
export const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

/**
 * Default water tracking values
 */
export const DEFAULT_WATER_GOAL = 8;
export const DEFAULT_GLASS_SIZE = 250;

/**
 * Empty KBZHU values
 */
export const EMPTY_KBZHU: KBZHU = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
};

/**
 * Empty entries by meal type
 */
export const EMPTY_ENTRIES: EntriesByMealType = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
};

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Get cache key with date suffix
 */
export function getCacheKey(baseKey: string, date: string): string {
    return `${baseKey}_${date}`;
}

/**
 * Load cached entries from localStorage
 */
export function loadCachedEntries(date: string): EntriesByMealType | null {
    if (typeof window === 'undefined') return null;

    try {
        const key = getCacheKey(CACHE_KEYS.ENTRIES, date);
        const cached = localStorage.getItem(key);

        if (!cached) return null;

        const data = JSON.parse(cached);
        return data as EntriesByMealType;
    } catch (error) {
        console.error('Не удалось загрузить кэшированные записи:', error);
        return null;
    }
}

/**
 * Save entries to localStorage cache
 */
export function saveCachedEntries(date: string, entries: EntriesByMealType): void {
    if (typeof window === 'undefined') return;

    try {
        const key = getCacheKey(CACHE_KEYS.ENTRIES, date);
        localStorage.setItem(key, JSON.stringify(entries));
        localStorage.setItem(CACHE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (error) {
        console.error('Не удалось сохранить записи в кэш:', error);
    }
}

/**
 * Load cached water log from localStorage
 */
export function loadCachedWaterLog(date: string): WaterLog | null {
    if (typeof window === 'undefined') return null;

    try {
        const key = getCacheKey(CACHE_KEYS.WATER_LOG, date);
        const cached = localStorage.getItem(key);

        if (!cached) return null;

        return JSON.parse(cached) as WaterLog;
    } catch (error) {
        console.error('Не удалось загрузить кэшированные данные о воде:', error);
        return null;
    }
}

/**
 * Save water log to localStorage cache
 */
export function saveCachedWaterLog(date: string, waterLog: WaterLog): void {
    if (typeof window === 'undefined') return;

    try {
        const key = getCacheKey(CACHE_KEYS.WATER_LOG, date);
        localStorage.setItem(key, JSON.stringify(waterLog));
    } catch (error) {
        console.error('Не удалось сохранить данные о воде в кэш:', error);
    }
}

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Map API errors to FoodTrackerError with offline detection
 */
export function mapError(error: any): FoodTrackerError {
    // Check if offline first
    if (!isOnline()) {
        return {
            code: 'NETWORK_ERROR',
            message: 'Нет подключения к интернету',
        };
    }

    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    if (status === 401) {
        return {
            code: 'UNAUTHORIZED',
            message: 'Требуется авторизация',
        };
    }

    if (status === 404) {
        return {
            code: 'NOT_FOUND',
            message: 'Запись не найдена',
        };
    }

    if (status === 400) {
        return {
            code: 'VALIDATION_ERROR',
            message: message || 'Неверный формат данных',
        };
    }

    if (status === 500) {
        return {
            code: 'SERVER_ERROR',
            message: 'Сервис временно недоступен',
        };
    }

    // Network errors (fetch failed, timeout, etc.)
    // Only classify as network error if the message indicates a fetch/network failure,
    // not arbitrary TypeErrors from data processing.
    if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed to fetch')) {
        return {
            code: 'NETWORK_ERROR',
            message: 'Проверьте подключение к интернету',
        };
    }

    return {
        code: 'SERVER_ERROR',
        message: 'Произошла ошибка',
    };
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Don't retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
            const status = error.response?.status;
            if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                throw error;
            }

            // Don't retry if offline
            if (!isOnline()) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

// ============================================================================
// KBZHU Calculation Utilities
// ============================================================================

/**
 * Calculate daily totals from entries
 */
export function calculateDailyTotals(entries: EntriesByMealType): KBZHU {
    const totals: KBZHU = { ...EMPTY_KBZHU };

    for (const mealType of Object.keys(entries) as MealType[]) {
        for (const entry of entries[mealType]) {
            totals.calories += entry.nutrition.calories;
            totals.protein += entry.nutrition.protein;
            totals.fat += entry.nutrition.fat;
            totals.carbs += entry.nutrition.carbs;
        }
    }

    // Round to 1 decimal place
    totals.calories = Math.round(totals.calories * 10) / 10;
    totals.protein = Math.round(totals.protein * 10) / 10;
    totals.fat = Math.round(totals.fat * 10) / 10;
    totals.carbs = Math.round(totals.carbs * 10) / 10;

    return totals;
}

/**
 * Group entries by meal type
 */
export function groupEntriesByMealType(entries: FoodEntry[]): EntriesByMealType {
    const grouped: EntriesByMealType = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
    };

    for (const entry of entries) {
        if (grouped[entry.mealType]) {
            grouped[entry.mealType].push(entry);
        }
    }

    // Sort entries within each meal by time
    for (const mealType of Object.keys(grouped) as MealType[]) {
        grouped[mealType].sort((a, b) => a.time.localeCompare(b.time));
    }

    return grouped;
}
