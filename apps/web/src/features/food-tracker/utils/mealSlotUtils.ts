/**
 * Meal Slot Utilities
 *
 * Utilities for time-based meal slot assignment, labels, icons, and subtotals.
 * All labels are in Russian per localization requirements.
 *
 * @module food-tracker/utils/mealSlotUtils
 */

import type { MealType, FoodEntry, KBZHU, EntriesByMealType } from '../types';
import { EMPTY_KBZHU, roundToOneDecimal } from './kbzhuCalculator';

// ============================================================================
// Constants
// ============================================================================

/**
 * Russian labels for meal types
 */
export const MEAL_LABELS: Record<MealType, string> = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус',
} as const;

/**
 * Lucide icon names for meal types
 */
export const MEAL_ICONS: Record<MealType, string> = {
    breakfast: 'Sunrise',
    lunch: 'Sun',
    dinner: 'Moon',
    snack: 'Cookie',
} as const;

/**
 * Time ranges for meal slot assignment (24-hour format)
 * - Breakfast: 05:00-10:59
 * - Lunch: 11:00-15:59
 * - Dinner: 16:00-20:59
 * - Snack: 21:00-04:59
 */
export const MEAL_TIME_RANGES: Record<MealType, { start: number; end: number }> = {
    breakfast: { start: 5, end: 10 },
    lunch: { start: 11, end: 15 },
    dinner: { start: 16, end: 20 },
    snack: { start: 21, end: 4 }, // Wraps around midnight
} as const;

// ============================================================================
// Time-Based Meal Slot Assignment
// ============================================================================

/**
 * Get meal slot based on time
 *
 * Time ranges:
 * - 05:00-10:59 → Завтрак (breakfast)
 * - 11:00-15:59 → Обед (lunch)
 * - 16:00-20:59 → Ужин (dinner)
 * - else → Перекус (snack)
 *
 * @param time - Time in HH:mm format or Date object
 * @returns Meal type based on time
 */
export function getMealSlotByTime(time: string | Date): MealType {
    let hour: number;

    if (time instanceof Date) {
        hour = time.getHours();
    } else {
        // Parse HH:mm format
        const parts = time.split(':');
        hour = parseInt(parts[0], 10);

        if (isNaN(hour) || hour < 0 || hour > 23) {
            return 'snack'; // Default to snack for invalid input
        }
    }

    // Breakfast: 05:00-10:59
    if (hour >= 5 && hour <= 10) {
        return 'breakfast';
    }

    // Lunch: 11:00-15:59
    if (hour >= 11 && hour <= 15) {
        return 'lunch';
    }

    // Dinner: 16:00-20:59
    if (hour >= 16 && hour <= 20) {
        return 'dinner';
    }

    // Snack: 21:00-04:59 (everything else)
    return 'snack';
}

// ============================================================================
// Label and Icon Functions
// ============================================================================

/**
 * Get Russian label for meal type
 *
 * @param mealType - Meal type
 * @returns Russian label (Завтрак, Обед, Ужин, Перекус)
 */
export function getMealSlotLabel(mealType: MealType): string {
    return MEAL_LABELS[mealType] || 'Перекус';
}

/**
 * Get Lucide icon name for meal type
 *
 * @param mealType - Meal type
 * @returns Lucide icon name
 */
export function getMealSlotIcon(mealType: MealType): string {
    return MEAL_ICONS[mealType] || 'Cookie';
}

// ============================================================================
// Subtotal Calculation Functions
// ============================================================================

/**
 * Calculate КБЖУ subtotals for a single meal slot
 *
 * @param entries - Array of food entries for the slot
 * @returns Sum of КБЖУ values for all entries
 */
export function calculateSlotSubtotal(entries: FoodEntry[]): KBZHU {
    if (!entries || entries.length === 0) {
        return { ...EMPTY_KBZHU };
    }

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

/**
 * Calculate КБЖУ subtotals for all meal slots
 *
 * @param entriesByMeal - Entries grouped by meal type
 * @returns Subtotals for each meal type
 */
export function calculateSlotSubtotals(
    entriesByMeal: EntriesByMealType
): Record<MealType, KBZHU> {
    return {
        breakfast: calculateSlotSubtotal(entriesByMeal.breakfast || []),
        lunch: calculateSlotSubtotal(entriesByMeal.lunch || []),
        dinner: calculateSlotSubtotal(entriesByMeal.dinner || []),
        snack: calculateSlotSubtotal(entriesByMeal.snack || []),
    };
}

// ============================================================================
// Grouping Functions
// ============================================================================

/**
 * Group food entries by meal type
 *
 * @param entries - Array of food entries
 * @returns Entries grouped by meal type
 */
export function groupEntriesByMealType(entries: FoodEntry[]): EntriesByMealType {
    const grouped: EntriesByMealType = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
    };

    for (const entry of entries) {
        const mealType = entry.mealType || getMealSlotByTime(entry.time);
        grouped[mealType].push(entry);
    }

    return grouped;
}

/**
 * Get the first entry time for a meal slot
 *
 * @param entries - Array of food entries for the slot
 * @returns First entry time in HH:mm format, or null if no entries
 */
export function getFirstEntryTime(entries: FoodEntry[]): string | null {
    if (!entries || entries.length === 0) {
        return null;
    }

    // Sort by time and return the first
    const sorted = [...entries].sort((a, b) => {
        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        return timeA.localeCompare(timeB);
    });

    return sorted[0].time || null;
}

/**
 * Get all meal types in display order
 *
 * @returns Array of meal types in order: breakfast, lunch, dinner, snack
 */
export function getMealTypesInOrder(): MealType[] {
    return ['breakfast', 'lunch', 'dinner', 'snack'];
}

/**
 * Check if a meal slot has entries
 *
 * @param entries - Array of food entries for the slot
 * @returns True if slot has at least one entry
 */
export function hasEntries(entries: FoodEntry[] | undefined): boolean {
    return Array.isArray(entries) && entries.length > 0;
}
