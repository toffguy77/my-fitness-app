/**
 * Entries slice — food entry CRUD, daily totals, and target goals
 */

import { StateCreator } from 'zustand';
import { formatLocalDate } from '@/shared/utils/format';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import { getTargets } from '@/features/nutrition-calc/api/nutritionCalc';
import type {
    FoodEntry,
    MealType,
    KBZHU,
    CreateFoodEntryRequest,
    UpdateFoodEntryRequest,
    GetFoodEntriesResponse,
    FoodTrackerError,
    EntriesByMealType,
    TargetGoals,
} from '../types';
import type { FoodTrackerStore } from './types';
import {
    EMPTY_KBZHU,
    EMPTY_ENTRIES,
    DEFAULT_WATER_GOAL,
    DEFAULT_GLASS_SIZE,
    calculateDailyTotals,
    groupEntriesByMealType,
    saveCachedEntries,
    mapError,
    retryWithBackoff,
    isOnline,
} from './storeUtils';

// ============================================================================
// Slice Interface
// ============================================================================

export interface EntriesSlice {
    // State
    selectedDate: string;
    entries: EntriesByMealType;
    isLoading: boolean;
    error: FoodTrackerError | null;
    dailyTotals: KBZHU;
    targetGoals: TargetGoals;

    // Actions
    setSelectedDate: (date: string) => void;
    fetchDayData: (date: string) => Promise<void>;
    addEntry: (mealType: MealType, entry: CreateFoodEntryRequest) => Promise<FoodEntry | null>;
    updateEntry: (id: string, updates: UpdateFoodEntryRequest) => Promise<FoodEntry | null>;
    deleteEntry: (id: string, mealType: MealType) => Promise<boolean>;
    setTargetGoals: (goals: Partial<TargetGoals>) => void;
    clearError: () => void;
    reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialEntriesState = {
    selectedDate: formatLocalDate(new Date()),
    entries: { ...EMPTY_ENTRIES },
    isLoading: false,
    error: null as FoodTrackerError | null,
    dailyTotals: { ...EMPTY_KBZHU },
    targetGoals: {
        calories: 2000,
        protein: 150,
        fat: 67,
        carbs: 200,
        isCustom: false,
    } as TargetGoals,
};

// ============================================================================
// Slice Creator
// ============================================================================

export const createEntriesSlice: StateCreator<
    FoodTrackerStore,
    [],
    [],
    EntriesSlice
> = (set, get) => ({
    ...initialEntriesState,

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
                retryWithBackoff(
                    () => apiClient.get<{ glasses: number; goal: number; glass_size: number; enabled: boolean }>(waterUrl),
                    3,
                    1000
                ).catch(() => null),
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

            // Save entries to cache
            saveCachedEntries(date, groupedEntries);
            if (waterResponse) {
                get().saveWaterCache(date, {
                    date,
                    glasses: waterGlasses,
                    goal: waterGoal,
                    glassSize: waterGlassSize,
                });
            }

            const updatedState: Partial<FoodTrackerStore> = {
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
        set({
            ...initialEntriesState,
            waterIntake: 0,
            waterGoal: DEFAULT_WATER_GOAL,
            glassSize: DEFAULT_GLASS_SIZE,
            waterEnabled: true,
            isOffline: false,
            pendingOperations: [],
        });
    },
});
