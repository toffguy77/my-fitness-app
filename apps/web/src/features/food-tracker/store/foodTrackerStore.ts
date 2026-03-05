/**
 * Zustand store for food tracker state management
 * Handles food entries, daily totals, water tracking, and optimistic updates
 */

import { create } from 'zustand';
import { formatLocalDate } from '@/shared/utils/format';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import { getTargets } from '@/features/nutrition-calc/api/nutritionCalc';
import type {
    FoodEntry,
    MealType,
    KBZHU,
    WaterLog,
    CreateFoodEntryRequest,
    UpdateFoodEntryRequest,
    GetFoodEntriesResponse,
    WaterLogResponse,
    FoodTrackerError,
    FoodTrackerErrorCode,
    EntriesByMealType,
    TargetGoals,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * LocalStorage keys for caching
 */
const CACHE_KEYS = {
    ENTRIES: 'food_tracker_entries',
    DAILY_TOTALS: 'food_tracker_daily_totals',
    TARGET_GOALS: 'food_tracker_target_goals',
    WATER_LOG: 'food_tracker_water_log',
    LAST_SYNC: 'food_tracker_last_sync',
} as const;

/**
 * Cache expiration time (5 minutes)
 */
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

/**
 * Default water tracking values
 */
const DEFAULT_WATER_GOAL = 8;
const DEFAULT_GLASS_SIZE = 250;

/**
 * Empty KBZHU values
 */
const EMPTY_KBZHU: KBZHU = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
};

/**
 * Empty entries by meal type
 */
