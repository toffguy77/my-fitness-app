/**
 * useKBZHUCalculator Hook
 *
 * Custom hook for КБЖУ (calories, protein, fat, carbs) calculations.
 * Provides calculation functions and progress determination utilities.
 *
 * @module food-tracker/hooks/useKBZHUCalculator
 */

import { useCallback, useMemo } from 'react';
import {
    calculateKBZHU,
    calculateFoodKBZHU,
    calculateDailyTotals,
    getProgressColor,
    getPercentage,
    calculateMacroGoals,
    validatePortionAmount,
    EMPTY_KBZHU,
} from '../utils/kbzhuCalculator';
import type { KBZHU, FoodItem, FoodEntry, ProgressColor, TargetGoals } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface MacroProgress {
    /** Current value */
    current: number;
    /** Target value */
    target: number;
    /** Progress percentage */
    percentage: number;
    /** Progress color */
    color: ProgressColor;
    /** Whether target is exceeded */
    isExceeded: boolean;
}

export interface KBZHUProgress {
    calories: MacroProgress;
    protein: MacroProgress;
    fat: MacroProgress;
    carbs: MacroProgress;
}

export interface UseKBZHUCalculatorState {
    /** Empty КБЖУ values constant */
    emptyKBZHU: KBZHU;
}

export interface UseKBZHUCalculatorActions {
    /** Calculate КБЖУ for a portion */
    calculateForPortion: (nutritionPer100: KBZHU, portionAmount: number) => KBZHU;
    /** Calculate КБЖУ for a food item with portion */
    calculateForFood: (food: FoodItem, portionAmount: number) => KBZHU;
    /** Calculate daily totals from entries */
    calculateTotals: (entries: FoodEntry[]) => KBZHU;
    /** Get progress color for a value */
    getColor: (current: number, target: number) => ProgressColor;
    /** Get percentage of goal */
    getPercent: (current: number, target: number) => number;
    /** Calculate macro goals from calorie goal */
    getMacroGoals: (calorieGoal: number) => Omit<KBZHU, 'calories'>;
    /** Validate portion amount */
    validatePortion: (amount: number) => { isValid: boolean; error?: string };
    /** Get full progress info for all macros */
    getProgress: (current: KBZHU, targets: TargetGoals) => KBZHUProgress;
    /** Format КБЖУ value for display */
    formatValue: (value: number, decimals?: number) => string;
    /** Format progress as "current / target" */
    formatProgress: (current: number, target: number, unit?: string) => string;
}

export interface UseKBZHUCalculator extends UseKBZHUCalculatorState, UseKBZHUCalculatorActions { }

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for КБЖУ calculation functionality
 *
 * @returns КБЖУ calculator state and actions
 *
 * @example
 * ```tsx
 * const {
 *   calculateForPortion,
 *   getProgress,
 *   formatProgress,
 * } = useKBZHUCalculator();
 *
 * // Calculate КБЖУ for 150g portion
 * const nutrition = calculateForPortion(foodNutritionPer100, 150);
 *
 * // Get progress info
 * const progress = getProgress(dailyTotals, targetGoals);
 * ```
 */
export function useKBZHUCalculator(): UseKBZHUCalculator {
    // Memoized empty КБЖУ
    const emptyKBZHU = useMemo(() => ({ ...EMPTY_KBZHU }), []);

    // Calculate КБЖУ for a portion
    const calculateForPortion = useCallback(
        (nutritionPer100: KBZHU, portionAmount: number): KBZHU => {
            return calculateKBZHU(nutritionPer100, portionAmount);
        },
        []
    );

    // Calculate КБЖУ for a food item
    const calculateForFood = useCallback(
        (food: FoodItem, portionAmount: number): KBZHU => {
            return calculateFoodKBZHU(food, portionAmount);
        },
        []
    );

    // Calculate daily totals
    const calculateTotals = useCallback((entries: FoodEntry[]): KBZHU => {
        return calculateDailyTotals(entries);
    }, []);

    // Get progress color
    const getColor = useCallback(
        (current: number, target: number): ProgressColor => {
            return getProgressColor(current, target);
        },
        []
    );

    // Get percentage
    const getPercent = useCallback((current: number, target: number): number => {
        return getPercentage(current, target);
    }, []);

    // Get macro goals from calorie goal
    const getMacroGoals = useCallback(
        (calorieGoal: number): Omit<KBZHU, 'calories'> => {
            return calculateMacroGoals(calorieGoal);
        },
        []
    );

    // Validate portion
    const validatePortion = useCallback(
        (amount: number): { isValid: boolean; error?: string } => {
            return validatePortionAmount(amount);
        },
        []
    );

    // Get full progress info for all macros
    const getProgress = useCallback(
        (current: KBZHU, targets: TargetGoals): KBZHUProgress => {
            const createMacroProgress = (
                currentValue: number,
                targetValue: number
            ): MacroProgress => {
                const percentage = getPercentage(currentValue, targetValue);
                return {
                    current: currentValue,
                    target: targetValue,
                    percentage,
                    color: getProgressColor(currentValue, targetValue),
                    isExceeded: percentage > 100,
                };
            };

            return {
                calories: createMacroProgress(current.calories, targets.calories),
                protein: createMacroProgress(current.protein, targets.protein),
                fat: createMacroProgress(current.fat, targets.fat),
                carbs: createMacroProgress(current.carbs, targets.carbs),
            };
        },
        []
    );

    // Format value for display
    const formatValue = useCallback(
        (value: number, decimals: number = 1): string => {
            if (!Number.isFinite(value)) return '0';
            return value.toFixed(decimals).replace(/\.0$/, '');
        },
        []
    );

    // Format progress as "current / target"
    const formatProgress = useCallback(
        (current: number, target: number, unit: string = ''): string => {
            const formattedCurrent = formatValue(current);
            const formattedTarget = formatValue(target);
            const unitSuffix = unit ? ` ${unit}` : '';
            return `${formattedCurrent} / ${formattedTarget}${unitSuffix}`;
        },
        [formatValue]
    );

    return {
        // State
        emptyKBZHU,
        // Actions
        calculateForPortion,
        calculateForFood,
        calculateTotals,
        getColor,
        getPercent,
        getMacroGoals,
        validatePortion,
        getProgress,
        formatValue,
        formatProgress,
    };
}

export default useKBZHUCalculator;
