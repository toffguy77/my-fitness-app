/**
 * Offline slice — offline status, pending operation queue, and sync logic
 */

import { StateCreator } from 'zustand';
import toast from 'react-hot-toast';
import type { FoodTrackerStore } from './types';
import {
    DEFAULT_WATER_GOAL,
    DEFAULT_GLASS_SIZE,
    calculateDailyTotals,
    loadCachedEntries,
    loadCachedWaterLog,
    isOnline,
} from './storeUtils';

// ============================================================================
// Slice Interface
// ============================================================================

export interface OfflineSlice {
    // State
    isOffline: boolean;
    pendingOperations: Array<{
        type: 'add' | 'update' | 'delete' | 'water';
        data: any;
    }>;

    // Actions
    setOfflineStatus: (isOffline: boolean) => void;
    loadFromCache: (date: string) => void;
    syncWhenOnline: () => Promise<void>;
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createOfflineSlice: StateCreator<
    FoodTrackerStore,
    [],
    [],
    OfflineSlice
> = (set, get) => ({
    // Initial state
    isOffline: false,
    pendingOperations: [],

    /**
     * Set offline status and trigger sync or show toast as needed
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
});
