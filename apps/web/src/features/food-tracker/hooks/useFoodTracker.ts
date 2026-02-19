/**
 * useFoodTracker Hook
 *
 * Custom hook for food tracking functionality.
 * Connects to Zustand store and provides CRUD operations for food entries.
 *
 * @module food-tracker/hooks/useFoodTracker
 */

import { useEffect, useCallback } from 'react';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import { useOnlineStatus } from './useOnlineStatus';
import type {
    FoodEntry,
    MealType,
    KBZHU,
    CreateFoodEntryRequest,
    UpdateFoodEntryRequest,
    EntriesByMealType,
    TargetGoals,
    FoodTrackerError,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseFoodTrackerState {
    /** Food entries grouped by meal type */
    entries: EntriesByMealType;
    /** Daily totals for КБЖУ */
    dailyTotals: KBZHU;
    /** Target goals for КБЖУ */
    targetGoals: TargetGoals;
    /** Currently selected date (YYYY-MM-DD) */
    selectedDate: string;
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: FoodTrackerError | null;
    /** Offline status */
    isOffline: boolean;
}

export interface UseFoodTrackerActions {
    /** Fetch data for a specific date */
    fetchDayData: (date: string) => Promise<void>;
    /** Add a new food entry */
    addEntry: (mealType: MealType, entry: CreateFoodEntryRequest) => Promise<FoodEntry | null>;
    /** Update an existing food entry */
    updateEntry: (id: string, updates: UpdateFoodEntryRequest) => Promise<FoodEntry | null>;
    /** Delete a food entry */
    deleteEntry: (id: string, mealType: MealType) => Promise<boolean>;
    /** Set selected date */
    setSelectedDate: (date: string) => void;
    /** Set target goals */
    setTargetGoals: (goals: Partial<TargetGoals>) => void;
    /** Clear error state */
    clearError: () => void;
    /** Get entries for a specific meal type */
    getEntriesForMeal: (mealType: MealType) => FoodEntry[];
    /** Get total entries count */
    getTotalEntriesCount: () => number;
}

export interface UseFoodTracker extends UseFoodTrackerState, UseFoodTrackerActions { }

export interface UseFoodTrackerOptions {
    /** Initial date to load (defaults to today) */
    initialDate?: string;
    /** Whether to auto-fetch data on mount */
    autoFetch?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for food tracking functionality
 *
 * @param options - Configuration options
 * @returns Food tracker state and actions
 *
 * @example
 * ```tsx
 * const { entries, dailyTotals, addEntry, deleteEntry } = useFoodTracker();
 *
 * // Add a new entry
 * await addEntry('breakfast', {
 *   foodId: '123',
 *   mealType: 'breakfast',
 *   portionType: 'grams',
 *   portionAmount: 150,
 *   time: '08:30',
 *   date: '2024-01-15',
 * });
 * ```
 */
export function useFoodTracker(options: UseFoodTrackerOptions = {}): UseFoodTracker {
    const {
        initialDate = new Date().toISOString().split('T')[0],
        autoFetch = true,
    } = options;

    // Monitor online/offline status and sync with store
    useOnlineStatus();

    // Get state from store
    const entries = useFoodTrackerStore((state) => state.entries);
    const dailyTotals = useFoodTrackerStore((state) => state.dailyTotals);
    const targetGoals = useFoodTrackerStore((state) => state.targetGoals);
    const selectedDate = useFoodTrackerStore((state) => state.selectedDate);
    const isLoading = useFoodTrackerStore((state) => state.isLoading);
    const error = useFoodTrackerStore((state) => state.error);
    const isOffline = useFoodTrackerStore((state) => state.isOffline);

    // Get actions from store
    const storeFetchDayData = useFoodTrackerStore((state) => state.fetchDayData);
    const storeAddEntry = useFoodTrackerStore((state) => state.addEntry);
    const storeUpdateEntry = useFoodTrackerStore((state) => state.updateEntry);
    const storeDeleteEntry = useFoodTrackerStore((state) => state.deleteEntry);
    const storeSetSelectedDate = useFoodTrackerStore((state) => state.setSelectedDate);
    const storeSetTargetGoals = useFoodTrackerStore((state) => state.setTargetGoals);
    const storeClearError = useFoodTrackerStore((state) => state.clearError);

    // Auto-fetch data on mount
    useEffect(() => {
        if (autoFetch) {
            storeFetchDayData(initialDate);
        }
    }, [autoFetch, initialDate, storeFetchDayData]);

    // Wrapped actions with stable references
    const fetchDayData = useCallback(
        async (date: string) => {
            await storeFetchDayData(date);
        },
        [storeFetchDayData]
    );

    const addEntry = useCallback(
        async (mealType: MealType, entry: CreateFoodEntryRequest) => {
            return await storeAddEntry(mealType, entry);
        },
        [storeAddEntry]
    );

    const updateEntry = useCallback(
        async (id: string, updates: UpdateFoodEntryRequest) => {
            return await storeUpdateEntry(id, updates);
        },
        [storeUpdateEntry]
    );

    const deleteEntry = useCallback(
        async (id: string, mealType: MealType) => {
            return await storeDeleteEntry(id, mealType);
        },
        [storeDeleteEntry]
    );

    const setSelectedDate = useCallback(
        (date: string) => {
            storeSetSelectedDate(date);
        },
        [storeSetSelectedDate]
    );

    const setTargetGoals = useCallback(
        (goals: Partial<TargetGoals>) => {
            storeSetTargetGoals(goals);
        },
        [storeSetTargetGoals]
    );

    const clearError = useCallback(() => {
        storeClearError();
    }, [storeClearError]);

    // Helper functions
    const getEntriesForMeal = useCallback(
        (mealType: MealType): FoodEntry[] => {
            return entries[mealType] || [];
        },
        [entries]
    );

    const getTotalEntriesCount = useCallback((): number => {
        return Object.values(entries).reduce((total, mealEntries) => total + mealEntries.length, 0);
    }, [entries]);

    return {
        // State
        entries,
        dailyTotals,
        targetGoals,
        selectedDate,
        isLoading,
        error,
        isOffline,
        // Actions
        fetchDayData,
        addEntry,
        updateEntry,
        deleteEntry,
        setSelectedDate,
        setTargetGoals,
        clearError,
        getEntriesForMeal,
        getTotalEntriesCount,
    };
}

export default useFoodTracker;
