/**
 * Property-Based Tests for Meal Slot Utilities
 *
 * Tests the correctness properties of meal slot assignment and subtotals using fast-check.
 *
 * @module food-tracker/utils/__tests__/mealSlotUtils.property.test
 */

import fc from 'fast-check';
import {
    getMealSlotByTime,
    getMealSlotLabel,
    getMealSlotIcon,
    calculateSlotSubtotal,
    calculateSlotSubtotals,
    groupEntriesByMealType,
    MEAL_LABELS,
    MEAL_ICONS,
} from '../mealSlotUtils';
import { roundToOneDecimal, EMPTY_KBZHU } from '../kbzhuCalculator';
import type { MealType, FoodEntry, KBZHU, EntriesByMealType } from '../../types';

// ============================================================================
// Test Configuration
// ============================================================================

const PROPERTY_TEST_CONFIG = {
    numRuns: 100,
    verbose: false,
};

// ============================================================================
// Custom Generators
// ============================================================================

/**
 * Generator for valid hours (0-23)
 */
const hourGenerator = (): fc.Arbitrary<number> => {
    return fc.integer({ min: 0, max: 23 });
};

/**
 * Generator for valid minutes (0-59)
 */
const minuteGenerator = (): fc.Arbitrary<number> => {
    return fc.integer({ min: 0, max: 59 });
};

/**
 * Generator for time in HH:mm format
 */
const timeGenerator = (): fc.Arbitrary<string> => {
    return fc.tuple(hourGenerator(), minuteGenerator()).map(([hour, minute]) => {
        const hh = hour.toString().padStart(2, '0');
        const mm = minute.toString().padStart(2, '0');
        return `${hh}:${mm}`;
    });
};

/**
 * Generator for meal types
 */
const mealTypeGenerator = (): fc.Arbitrary<MealType> => {
    return fc.constantFrom('breakfast', 'lunch', 'dinner', 'snack');
};

/**
 * Generator for KBZHU values
 */
const kbzhuGenerator = (): fc.Arbitrary<KBZHU> => {
    return fc.record({
        calories: fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true }),
        protein: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        fat: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        carbs: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
    });
};

/**
 * Generator for date strings in YYYY-MM-DD format
 */
const dateStringGenerator = (): fc.Arbitrary<string> => {
    return fc.tuple(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 })
    ).map(([year, month, day]) => {
        const mm = month.toString().padStart(2, '0');
        const dd = day.toString().padStart(2, '0');
        return `${year}-${mm}-${dd}`;
    });
};

/**
 * Generator for ISO date strings
 */
const isoDateStringGenerator = (): fc.Arbitrary<string> => {
    return dateStringGenerator().map(date => `${date}T12:00:00.000Z`);
};

/**
 * Generator for food entries
 */
const foodEntryGenerator = (): fc.Arbitrary<FoodEntry> => {
    return fc.record({
        id: fc.uuid(),
        foodId: fc.uuid(),
        foodName: fc.string({ minLength: 1, maxLength: 50 }),
        mealType: mealTypeGenerator(),
        portionType: fc.constantFrom('grams', 'milliliters', 'portion'),
        portionAmount: fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true }),
        nutrition: kbzhuGenerator(),
        time: timeGenerator(),
        date: dateStringGenerator(),
        createdAt: isoDateStringGenerator(),
        updatedAt: isoDateStringGenerator(),
    }) as fc.Arbitrary<FoodEntry>;
};

// ============================================================================
// Property 4: Time-Based Meal Slot Assignment
// ============================================================================

