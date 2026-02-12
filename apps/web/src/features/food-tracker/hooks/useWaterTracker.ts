/**
 * useWaterTracker Hook
 *
 * Custom hook for water intake tracking functionality.
 * Connects to Zustand store and provides water tracking operations.
 *
 * @module food-tracker/hooks/useWaterTracker
 */

import { useCallback, useMemo } from 'react';
import { useFoodTrackerStore } from '../store/foodTrackerStore';

// ============================================================================
// Types
// ============================================================================

export interface UseWaterTrackerState {
    /** Current water intake in glasses */
    waterIntake: number;
    /** Daily water goal in glasses */
    waterGoal: number;
    /** Glass size in milliliters */
    glassSize: number;
    /** Water intake in milliliters */
    waterIntakeMl: number;
    /** Water goal in milliliters */
    waterGoalMl: number;
    /** Progress percentage (0-100+) */
    progressPercentage: number;
    /** Whether goal is reached */
    isGoalReached: boolean;
    /** Remaining glasses to reach goal */
    remainingGlasses: number;
}

export interface UseWaterTrackerActions {
    /** Add water intake (default: 1 glass) */
    addWater: (glasses?: number) => Promise<void>;
    /** Set water goal */
    setWaterGoal: (goal: number) => void;
    /** Set glass size */
    setGlassSize: (size: number) => void;
}

export interface UseWaterTracker extends UseWaterTrackerState, UseWaterTrackerActions { }

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_GLASS_SIZE = 250; // ml
const DEFAULT_WATER_GOAL = 8; // glasses

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for water tracking functionality
 *
 * @returns Water tracker state and actions
 *
 * @example
 * ```tsx
 * const {
 *   waterIntake,
 *   waterGoal,
 *   progressPercentage,
 *   isGoalReached,
 *   addWater,
 * } = useWaterTracker();
 *
 * // Add one glass of water
 * await addWater();
 *
 * // Add multiple glasses
 * await addWater(2);
 * ```
 */
export function useWaterTracker(): UseWaterTracker {
    // Get state from store
    const waterIntake = useFoodTrackerStore((state) => state.waterIntake);
    const waterGoal = useFoodTrackerStore((state) => state.waterGoal);
    const glassSize = useFoodTrackerStore((state) => state.glassSize);

    // Get actions from store
    const storeAddWater = useFoodTrackerStore((state) => state.addWater);
    const storeSetWaterGoal = useFoodTrackerStore((state) => state.setWaterGoal);
    const storeSetGlassSize = useFoodTrackerStore((state) => state.setGlassSize);

    // Calculated values
    const waterIntakeMl = useMemo(() => {
        return waterIntake * (glassSize || DEFAULT_GLASS_SIZE);
    }, [waterIntake, glassSize]);

    const waterGoalMl = useMemo(() => {
        return (waterGoal || DEFAULT_WATER_GOAL) * (glassSize || DEFAULT_GLASS_SIZE);
    }, [waterGoal, glassSize]);

    const progressPercentage = useMemo(() => {
        const goal = waterGoal || DEFAULT_WATER_GOAL;
        if (goal <= 0) return 0;
        return Math.round((waterIntake / goal) * 100);
    }, [waterIntake, waterGoal]);

    const isGoalReached = useMemo(() => {
        return waterIntake >= (waterGoal || DEFAULT_WATER_GOAL);
    }, [waterIntake, waterGoal]);

    const remainingGlasses = useMemo(() => {
        const goal = waterGoal || DEFAULT_WATER_GOAL;
        const remaining = goal - waterIntake;
        return Math.max(0, remaining);
    }, [waterIntake, waterGoal]);

    // Actions
    const addWater = useCallback(
        async (glasses: number = 1) => {
            await storeAddWater(glasses);
        },
        [storeAddWater]
    );

    const setWaterGoal = useCallback(
        (goal: number) => {
            if (goal > 0) {
                storeSetWaterGoal(goal);
            }
        },
        [storeSetWaterGoal]
    );

    const setGlassSize = useCallback(
        (size: number) => {
            if (size > 0) {
                storeSetGlassSize(size);
            }
        },
        [storeSetGlassSize]
    );

    return {
        // State
        waterIntake,
        waterGoal: waterGoal || DEFAULT_WATER_GOAL,
        glassSize: glassSize || DEFAULT_GLASS_SIZE,
        waterIntakeMl,
        waterGoalMl,
        progressPercentage,
        isGoalReached,
        remainingGlasses,
        // Actions
        addWater,
        setWaterGoal,
        setGlassSize,
    };
}

export default useWaterTracker;
