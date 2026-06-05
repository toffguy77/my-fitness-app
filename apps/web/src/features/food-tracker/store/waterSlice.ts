/**
 * Water slice — water intake tracking state and actions
 */

import { StateCreator } from 'zustand';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type { WaterLog, WaterLogResponse } from '../types';
import type { FoodTrackerStore } from './types';
import {
    DEFAULT_WATER_GOAL,
    DEFAULT_GLASS_SIZE,
    saveCachedWaterLog,
    mapError,
    retryWithBackoff,
    isOnline,
} from './storeUtils';

// ============================================================================
// Slice Interface
// ============================================================================

export interface WaterSlice {
    // State
    waterIntake: number;
    waterGoal: number;
    glassSize: number;
    waterEnabled: boolean;

    // Actions
    addWater: (glasses?: number) => Promise<void>;
    setWaterGoal: (goal: number) => void;
    setGlassSize: (size: number) => void;

    /**
     * Internal helper called by entriesSlice.fetchDayData to persist water cache
     * after a combined fetch. Not part of the public API exposed to consumers.
     */
    saveWaterCache: (date: string, waterLog: WaterLog) => void;
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createWaterSlice: StateCreator<
    FoodTrackerStore,
    [],
    [],
    WaterSlice
> = (set, get) => ({
    // Initial state
    waterIntake: 0,
    waterGoal: DEFAULT_WATER_GOAL,
    glassSize: DEFAULT_GLASS_SIZE,
    waterEnabled: true,

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
     * Save water log to cache (called internally by entriesSlice.fetchDayData)
     */
    saveWaterCache: (date: string, waterLog: WaterLog) => {
        saveCachedWaterLog(date, waterLog);
    },
});