describe('Feature: food-tracker, Property 4: Time-Based Meal Slot Assignment', () => {
    /**
     * **Validates: Requirements 26.1, 26.2, 26.3, 26.4**
     *
     * Property: Time-based meal slot assignment follows these rules:
     * - 05:00-10:59 → Завтрак (breakfast)
     * - 11:00-15:59 → Обед (lunch)
     * - 16:00-20:59 → Ужин (dinner)
     * - else → Перекус (snack)
     */

    /**
     * **Validates: Requirement 26.1**
     * WHEN time is 05:00-10:59, THE Food_Tracker SHALL assign to Завтрак
     */
    describe('Property: Breakfast assignment for 05:00-10:59', () => {
        it('should assign breakfast for any time between 05:00 and 10:59', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 5, max: 10 }),
                    minuteGenerator(),
                    (hour, minute) => {
                        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                        const result = getMealSlotByTime(time);
                        return result === 'breakfast';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should assign breakfast for exact boundary at 05:00', () => {
            expect(getMealSlotByTime('05:00')).toBe('breakfast');
        });

        it('should assign breakfast for exact boundary at 10:59', () => {
            expect(getMealSlotByTime('10:59')).toBe('breakfast');
        });
    });

    /**
     * **Validates: Requirement 26.2**
     * WHEN time is 11:00-15:59, THE Food_Tracker SHALL assign to Обед
     */
    describe('Property: Lunch assignment for 11:00-15:59', () => {
        it('should assign lunch for any time between 11:00 and 15:59', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 11, max: 15 }),
                    minuteGenerator(),
                    (hour, minute) => {
                        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                        const result = getMealSlotByTime(time);
                        return result === 'lunch';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should assign lunch for exact boundary at 11:00', () => {
            expect(getMealSlotByTime('11:00')).toBe('lunch');
        });

        it('should assign lunch for exact boundary at 15:59', () => {
            expect(getMealSlotByTime('15:59')).toBe('lunch');
        });
    });

    /**
     * **Validates: Requirement 26.3**
     * WHEN time is 16:00-20:59, THE Food_Tracker SHALL assign to Ужин
     */
    describe('Property: Dinner assignment for 16:00-20:59', () => {
        it('should assign dinner for any time between 16:00 and 20:59', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 16, max: 20 }),
                    minuteGenerator(),
                    (hour, minute) => {
                        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                        const result = getMealSlotByTime(time);
                        return result === 'dinner';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should assign dinner for exact boundary at 16:00', () => {
            expect(getMealSlotByTime('16:00')).toBe('dinner');
        });

        it('should assign dinner for exact boundary at 20:59', () => {
            expect(getMealSlotByTime('20:59')).toBe('dinner');
        });
    });

    /**
     * **Validates: Requirement 26.4**
     * WHEN time is outside meal ranges, THE Food_Tracker SHALL assign to Перекус
     */
    describe('Property: Snack assignment for other times', () => {
        it('should assign snack for times 21:00-23:59', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 21, max: 23 }),
                    minuteGenerator(),
                    (hour, minute) => {
                        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                        const result = getMealSlotByTime(time);
                        return result === 'snack';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should assign snack for times 00:00-04:59', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 4 }),
                    minuteGenerator(),
                    (hour, minute) => {
                        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                        const result = getMealSlotByTime(time);
                        return result === 'snack';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should assign snack for exact boundary at 21:00', () => {
            expect(getMealSlotByTime('21:00')).toBe('snack');
        });

        it('should assign snack for exact boundary at 04:59', () => {
            expect(getMealSlotByTime('04:59')).toBe('snack');
        });
    });

    /**
     * Property: Boundary transitions are correct
     */
    describe('Property: Boundary transitions', () => {
        it('should transition from snack to breakfast at 05:00', () => {
            expect(getMealSlotByTime('04:59')).toBe('snack');
            expect(getMealSlotByTime('05:00')).toBe('breakfast');
        });

        it('should transition from breakfast to lunch at 11:00', () => {
            expect(getMealSlotByTime('10:59')).toBe('breakfast');
            expect(getMealSlotByTime('11:00')).toBe('lunch');
        });

        it('should transition from lunch to dinner at 16:00', () => {
            expect(getMealSlotByTime('15:59')).toBe('lunch');
            expect(getMealSlotByTime('16:00')).toBe('dinner');
        });

        it('should transition from dinner to snack at 21:00', () => {
            expect(getMealSlotByTime('20:59')).toBe('dinner');
            expect(getMealSlotByTime('21:00')).toBe('snack');
        });
    });

    /**
     * Property: Always returns a valid meal type
     */
    describe('Property: Always returns valid meal type', () => {
        it('should always return a valid meal type for any time', () => {
            fc.assert(
                fc.property(timeGenerator(), (time) => {
                    const result = getMealSlotByTime(time);
                    return ['breakfast', 'lunch', 'dinner', 'snack'].includes(result);
                }),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return snack for invalid time format', () => {
            expect(getMealSlotByTime('invalid')).toBe('snack');
            expect(getMealSlotByTime('')).toBe('snack');
            expect(getMealSlotByTime('25:00')).toBe('snack');
        });
    });
});

// ============================================================================
// Property 5: Meal Slot Subtotals
// ============================================================================

