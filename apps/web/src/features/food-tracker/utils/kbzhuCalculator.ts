/**
 * КБЖУ Calculator Utility
 *
 * Calculates nutritional values (calories, protein, fat, carbs) based on portion size.
 * All calculations are proportional to the per-100g/100ml base values.
 *
 * @module food-tracker/utils/kbzhuCalculator
 */

import type { KBZHU, FoodItem, FoodEntry, ProgressColor } from '../types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Empty КБЖУ values
 */
export const EMPTY_KBZHU: KBZHU = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
};

/**
 * Macro distribution percentages for goal calculation
 */
export const MACRO_DISTRIBUTION = {
    protein: 0.30, // 30% of calories from protein
    fat: 0.30,     // 30% of calories from fat
    carbs: 0.40,   // 40% of calories from carbs
} as const;

/**
 * Calories per gram for each macro
 */
export const CALORIES_PER_GRAM = {
    protein: 4,
    fat: 9,
    carbs: 4,
} as const;

// ============================================================================
// Core Calculation Functions
// ============================================================================

/**
 * Round a number to one decimal place
 */
export function roundToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * Calculate КБЖУ values for a given portion amount
 *
 * Formula: (nutritionPer100 * portionAmount) / 100
 * Results are rounded to one decimal place.
 *
 * @param nutritionPer100 - Nutritional values per 100g/100ml
 * @param portionAmount - Portion amount in grams or milliliters
 * @returns Calculated КБЖУ values for the portion
 *
 * @example
 * const nutrition = { calories: 250, protein: 20, fat: 15, carbs: 10 };
 * const result = calculateKBZHU(nutrition, 150);
 * // result = { calories: 375, protein: 30, fat: 22.5, carbs: 15 }
 */
export function calculateKBZHU(nutritionPer100: KBZHU, portionAmount: number): KBZHU {
    if (portionAmount <= 0 || !Number.isFinite(portionAmount)) {
        return { ...EMPTY_KBZHU };
    }

    return {
        calories: roundToOneDecimal((nutritionPer100.calories * portionAmount) / 100),
        protein: roundToOneDecimal((nutritionPer100.protein * portionAmount) / 100),
        fat: roundToOneDecimal((nutritionPer100.fat * portionAmount) / 100),
        carbs: roundToOneDecimal((nutritionPer100.carbs * portionAmount) / 100),
    };
}

/**
 * Calculate КБЖУ for a food item with a specific portion
 *
 * @param food - Food item with nutritionPer100 values
 * @param portionAmount - Portion amount in grams or milliliters
 * @returns Calculated КБЖУ values for the portion
 */
export function calculateFoodKBZHU(food: FoodItem, portionAmount: number): KBZHU {
    return calculateKBZHU(food.nutritionPer100, portionAmount);
}

/**
 * Calculate daily totals from an array of food entries
 *
 * @param entries - Array of food entries
 * @returns Sum of all КБЖУ values
 */
export function calculateDailyTotals(entries: FoodEntry[]): KBZHU {
    const totals = entries.reduce(
        (acc, entry) => ({
            calories: acc.calories + entry.nutrition.calories,
            protein: acc.protein + entry.nutrition.protein,
            fat: acc.fat + entry.nutrition.fat,
            carbs: acc.carbs + entry.nutrition.carbs,
        }),
        { ...EMPTY_KBZHU }
    );

    return {
        calories: roundToOneDecimal(totals.calories),
        protein: roundToOneDecimal(totals.protein),
        fat: roundToOneDecimal(totals.fat),
        carbs: roundToOneDecimal(totals.carbs),
    };
}

// ============================================================================
// Progress and Goal Functions
// ============================================================================

/**
 * Calculate percentage of goal achieved
 *
 * @param current - Current intake value
 * @param target - Target goal value
 * @returns Percentage (0-100+), or 0 if target is 0
 */
export function getPercentage(current: number, target: number): number {
    if (target <= 0) {
        return 0;
    }
    return Math.round((current / target) * 100);
}

/**
 * Get progress bar color based on percentage of goal
 *
 * - Green: 80-100% (on track)
 * - Yellow: 50-79% or 101-120% (needs attention)
 * - Red: below 50% or above 120% (warning)
 *
 * @param current - Current intake value
 * @param target - Target goal value
 * @returns Progress color
 */
export function getProgressColor(current: number, target: number): ProgressColor {
    const percentage = getPercentage(current, target);

    if (percentage >= 80 && percentage <= 100) {
        return 'green';
    }
    if ((percentage >= 50 && percentage < 80) || (percentage > 100 && percentage <= 120)) {
        return 'yellow';
    }
    return 'red';
}

/**
 * Calculate macro goals from calorie goal
 *
 * Uses standard distribution:
 * - Protein: 30% of calories / 4 cal per gram
 * - Fat: 30% of calories / 9 cal per gram
 * - Carbs: 40% of calories / 4 cal per gram
 *
 * @param calorieGoal - Daily calorie goal
 * @returns Calculated macro goals in grams
 */
export function calculateMacroGoals(calorieGoal: number): Omit<KBZHU, 'calories'> {
    if (calorieGoal <= 0) {
        return { protein: 0, fat: 0, carbs: 0 };
    }

    return {
        protein: roundToOneDecimal((calorieGoal * MACRO_DISTRIBUTION.protein) / CALORIES_PER_GRAM.protein),
        fat: roundToOneDecimal((calorieGoal * MACRO_DISTRIBUTION.fat) / CALORIES_PER_GRAM.fat),
        carbs: roundToOneDecimal((calorieGoal * MACRO_DISTRIBUTION.carbs) / CALORIES_PER_GRAM.carbs),
    };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate portion amount
 *
 * @param portionAmount - Portion amount to validate
 * @returns Validation result with error message in Russian if invalid
 */
export function validatePortionAmount(portionAmount: number): { isValid: boolean; error?: string } {
    if (typeof portionAmount !== 'number' || Number.isNaN(portionAmount)) {
        return { isValid: false, error: 'Порция должна быть числом' };
    }
    if (!Number.isFinite(portionAmount)) {
        return { isValid: false, error: 'Порция должна быть конечным числом' };
    }
    if (portionAmount <= 0) {
        return { isValid: false, error: 'Порция должна быть положительным числом' };
    }
    return { isValid: true };
}