const EMPTY_ENTRIES: EntriesByMealType = {
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
function getCacheKey(baseKey: string, date: string): string {
    return `${baseKey}_${date}`;
}

/**
 * Load cached entries from localStorage
 */
function loadCachedEntries(date: string): EntriesByMealType | null {
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
function saveCachedEntries(date: string, entries: EntriesByMealType): void {
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
function loadCachedWaterLog(date: string): WaterLog | null {
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
function saveCachedWaterLog(date: string, waterLog: WaterLog): void {
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
function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Map API errors to FoodTrackerError with offline detection
 */
function mapError(error: any): FoodTrackerError {
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
async function retryWithBackoff<T>(
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
function calculateDailyTotals(entries: EntriesByMealType): KBZHU {
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
function groupEntriesByMealType(entries: FoodEntry[]): EntriesByMealType {
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

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Store state interface
 */
interface FoodTrackerState {
    // Date state
    selectedDate: string; // YYYY-MM-DD format

    // Food entries state
    entries: EntriesByMealType;
    isLoading: boolean;
    error: FoodTrackerError | null;

    // Daily totals (calculated)
    dailyTotals: KBZHU;
    targetGoals: TargetGoals;

    // Water tracking
    waterIntake: number;
    waterGoal: number;
    glassSize: number;
    waterEnabled: boolean;

    // Offline state
    isOffline: boolean;
    pendingOperations: Array<{
        type: 'add' | 'update' | 'delete' | 'water';
        data: any;
    }>;

    // Actions
    setSelectedDate: (date: string) => void;
    fetchDayData: (date: string) => Promise<void>;
    addEntry: (mealType: MealType, entry: CreateFoodEntryRequest) => Promise<FoodEntry | null>;
    updateEntry: (id: string, updates: UpdateFoodEntryRequest) => Promise<FoodEntry | null>;
    deleteEntry: (id: string, mealType: MealType) => Promise<boolean>;
    addWater: (glasses?: number) => Promise<void>;
    setWaterGoal: (goal: number) => void;
    setGlassSize: (size: number) => void;
    setTargetGoals: (goals: Partial<TargetGoals>) => void;
    clearError: () => void;
    reset: () => void;
    setOfflineStatus: (isOffline: boolean) => void;
    loadFromCache: (date: string) => void;
    syncWhenOnline: () => Promise<void>;
}

/**
 * Initial state
 */
const initialState = {
    selectedDate: formatLocalDate(new Date()),
    entries: { ...EMPTY_ENTRIES },
    isLoading: false,
    error: null,
    dailyTotals: { ...EMPTY_KBZHU },
    targetGoals: {
        calories: 2000,
        protein: 150,
        fat: 67,
        carbs: 200,
        isCustom: false,
    },
    waterIntake: 0,
    waterGoal: DEFAULT_WATER_GOAL,
    glassSize: DEFAULT_GLASS_SIZE,
    waterEnabled: true,
    isOffline: false,
    pendingOperations: [],
};

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Food tracker store
 */
export const useFoodTrackerStore = create<FoodTrackerState>((set, get) => ({
    ...initialState,

    /**
     * Set selected date
     */
    setSelectedDate: (date: string) => {
        set({ selectedDate: date });
    },

    /**
     * Fetch all data for a specific date
     */
    fetchDayData: async (date: string) => {
        const state = get();

        // Don't fetch if already loading
        if (state.isLoading) {
            return;
        }

        // If offline, load from cache
        if (state.isOffline || !isOnline()) {
            get().loadFromCache(date);
            return;
        }

        set({ isLoading: true, error: null, selectedDate: date });

        try {
            // Fetch entries and water log in parallel
            const entriesUrl = getApiUrl(`/food-tracker/entries?date=${date}`);
            const waterUrl = getApiUrl(`/food-tracker/water?date=${date}`);

            const [entriesResponse, waterResponse, calcTargets] = await Promise.all([
                retryWithBackoff(() => apiClient.get<GetFoodEntriesResponse>(entriesUrl), 3, 1000),
                retryWithBackoff(() => apiClient.get<WaterLogResponse>(waterUrl), 3, 1000).catch(() => null),
                getTargets(date).catch(() => null),
            ]);

            // Group entries by meal type.
            // The API may return entries as a flat array OR already grouped by meal type.
            const rawEntries = entriesResponse.entries;
            const groupedEntries = Array.isArray(rawEntries)
                ? groupEntriesByMealType(rawEntries)
                : (rawEntries as unknown as EntriesByMealType);

            // Calculate daily totals
            const dailyTotals = calculateDailyTotals(groupedEntries);

            // Extract water data (backend returns flat object with snake_case keys)
            const waterGlasses = waterResponse?.glasses ?? 0;
            const waterGoal = waterResponse?.goal ?? DEFAULT_WATER_GOAL;
            const waterGlassSize = waterResponse?.glass_size ?? DEFAULT_GLASS_SIZE;
            const waterEnabled = waterResponse?.enabled ?? true;

            // Save to cache
            saveCachedEntries(date, groupedEntries);
            if (waterResponse) {
                saveCachedWaterLog(date, {
                    date,
                    glasses: waterGlasses,
                    goal: waterGoal,
                    glassSize: waterGlassSize,
                });
            }

            const updatedState: Partial<FoodTrackerState> = {
                entries: groupedEntries,
                dailyTotals,
                waterIntake: waterGlasses,
                waterGoal: waterGoal,
                glassSize: waterGlassSize,
                waterEnabled,
                isLoading: false,
                isOffline: false,
                error: null,
            };

            if (calcTargets) {
                updatedState.targetGoals = {
                    calories: Math.round(calcTargets.calories),
                    protein: Math.round(calcTargets.protein),
                    fat: Math.round(calcTargets.fat),
                    carbs: Math.round(calcTargets.carbs),
                    isCustom: calcTargets.source === 'curator_override',
                };
            }

            set(updatedState);
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                isLoading: false,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            // Load from cache if network error
            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache(date);
            }

            toast.error(mappedError.message);
        }
    },

    /**
     * Add a new food entry with optimistic update
     */
    addEntry: async (mealType: MealType, entryData: CreateFoodEntryRequest): Promise<FoodEntry | null> => {
        const state = get();

        // Create temporary entry for optimistic update
        const tempId = `temp_${Date.now()}`;
        const tempEntry: FoodEntry = {
            id: tempId,
            foodId: entryData.foodId,
            foodName: entryData.foodName || '',
            mealType: entryData.mealType,
            portionType: entryData.portionType,
            portionAmount: entryData.portionAmount,
            nutrition: {
                calories: entryData.calories ?? 0,
                protein: entryData.protein ?? 0,
                fat: entryData.fat ?? 0,
                carbs: entryData.carbs ?? 0,
            },
            time: entryData.time,
            date: entryData.date,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        // Optimistic update - add entry to state
        set((state) => {
            const newEntries = { ...state.entries };
            newEntries[mealType] = [...newEntries[mealType], tempEntry];

            return {
                entries: newEntries,
            };
        });

        // If offline, queue operation
        if (state.isOffline || !isOnline()) {
            set((state) => ({
                pendingOperations: [
                    ...state.pendingOperations,
                    { type: 'add', data: { mealType, entryData } },
                ],
            }));
            toast.success('Запись добавлена (будет синхронизирована при подключении)');
            return tempEntry;
        }

        try {
            const url = getApiUrl('/food-tracker/entries');
            const response = await retryWithBackoff(
                () => apiClient.post<FoodEntry>(url, entryData),
                3,
                1000
            );

            // Replace temp entry with real entry
            set((state) => {
                const newEntries = { ...state.entries };
                newEntries[mealType] = newEntries[mealType].map((e) =>
                    e.id === tempId ? response : e
                );

                // Recalculate daily totals
                const dailyTotals = calculateDailyTotals(newEntries);

                // Save to cache
                saveCachedEntries(state.selectedDate, newEntries);

                return {
                    entries: newEntries,
                    dailyTotals,
                };
            });

            toast.success('Запись добавлена');
            return response;
        } catch (error: any) {
            // Rollback optimistic update
            set((state) => {
                const newEntries = { ...state.entries };
                newEntries[mealType] = newEntries[mealType].filter((e) => e.id !== tempId);

                // Recalculate daily totals
                const dailyTotals = calculateDailyTotals(newEntries);

                return {
                    entries: newEntries,
                    dailyTotals,
                    error: mapError(error),
                    isOffline: mapError(error).code === 'NETWORK_ERROR',
                };
            });

            const mappedError = mapError(error);
            toast.error(mappedError.message || 'Не удалось добавить запись');
            return null;
        }
    },

    /**
     * Update an existing food entry with optimistic update
     */
    updateEntry: async (id: string, updates: UpdateFoodEntryRequest): Promise<FoodEntry | null> => {
        const state = get();

        // Find the entry to update
        let originalEntry: FoodEntry | null = null;
        let entryMealType: MealType | null = null;

        for (const mealType of Object.keys(state.entries) as MealType[]) {
            const entry = state.entries[mealType].find((e) => e.id === id);
            if (entry) {
                originalEntry = { ...entry };
                entryMealType = mealType;
                break;
            }
        }

        if (!originalEntry || !entryMealType) {
            toast.error('Запись не найдена');
            return null;
        }

        // Build optimistic entry fields, mapping flat nutrition to nested object
        const optimisticFields: Partial<FoodEntry> = {
            ...(updates.mealType && { mealType: updates.mealType }),
            ...(updates.portionType && { portionType: updates.portionType }),
            ...(updates.portionAmount != null && { portionAmount: updates.portionAmount }),
            ...(updates.time && { time: updates.time }),
            ...(updates.foodName && { foodName: updates.foodName }),
        };
        if (updates.calories != null || updates.protein != null || updates.fat != null || updates.carbs != null) {
            optimisticFields.nutrition = {
                calories: updates.calories ?? originalEntry.nutrition.calories,
                protein: updates.protein ?? originalEntry.nutrition.protein,
                fat: updates.fat ?? originalEntry.nutrition.fat,
                carbs: updates.carbs ?? originalEntry.nutrition.carbs,
            };
        }

        // Optimistic update
        set((state) => {
            const newEntries = { ...state.entries };
            const targetMealType = updates.mealType || entryMealType!;

            // If meal type changed, move entry
            if (updates.mealType && updates.mealType !== entryMealType) {
                // Remove from old meal type
                newEntries[entryMealType!] = newEntries[entryMealType!].filter((e) => e.id !== id);
                // Add to new meal type
                newEntries[targetMealType] = [
                    ...newEntries[targetMealType],
                    { ...originalEntry!, ...optimisticFields, mealType: targetMealType },
                ];
            } else {
                // Update in place
                newEntries[entryMealType!] = newEntries[entryMealType!].map((e) =>
                    e.id === id ? { ...e, ...optimisticFields, updatedAt: new Date().toISOString() } : e
                );
            }

            return { entries: newEntries };
        });

        // If offline, queue operation
        if (state.isOffline || !isOnline()) {
            set((state) => ({
                pendingOperations: [
                    ...state.pendingOperations,
                    { type: 'update', data: { id, updates } },
                ],
            }));
            toast.success('Запись обновлена (будет синхронизирована при подключении)');
            return { ...originalEntry, ...updates } as FoodEntry;
        }

        try {
            const url = getApiUrl(`/food-tracker/entries/${id}`);
            const response = await retryWithBackoff(
                () => apiClient.put<FoodEntry>(url, updates),
                3,
                1000
            );

            // Update with server response
            set((state) => {
                const newEntries = { ...state.entries };
                const targetMealType = response.mealType;

                // Remove from all meal types first
                for (const mt of Object.keys(newEntries) as MealType[]) {
                    newEntries[mt] = newEntries[mt].filter((e) => e.id !== id);
                }

                // Add to correct meal type
                newEntries[targetMealType] = [...newEntries[targetMealType], response];

                // Sort by time
                newEntries[targetMealType].sort((a, b) => a.time.localeCompare(b.time));

                // Recalculate daily totals
                const dailyTotals = calculateDailyTotals(newEntries);

                // Save to cache
                saveCachedEntries(state.selectedDate, newEntries);

                return {
                    entries: newEntries,
                    dailyTotals,
                };
            });

            toast.success('Запись обновлена');
            return response;
        } catch (error: any) {
            // Rollback optimistic update
            set((state) => {
                const newEntries = { ...state.entries };

                // Remove from all meal types
                for (const mt of Object.keys(newEntries) as MealType[]) {
                    newEntries[mt] = newEntries[mt].filter((e) => e.id !== id);
                }

                // Restore original entry
                newEntries[entryMealType!] = [...newEntries[entryMealType!], originalEntry!];
                newEntries[entryMealType!].sort((a, b) => a.time.localeCompare(b.time));

                // Recalculate daily totals
                const dailyTotals = calculateDailyTotals(newEntries);

                return {
                    entries: newEntries,
                    dailyTotals,
                    error: mapError(error),
                    isOffline: mapError(error).code === 'NETWORK_ERROR',
                };
            });

            const mappedError = mapError(error);
            toast.error(mappedError.message || 'Не удалось обновить запись');
            return null;
        }
    },

    /**
     * Delete a food entry with optimistic update
     */
    deleteEntry: async (id: string, mealType: MealType): Promise<boolean> => {
        const state = get();

        // Find the entry to delete
        const entryToDelete = state.entries[mealType].find((e) => e.id === id);
        if (!entryToDelete) {
            toast.error('Запись не найдена');
            return false;
        }

        // Optimistic update - remove entry
        set((state) => {
            const newEntries = { ...state.entries };
            newEntries[mealType] = newEntries[mealType].filter((e) => e.id !== id);

            // Recalculate daily totals
            const dailyTotals = calculateDailyTotals(newEntries);

            return {
                entries: newEntries,
                dailyTotals,
            };
        });

        // If offline, queue operation
        if (state.isOffline || !isOnline()) {
            set((state) => ({
                pendingOperations: [
                    ...state.pendingOperations,
                    { type: 'delete', data: { id, mealType } },
                ],
            }));
            toast.success('Запись удалена (будет синхронизирована при подключении)');
            return true;
        }

        try {
            const url = getApiUrl(`/food-tracker/entries/${id}`);
            await retryWithBackoff(() => apiClient.delete(url), 3, 1000);

            // Save to cache
            const currentState = get();
            saveCachedEntries(currentState.selectedDate, currentState.entries);

            toast.success('Запись удалена');
            return true;
        } catch (error: any) {
            // Rollback optimistic update
            set((state) => {
                const newEntries = { ...state.entries };
                newEntries[mealType] = [...newEntries[mealType], entryToDelete];
                newEntries[mealType].sort((a, b) => a.time.localeCompare(b.time));

                // Recalculate daily totals
                const dailyTotals = calculateDailyTotals(newEntries);

                return {
                    entries: newEntries,
                    dailyTotals,
                    error: mapError(error),
                    isOffline: mapError(error).code === 'NETWORK_ERROR',
                };
            });

            const mappedError = mapError(error);
            toast.error(mappedError.message || 'Не удалось удалить запись');
            return false;
        }
    },

    /**
     * Add water intake with optimistic update
     */
    addWater: async (glasses: number = 1) => {
        const state = get();
        const originalIntake = state.waterIntake;

        // Optimistic update
        set((state) => ({
            waterIntake: state.waterIntake + glasses,
        }));

        // If offline, queue operation
        if (state.isOffline || !isOnline()) {
            set((state) => ({
                pendingOperations: [
                    ...state.pendingOperations,
                    { type: 'water', data: { glasses, date: state.selectedDate } },
                ],
            }));
            return;
        }

        try {
            const url = getApiUrl('/food-tracker/water');
            const response = await retryWithBackoff(
                () =>
                    apiClient.post<WaterLogResponse>(url, {
                        date: state.selectedDate,
                        glasses,
                    }),
                3,
                1000
            );

            // Update with server response (flat object with snake_case keys)
            set({
                waterIntake: response.glasses,
                waterGoal: response.goal,
                glassSize: response.glass_size,
            });

            // Save to cache
            saveCachedWaterLog(state.selectedDate, {
                date: state.selectedDate,
                glasses: response.glasses,
                goal: response.goal,
                glassSize: response.glass_size,
            });
        } catch (error: any) {
            // Rollback optimistic update
            set({
                waterIntake: originalIntake,
                error: mapError(error),
                isOffline: mapError(error).code === 'NETWORK_ERROR',
            });

            const mappedError = mapError(error);
            toast.error(mappedError.message || 'Не удалось обновить данные о воде');
        }
    },

    /**
     * Set water goal
     */
    setWaterGoal: (goal: number) => {
        set({ waterGoal: goal });
    },

    /**
     * Set glass size
     */
    setGlassSize: (size: number) => {
        set({ glassSize: size });
    },

    /**
     * Set target goals
     */
    setTargetGoals: (goals: Partial<TargetGoals>) => {
        set((state) => ({
            targetGoals: {
                ...state.targetGoals,
                ...goals,
                isCustom: true,
            },
        }));
    },

    /**
     * Clear error state
     */
    clearError: () => {
        set({ error: null });
    },

    /**
     * Reset store to initial state
     */
    reset: () => {
        set(initialState);
    },

    /**
     * Set offline status
     */
    setOfflineStatus: (isOffline: boolean) => {
        const wasOffline = get().isOffline;

        set({ isOffline });

        // Show toast when going offline
        if (isOffline && !wasOffline) {
            toast.error('Нет подключения к интернету', {
                duration: 4000,
                icon: '📡',
            });
        }

        // Show toast when coming back online
        if (!isOffline && wasOffline) {
            toast.success('Подключение восстановлено', {
                duration: 3000,
                icon: '✅',
            });
            // Sync pending operations
            get().syncWhenOnline();
        }
    },

    /**
     * Load data from localStorage cache
     */
    loadFromCache: (date: string) => {
        const cachedEntries = loadCachedEntries(date);
        const cachedWaterLog = loadCachedWaterLog(date);

        if (cachedEntries) {
            const dailyTotals = calculateDailyTotals(cachedEntries);

            set({
                entries: cachedEntries,
                dailyTotals,
                waterIntake: cachedWaterLog?.glasses ?? 0,
                waterGoal: cachedWaterLog?.goal ?? DEFAULT_WATER_GOAL,
                glassSize: cachedWaterLog?.glassSize ?? DEFAULT_GLASS_SIZE,
                isLoading: false,
            });
        }
    },

    /**
     * Sync pending operations when connection is restored
     */
    syncWhenOnline: async () => {
        const state = get();

        // Check if we're actually online
        if (!isOnline()) {
            return;
        }

        // Clear offline status
        set({ isOffline: false, error: null });

        // Process pending operations
        const pendingOps = [...state.pendingOperations];
        set({ pendingOperations: [] });

        for (const op of pendingOps) {
            try {
                switch (op.type) {
                    case 'add':
                        await get().addEntry(op.data.mealType, op.data.entryData);
                        break;
                    case 'update':
                        await get().updateEntry(op.data.id, op.data.updates);
                        break;
                    case 'delete':
                        await get().deleteEntry(op.data.id, op.data.mealType);
                        break;
                    case 'water':
                        await get().addWater(op.data.glasses);
                        break;
                }
            } catch (error) {
                console.error('Не удалось синхронизировать операцию:', error);
            }
        }

        // Refresh data from server
        await get().fetchDayData(state.selectedDate);
    },
}));