describe('Feature: food-tracker, Property 5: Meal Slot Subtotals', () => {
    /**
     * **Validates: Requirements 26.6**
     *
     * Property: For any meal slot, subtotal = sum of all entries in that slot
     */

    /**
     * **Validates: Requirement 26.6**
     * FOR EACH meal slot, THE Food_Tracker SHALL display subtotal КБЖУ
     */
    describe('Property: Subtotal equals sum of all entries', () => {
        it('should calculate subtotal as sum of all entry nutrition values', () => {
            fc.assert(
                fc.property(
                    fc.array(foodEntryGenerator(), { minLength: 1, maxLength: 10 }),
                    (entries) => {
                        const result = calculateSlotSubtotal(entries);

                        // Calculate expected sum
                        const expectedCalories = entries.reduce((sum, e) => sum + e.nutrition.calories, 0);
                        const expectedProtein = entries.reduce((sum, e) => sum + e.nutrition.protein, 0);
                        const expectedFat = entries.reduce((sum, e) => sum + e.nutrition.fat, 0);
                        const expectedCarbs = entries.reduce((sum, e) => sum + e.nutrition.carbs, 0);

                        // Allow for rounding differences
                        const tolerance = 0.2;

                        return (
                            Math.abs(result.calories - roundToOneDecimal(expectedCalories)) < tolerance &&
                            Math.abs(result.protein - roundToOneDecimal(expectedProtein)) < tolerance &&
                            Math.abs(result.fat - roundToOneDecimal(expectedFat)) < tolerance &&
                            Math.abs(result.carbs - roundToOneDecimal(expectedCarbs)) < tolerance
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return empty KBZHU for empty entries array', () => {
            const result = calculateSlotSubtotal([]);
            expect(result).toEqual(EMPTY_KBZHU);
        });

        it('should return empty KBZHU for undefined entries', () => {
            const result = calculateSlotSubtotal(undefined as unknown as FoodEntry[]);
            expect(result).toEqual(EMPTY_KBZHU);
        });

        it('should return single entry nutrition for array with one entry', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry) => {
                    const result = calculateSlotSubtotal([entry]);

                    const tolerance = 0.1;

                    return (
                        Math.abs(result.calories - roundToOneDecimal(entry.nutrition.calories)) < tolerance &&
                        Math.abs(result.protein - roundToOneDecimal(entry.nutrition.protein)) < tolerance &&
                        Math.abs(result.fat - roundToOneDecimal(entry.nutrition.fat)) < tolerance &&
                        Math.abs(result.carbs - roundToOneDecimal(entry.nutrition.carbs)) < tolerance
                    );
                }),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Subtotals are always non-negative
     */
    describe('Property: Subtotals are non-negative', () => {
        it('should always return non-negative subtotals', () => {
            fc.assert(
                fc.property(
                    fc.array(foodEntryGenerator(), { minLength: 0, maxLength: 10 }),
                    (entries) => {
                        const result = calculateSlotSubtotal(entries);

                        return (
                            result.calories >= 0 &&
                            result.protein >= 0 &&
                            result.fat >= 0 &&
                            result.carbs >= 0
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Subtotals are rounded to one decimal place
     */
    describe('Property: Subtotals are rounded', () => {
        it('should round all subtotal values to one decimal place', () => {
            fc.assert(
                fc.property(
                    fc.array(foodEntryGenerator(), { minLength: 1, maxLength: 10 }),
                    (entries) => {
                        const result = calculateSlotSubtotal(entries);

                        const hasOneDecimal = (value: number): boolean => {
                            const rounded = Math.round(value * 10) / 10;
                            return Math.abs(value - rounded) < 0.0001;
                        };

                        return (
                            hasOneDecimal(result.calories) &&
                            hasOneDecimal(result.protein) &&
                            hasOneDecimal(result.fat) &&
                            hasOneDecimal(result.carbs)
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: calculateSlotSubtotals calculates for all meal types
     */
    describe('Property: All meal types have subtotals', () => {
        it('should calculate subtotals for all four meal types', () => {
            const entriesByMeal: EntriesByMealType = {
                breakfast: [],
                lunch: [],
                dinner: [],
                snack: [],
            };

            const result = calculateSlotSubtotals(entriesByMeal);

            expect(result).toHaveProperty('breakfast');
            expect(result).toHaveProperty('lunch');
            expect(result).toHaveProperty('dinner');
            expect(result).toHaveProperty('snack');
        });
    });
});

// ============================================================================
// Additional Property Tests
// ============================================================================

describe('Feature: food-tracker, Meal Slot Labels and Icons', () => {
    /**
     * Property: All meal types have Russian labels
     */
    describe('Property: Russian labels for all meal types', () => {
        it('should return Russian label for any meal type', () => {
            fc.assert(
                fc.property(mealTypeGenerator(), (mealType) => {
                    const label = getMealSlotLabel(mealType);
                    return typeof label === 'string' && label.length > 0;
                }),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return correct Russian labels', () => {
            expect(getMealSlotLabel('breakfast')).toBe('Завтрак');
            expect(getMealSlotLabel('lunch')).toBe('Обед');
            expect(getMealSlotLabel('dinner')).toBe('Ужин');
            expect(getMealSlotLabel('snack')).toBe('Перекус');
        });
    });

    /**
     * Property: All meal types have icons
     */
    describe('Property: Icons for all meal types', () => {
        it('should return icon name for any meal type', () => {
            fc.assert(
                fc.property(mealTypeGenerator(), (mealType) => {
                    const icon = getMealSlotIcon(mealType);
                    return typeof icon === 'string' && icon.length > 0;
                }),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return correct icon names', () => {
            expect(getMealSlotIcon('breakfast')).toBe('Sunrise');
            expect(getMealSlotIcon('lunch')).toBe('Sun');
            expect(getMealSlotIcon('dinner')).toBe('Moon');
            expect(getMealSlotIcon('snack')).toBe('Cookie');
        });
    });
});
