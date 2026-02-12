/**
 * Additional Property-Based Tests for КБЖУ Calculator
 *
 * Tests additional correctness properties:
 * - Property 3: Progress Bar Color Coding
 * - Property 14: Macro Goal Calculation
 * - Property 15: Percentage Calculation
 *
 * @module food-tracker/utils/__tests__/kbzhuCalculator.additional.property.test
 */

import fc from 'fast-check';
import {
    getProgressColor,
    getPercentage,
    calculateMacroGoals,
    calculateDailyTotals,
    roundToOneDecimal,
    MACRO_DISTRIBUTION,
    CALORIES_PER_GRAM,
} from '../kbzhuCalculator';
import type { KBZHU, FoodEntry } from '../../types';
import { foodEntryGenerator, kbzhuGenerator } from '../../testing/generators';

// ============================================================================
// Test Configuration
// ============================================================================

const PROPERTY_TEST_CONFIG = {
    numRuns: 100,
    verbose: false,
};

// ============================================================================
// Property 3: Progress Bar Color Coding
// ============================================================================

describe('Feature: food-tracker, Property 3: Progress Bar Color Coding', () => {
    /**
     * **Validates: Requirements 25.2, 25.3, 25.4**
     *
     * Property: Progress bar color coding follows these rules:
     * - Green: 80-100% (on track)
     * - Yellow: 50-79% or 101-120% (needs attention)
     * - Red: below 50% or above 120% (warning)
     */
    describe('Property: Color coding follows percentage thresholds', () => {
        it('should return green for 80-100% range', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(80), max: Math.fround(100), noNaN: true }),
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (percentage, target) => {
                        const current = (percentage / 100) * target;
                        const color = getProgressColor(current, target);
                        return color === 'green';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return yellow for 50-79% range', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(50), max: Math.fround(79), noNaN: true }),
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (percentage, target) => {
                        const current = (percentage / 100) * target;
                        const color = getProgressColor(current, target);
                        return color === 'yellow';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return yellow for 101-120% range', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(101), max: Math.fround(120), noNaN: true }),
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (percentage, target) => {
                        const current = (percentage / 100) * target;
                        const color = getProgressColor(current, target);
                        return color === 'yellow';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return red for below 50% range', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(49), noNaN: true }),
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (percentage, target) => {
                        const current = (percentage / 100) * target;
                        const color = getProgressColor(current, target);
                        return color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return red for above 120% range', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(121), max: Math.fround(300), noNaN: true }),
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (percentage, target) => {
                        const current = (percentage / 100) * target;
                        const color = getProgressColor(current, target);
                        return color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Color is always one of three valid values', () => {
        it('should always return green, yellow, or red', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const color = getProgressColor(current, target);
                        return color === 'green' || color === 'yellow' || color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Zero or negative target returns red', () => {
        it('should return red for zero target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    (current) => {
                        const color = getProgressColor(current, 0);
                        return color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return red for negative target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(-10000), max: Math.fround(-1), noNaN: true }),
                    (current, target) => {
                        const color = getProgressColor(current, target);
                        return color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });
});

// ============================================================================
// Property 14: Macro Goal Calculation
// ============================================================================

describe('Feature: food-tracker, Property 14: Macro Goal Calculation', () => {
    /**
     * **Validates: Requirements 25.6**
     *
     * Property: Macro goals are calculated from calorie goal using:
     * - Protein: (calorieGoal * 0.30) / 4
     * - Fat: (calorieGoal * 0.30) / 9
     * - Carbs: (calorieGoal * 0.40) / 4
     */
    describe('Property: Macro goals follow standard distribution formula', () => {
        it('should calculate protein as (calorieGoal * 0.30) / 4', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1000), max: Math.fround(5000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);
                        const expected = roundToOneDecimal(
                            (calorieGoal * MACRO_DISTRIBUTION.protein) / CALORIES_PER_GRAM.protein
                        );
                        return result.protein === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should calculate fat as (calorieGoal * 0.30) / 9', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1000), max: Math.fround(5000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);
                        const expected = roundToOneDecimal(
                            (calorieGoal * MACRO_DISTRIBUTION.fat) / CALORIES_PER_GRAM.fat
                        );
                        return result.fat === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should calculate carbs as (calorieGoal * 0.40) / 4', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1000), max: Math.fround(5000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);
                        const expected = roundToOneDecimal(
                            (calorieGoal * MACRO_DISTRIBUTION.carbs) / CALORIES_PER_GRAM.carbs
                        );
                        return result.carbs === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Macro distribution sums to 100%', () => {
        it('should have protein + fat + carbs distribution equal to 1.0', () => {
            const sum = MACRO_DISTRIBUTION.protein + MACRO_DISTRIBUTION.fat + MACRO_DISTRIBUTION.carbs;
            expect(sum).toBe(1.0);
        });
    });

    describe('Property: Zero or negative calorie goal returns zeros', () => {
        it('should return all zeros for zero calorie goal', () => {
            const result = calculateMacroGoals(0);
            expect(result.protein).toBe(0);
            expect(result.fat).toBe(0);
            expect(result.carbs).toBe(0);
        });

        it('should return all zeros for negative calorie goal', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(-10000), max: Math.fround(-1), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);
                        return result.protein === 0 && result.fat === 0 && result.carbs === 0;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Macro goals are always non-negative', () => {
        it('should always return non-negative macro values', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);
                        return result.protein >= 0 && result.fat >= 0 && result.carbs >= 0;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Macro goals scale linearly with calorie goal', () => {
        it('should double macro goals when calorie goal doubles', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(500), max: Math.fround(2500), noNaN: true }),
                    (baseCalories) => {
                        const baseResult = calculateMacroGoals(baseCalories);
                        const doubleResult = calculateMacroGoals(baseCalories * 2);

                        // Allow for rounding differences
                        const tolerance = 0.2;

                        const proteinRatio = baseResult.protein > 0
                            ? doubleResult.protein / baseResult.protein
                            : 2;
                        const fatRatio = baseResult.fat > 0
                            ? doubleResult.fat / baseResult.fat
                            : 2;
                        const carbsRatio = baseResult.carbs > 0
                            ? doubleResult.carbs / baseResult.carbs
                            : 2;

                        return (
                            Math.abs(proteinRatio - 2) < tolerance &&
                            Math.abs(fatRatio - 2) < tolerance &&
                            Math.abs(carbsRatio - 2) < tolerance
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });
});

// ============================================================================
// Property 15: Percentage Calculation
// ============================================================================

describe('Feature: food-tracker, Property 15: Percentage Calculation', () => {
    /**
     * **Validates: Requirements 25.5**
     *
     * Property: For any current/target where target > 0,
     * percentage = (current / target) * 100, rounded to nearest integer
     */
    describe('Property: Percentage equals (current / target) * 100', () => {
        it('should calculate percentage correctly for positive targets', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const result = getPercentage(current, target);
                        const expected = Math.round((current / target) * 100);
                        return result === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Zero target returns zero percentage', () => {
        it('should return 0 for zero target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    (current) => {
                        const result = getPercentage(current, 0);
                        return result === 0;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Negative target returns zero percentage', () => {
        it('should return 0 for negative target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(-10000), max: Math.fround(-1), noNaN: true }),
                    (current, target) => {
                        const result = getPercentage(current, target);
                        return result === 0;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Percentage is always non-negative for non-negative current', () => {
        it('should always return non-negative percentage', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const result = getPercentage(current, target);
                        return result >= 0;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: 100% when current equals target', () => {
        it('should return 100 when current equals target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (value) => {
                        const result = getPercentage(value, value);
                        return result === 100;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    describe('Property: Percentage is rounded to nearest integer', () => {
        it('should return integer values', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const result = getPercentage(current, target);
                        return Number.isInteger(result);
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });
});

// ============================================================================
// Property 2: Daily Totals Sum (Additional tests)
// ============================================================================

describe('Feature: food-tracker, Property 2: Daily Totals Sum (Additional)', () => {
    /**
     * **Validates: Requirements 2.4, 2.5, 10.3, 10.5**
     *
     * Property: For any set of entries, daily totals = sum of all entry values
     */
    describe('Property: Daily totals equal sum of all entries', () => {
        it('should sum all entry nutrition values correctly', () => {
            fc.assert(
                fc.property(
                    fc.array(foodEntryGenerator(), { minLength: 0, maxLength: 20 }),
                    (entries) => {
                        const result = calculateDailyTotals(entries);

                        // Calculate expected totals manually
                        let expectedCalories = 0;
                        let expectedProtein = 0;
                        let expectedFat = 0;
                        let expectedCarbs = 0;

                        for (const entry of entries) {
                            expectedCalories += entry.nutrition.calories;
                            expectedProtein += entry.nutrition.protein;
                            expectedFat += entry.nutrition.fat;
                            expectedCarbs += entry.nutrition.carbs;
                        }

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
    });

    describe('Property: Empty entries return zero totals', () => {
        it('should return all zeros for empty array', () => {
            const result = calculateDailyTotals([]);
            expect(result.calories).toBe(0);
            expect(result.protein).toBe(0);
            expect(result.fat).toBe(0);
            expect(result.carbs).toBe(0);
        });
    });

    describe('Property: Daily totals are always non-negative', () => {
        it('should always return non-negative totals', () => {
            fc.assert(
                fc.property(
                    fc.array(foodEntryGenerator(), { minLength: 0, maxLength: 20 }),
                    (entries) => {
                        const result = calculateDailyTotals(entries);
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

    describe('Property: Adding entry increases totals', () => {
        it('should increase totals when adding non-zero entry', () => {
            fc.assert(
                fc.property(
                    fc.array(foodEntryGenerator(), { minLength: 1, maxLength: 10 }),
                    foodEntryGenerator().filter(e =>
                        e.nutrition.calories > 0 ||
                        e.nutrition.protein > 0 ||
                        e.nutrition.fat > 0 ||
                        e.nutrition.carbs > 0
                    ),
                    (existingEntries, newEntry) => {
                        const beforeTotals = calculateDailyTotals(existingEntries);
                        const afterTotals = calculateDailyTotals([...existingEntries, newEntry]);

                        // At least one value should increase (or stay same if new entry has zeros)
                        return (
                            afterTotals.calories >= beforeTotals.calories &&
                            afterTotals.protein >= beforeTotals.protein &&
                            afterTotals.fat >= beforeTotals.fat &&
                            afterTotals.carbs >= beforeTotals.carbs
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });
});
