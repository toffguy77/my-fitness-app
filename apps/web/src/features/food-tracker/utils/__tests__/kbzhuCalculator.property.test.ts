/**
 * Property-Based Tests for КБЖУ Calculator
 *
 * Tests the correctness properties of КБЖУ calculations using fast-check.
 * These tests verify that the calculator behaves correctly across all valid inputs.
 *
 * @module food-tracker/utils/__tests__/kbzhuCalculator.property.test
 */

import fc from 'fast-check';
import {
    calculateKBZHU,
    roundToOneDecimal,
    getProgressColor,
    getPercentage,
    calculateMacroGoals,
    EMPTY_KBZHU,
    MACRO_DISTRIBUTION,
    CALORIES_PER_GRAM,
} from '../kbzhuCalculator';
import type { KBZHU } from '../../types';
import { kbzhuGenerator, validPortionGenerator } from '../../testing/generators';

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
 * Generator for nutrition values per 100g/100ml
 * Uses realistic ranges for food items
 * Note: Using Math.fround() for 32-bit float compatibility with fast-check
 */
const nutritionPer100Generator = (): fc.Arbitrary<KBZHU> => {
    return fc.record({
        calories: fc.float({ min: Math.fround(0), max: Math.fround(900), noNaN: true }),
        protein: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        fat: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        carbs: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
    });
};

/**
 * Generator for valid portion amounts (positive numbers)
 * Note: Using Math.fround() for 32-bit float compatibility with fast-check
 */
const portionAmountGenerator = (): fc.Arbitrary<number> => {
    return fc.float({ min: Math.fround(0.1), max: Math.fround(2000), noNaN: true });
};

// ============================================================================
// Property 1: КБЖУ Proportional Calculation
// ============================================================================

describe('Feature: food-tracker, Property 1: КБЖУ Proportional Calculation', () => {
    /**
     * **Validates: Requirements 9.5, 9.7**
     *
     * Property: For any food item with known nutrition per 100g/100ml and any valid
     * portion amount, the calculated КБЖУ values SHALL equal
     * (nutritionPer100 * portionAmount) / 100, rounded to one decimal place.
     */
    describe('Property: Calculated КБЖУ equals (nutritionPer100 * portionAmount) / 100', () => {
        it('should calculate calories proportionally to portion size', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    portionAmountGenerator(),
                    (nutritionPer100, portionAmount) => {
                        const result = calculateKBZHU(nutritionPer100, portionAmount);
                        const expected = roundToOneDecimal(
                            (nutritionPer100.calories * portionAmount) / 100
                        );

                        return result.calories === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should calculate protein proportionally to portion size', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    portionAmountGenerator(),
                    (nutritionPer100, portionAmount) => {
                        const result = calculateKBZHU(nutritionPer100, portionAmount);
                        const expected = roundToOneDecimal(
                            (nutritionPer100.protein * portionAmount) / 100
                        );

                        return result.protein === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should calculate fat proportionally to portion size', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    portionAmountGenerator(),
                    (nutritionPer100, portionAmount) => {
                        const result = calculateKBZHU(nutritionPer100, portionAmount);
                        const expected = roundToOneDecimal(
                            (nutritionPer100.fat * portionAmount) / 100
                        );

                        return result.fat === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should calculate carbs proportionally to portion size', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    portionAmountGenerator(),
                    (nutritionPer100, portionAmount) => {
                        const result = calculateKBZHU(nutritionPer100, portionAmount);
                        const expected = roundToOneDecimal(
                            (nutritionPer100.carbs * portionAmount) / 100
                        );

                        return result.carbs === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should calculate all КБЖУ values correctly in a single call', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    portionAmountGenerator(),
                    (nutritionPer100, portionAmount) => {
                        const result = calculateKBZHU(nutritionPer100, portionAmount);

                        const expectedCalories = roundToOneDecimal(
                            (nutritionPer100.calories * portionAmount) / 100
                        );
                        const expectedProtein = roundToOneDecimal(
                            (nutritionPer100.protein * portionAmount) / 100
                        );
                        const expectedFat = roundToOneDecimal(
                            (nutritionPer100.fat * portionAmount) / 100
                        );
                        const expectedCarbs = roundToOneDecimal(
                            (nutritionPer100.carbs * portionAmount) / 100
                        );

                        return (
                            result.calories === expectedCalories &&
                            result.protein === expectedProtein &&
                            result.fat === expectedFat &&
                            result.carbs === expectedCarbs
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * **Validates: Requirements 9.5, 9.7**
     *
     * Property: КБЖУ values update in real-time as portion changes.
     * This is verified by ensuring different portions produce different results
     * (when nutrition values are sufficiently large to avoid rounding to zero).
     */
    describe('Property: КБЖУ values change proportionally with portion', () => {
        it('should produce different results for different portion sizes', () => {
            fc.assert(
                fc.property(
                    // Use nutrition values that are large enough to produce different results
                    fc.record({
                        calories: fc.float({ min: Math.fround(10), max: Math.fround(900), noNaN: true }),
                        protein: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
                        fat: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
                        carbs: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
                    }),
                    fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }),
                    fc.float({ min: Math.fround(510), max: Math.fround(1000), noNaN: true }),
                    (nutritionPer100, portion1, portion2) => {
                        const result1 = calculateKBZHU(nutritionPer100, portion1);
                        const result2 = calculateKBZHU(nutritionPer100, portion2);

                        // At least one value should be different
                        return (
                            result1.calories !== result2.calories ||
                            result1.protein !== result2.protein ||
                            result1.fat !== result2.fat ||
                            result1.carbs !== result2.carbs
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should scale linearly with portion size', () => {
            fc.assert(
                fc.property(
                    // Use nutrition values that are large enough to avoid rounding issues
                    fc.record({
                        calories: fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }),
                        protein: fc.float({ min: Math.fround(5), max: Math.fround(50), noNaN: true }),
                        fat: fc.float({ min: Math.fround(5), max: Math.fround(50), noNaN: true }),
                        carbs: fc.float({ min: Math.fround(5), max: Math.fround(50), noNaN: true }),
                    }),
                    fc.float({ min: Math.fround(50), max: Math.fround(200), noNaN: true }), // Base portion
                    fc.float({ min: Math.fround(2), max: Math.fround(3), noNaN: true }), // Scale factor
                    (nutritionPer100, basePortion, scaleFactor) => {
                        const scaledPortion = basePortion * scaleFactor;

                        const baseResult = calculateKBZHU(nutritionPer100, basePortion);
                        const scaledResult = calculateKBZHU(nutritionPer100, scaledPortion);

                        // Check that scaled result is approximately scaleFactor times base result
                        // Allow for rounding differences
                        const tolerance = 0.3;

                        const caloriesRatio =
                            baseResult.calories > 0
                                ? scaledResult.calories / baseResult.calories
                                : scaleFactor;
                        const proteinRatio =
                            baseResult.protein > 0
                                ? scaledResult.protein / baseResult.protein
                                : scaleFactor;
                        const fatRatio =
                            baseResult.fat > 0 ? scaledResult.fat / baseResult.fat : scaleFactor;
                        const carbsRatio =
                            baseResult.carbs > 0
                                ? scaledResult.carbs / baseResult.carbs
                                : scaleFactor;

                        return (
                            Math.abs(caloriesRatio - scaleFactor) < tolerance &&
                            Math.abs(proteinRatio - scaleFactor) < tolerance &&
                            Math.abs(fatRatio - scaleFactor) < tolerance &&
                            Math.abs(carbsRatio - scaleFactor) < tolerance
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Results are always rounded to one decimal place
     */
    describe('Property: Results are rounded to one decimal place', () => {
        it('should round all КБЖУ values to one decimal place', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    portionAmountGenerator(),
                    (nutritionPer100, portionAmount) => {
                        const result = calculateKBZHU(nutritionPer100, portionAmount);

                        // Check that each value has at most one decimal place
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
     * Property: Zero or negative portions return empty КБЖУ
     */
    describe('Property: Invalid portions return empty КБЖУ', () => {
        it('should return empty КБЖУ for zero portion', () => {
            fc.assert(
                fc.property(nutritionPer100Generator(), (nutritionPer100) => {
                    const result = calculateKBZHU(nutritionPer100, 0);

                    return (
                        result.calories === 0 &&
                        result.protein === 0 &&
                        result.fat === 0 &&
                        result.carbs === 0
                    );
                }),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return empty КБЖУ for negative portion', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    fc.float({ min: Math.fround(-1000), max: Math.fround(-0.01), noNaN: true }),
                    (nutritionPer100, negativePortion) => {
                        const result = calculateKBZHU(nutritionPer100, negativePortion);

                        return (
                            result.calories === 0 &&
                            result.protein === 0 &&
                            result.fat === 0 &&
                            result.carbs === 0
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return empty КБЖУ for NaN portion', () => {
            fc.assert(
                fc.property(nutritionPer100Generator(), (nutritionPer100) => {
                    const result = calculateKBZHU(nutritionPer100, NaN);

                    return (
                        result.calories === 0 &&
                        result.protein === 0 &&
                        result.fat === 0 &&
                        result.carbs === 0
                    );
                }),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return empty КБЖУ for Infinity portion', () => {
            fc.assert(
                fc.property(nutritionPer100Generator(), (nutritionPer100) => {
                    const resultPositive = calculateKBZHU(nutritionPer100, Infinity);
                    const resultNegative = calculateKBZHU(nutritionPer100, -Infinity);

                    return (
                        resultPositive.calories === 0 &&
                        resultPositive.protein === 0 &&
                        resultPositive.fat === 0 &&
                        resultPositive.carbs === 0 &&
                        resultNegative.calories === 0 &&
                        resultNegative.protein === 0 &&
                        resultNegative.fat === 0 &&
                        resultNegative.carbs === 0
                    );
                }),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: 100g portion returns the same values as nutritionPer100
     */
    describe('Property: 100g portion returns original nutrition values', () => {
        it('should return same values for 100g portion', () => {
            fc.assert(
                fc.property(nutritionPer100Generator(), (nutritionPer100) => {
                    const result = calculateKBZHU(nutritionPer100, 100);

                    // Allow for small rounding differences
                    const tolerance = 0.1;

                    return (
                        Math.abs(result.calories - roundToOneDecimal(nutritionPer100.calories)) <
                        tolerance &&
                        Math.abs(result.protein - roundToOneDecimal(nutritionPer100.protein)) <
                        tolerance &&
                        Math.abs(result.fat - roundToOneDecimal(nutritionPer100.fat)) < tolerance &&
                        Math.abs(result.carbs - roundToOneDecimal(nutritionPer100.carbs)) <
                        tolerance
                    );
                }),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Results are always non-negative for valid inputs
     */
    describe('Property: Results are non-negative for valid inputs', () => {
        it('should always return non-negative КБЖУ values', () => {
            fc.assert(
                fc.property(
                    nutritionPer100Generator(),
                    portionAmountGenerator(),
                    (nutritionPer100, portionAmount) => {
                        const result = calculateKBZHU(nutritionPer100, portionAmount);

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
});


// ============================================================================
// Property 3: Progress Bar Color Coding
// ============================================================================

describe('Feature: food-tracker, Property 3: Progress Bar Color Coding', () => {
    /**
     * **Validates: Requirements 25.2, 25.3, 25.4**
     *
     * Property: Progress bar color is determined by percentage of goal:
     * - Green: 80-100% (on track)
     * - Yellow: 50-79% or 101-120% (needs attention)
     * - Red: below 50% or above 120% (warning)
     */

    /**
     * **Validates: Requirement 25.2**
     * WHEN intake is 80-100% of goal, THE Food_Tracker SHALL display the progress bar in green
     */
    describe('Property: Green color for 80-100% progress', () => {
        it('should return green for percentage exactly at 80%', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (target) => {
                        const current = target * 0.8;
                        const color = getProgressColor(current, target);
                        return color === 'green';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return green for percentage exactly at 100%', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (target) => {
                        const current = target; // 100%
                        const color = getProgressColor(current, target);
                        return color === 'green';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return green for any percentage between 80% and 100%', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(0.80), max: Math.fround(1.00), noNaN: true }),
                    (target, ratio) => {
                        const current = target * ratio;
                        const color = getProgressColor(current, target);
                        const percentage = getPercentage(current, target);

                        // Only check if percentage is actually in green range
                        if (percentage >= 80 && percentage <= 100) {
                            return color === 'green';
                        }
                        return true; // Skip edge cases due to rounding
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * **Validates: Requirement 25.3**
     * WHEN intake is 50-79% or 101-120% of goal, THE Food_Tracker SHALL display the progress bar in yellow
     */
    describe('Property: Yellow color for 50-79% or 101-120% progress', () => {
        it('should return yellow for percentage in 50-79% range', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(0.50), max: Math.fround(0.79), noNaN: true }),
                    (target, ratio) => {
                        const current = target * ratio;
                        const color = getProgressColor(current, target);
                        const percentage = getPercentage(current, target);

                        // Only check if percentage is actually in yellow range (50-79)
                        if (percentage >= 50 && percentage < 80) {
                            return color === 'yellow';
                        }
                        return true; // Skip edge cases due to rounding
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return yellow for percentage in 101-120% range', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(1.01), max: Math.fround(1.20), noNaN: true }),
                    (target, ratio) => {
                        const current = target * ratio;
                        const color = getProgressColor(current, target);
                        const percentage = getPercentage(current, target);

                        // Only check if percentage is actually in yellow range (101-120)
                        if (percentage > 100 && percentage <= 120) {
                            return color === 'yellow';
                        }
                        return true; // Skip edge cases due to rounding
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return yellow for percentage exactly at 50%', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (target) => {
                        const current = target * 0.5;
                        const color = getProgressColor(current, target);
                        return color === 'yellow';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return yellow for percentage exactly at 120%', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (target) => {
                        const current = target * 1.2;
                        const color = getProgressColor(current, target);
                        return color === 'yellow';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * **Validates: Requirement 25.4**
     * WHEN intake is below 50% or above 120% of goal, THE Food_Tracker SHALL display the progress bar in red
     */
    describe('Property: Red color for <50% or >120% progress', () => {
        it('should return red for percentage below 50%', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(0.01), max: Math.fround(0.49), noNaN: true }),
                    (target, ratio) => {
                        const current = target * ratio;
                        const color = getProgressColor(current, target);
                        const percentage = getPercentage(current, target);

                        // Only check if percentage is actually in red range (<50)
                        if (percentage < 50) {
                            return color === 'red';
                        }
                        return true; // Skip edge cases due to rounding
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return red for percentage above 120%', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
                    fc.float({ min: Math.fround(1.21), max: Math.fround(3.0), noNaN: true }),
                    (target, ratio) => {
                        const current = target * ratio;
                        const color = getProgressColor(current, target);
                        const percentage = getPercentage(current, target);

                        // Only check if percentage is actually in red range (>120)
                        if (percentage > 120) {
                            return color === 'red';
                        }
                        return true; // Skip edge cases due to rounding
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return red for zero current value', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (target) => {
                        const color = getProgressColor(0, target);
                        return color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return red for very high percentage (>200%)', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true }),
                    fc.float({ min: Math.fround(2.01), max: Math.fround(10.0), noNaN: true }),
                    (target, ratio) => {
                        const current = target * ratio;
                        const color = getProgressColor(current, target);
                        return color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Color coding is consistent with percentage calculation
     */
    describe('Property: Color coding consistency with percentage', () => {
        it('should always return a valid color for any current/target combination', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const color = getProgressColor(current, target);
                        return color === 'green' || color === 'yellow' || color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return red when target is zero (0% calculation)', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    (current) => {
                        const color = getProgressColor(current, 0);
                        // When target is 0, percentage is 0, which is <50%, so red
                        return color === 'red';
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return consistent color for same percentage regardless of scale', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
                    fc.float({ min: Math.fround(0.5), max: Math.fround(1.5), noNaN: true }),
                    fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
                    (target1, ratio, scaleFactor) => {
                        const target2 = target1 * scaleFactor;
                        const current1 = target1 * ratio;
                        const current2 = target2 * ratio;

                        const color1 = getProgressColor(current1, target1);
                        const color2 = getProgressColor(current2, target2);

                        // Same ratio should produce same color
                        return color1 === color2;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Boundary values are handled correctly
     */
    describe('Property: Boundary value handling', () => {
        it('should handle boundary at 79-80% correctly', () => {
            // 79% should be yellow, 80% should be green
            const target = 100;

            const color79 = getProgressColor(79, target);
            const color80 = getProgressColor(80, target);

            expect(color79).toBe('yellow');
            expect(color80).toBe('green');
        });

        it('should handle boundary at 100-101% correctly', () => {
            // 100% should be green, 101% should be yellow
            const target = 100;

            const color100 = getProgressColor(100, target);
            const color101 = getProgressColor(101, target);

            expect(color100).toBe('green');
            expect(color101).toBe('yellow');
        });

        it('should handle boundary at 49-50% correctly', () => {
            // 49% should be red, 50% should be yellow
            const target = 100;

            const color49 = getProgressColor(49, target);
            const color50 = getProgressColor(50, target);

            expect(color49).toBe('red');
            expect(color50).toBe('yellow');
        });

        it('should handle boundary at 120-121% correctly', () => {
            // 120% should be yellow, 121% should be red
            const target = 100;

            const color120 = getProgressColor(120, target);
            const color121 = getProgressColor(121, target);

            expect(color120).toBe('yellow');
            expect(color121).toBe('red');
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
     * Property: For any current/target where target > 0, percentage = (current / target) * 100
     * The result is rounded to the nearest integer.
     */

    /**
     * **Validates: Requirement 25.5**
     * FOR EACH macro, THE Food_Tracker SHALL display percentage of daily goal achieved
     */
    describe('Property: Percentage equals (current / target) * 100 for positive targets', () => {
        it('should calculate percentage correctly for any positive current and target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const result = getPercentage(current, target);
                        const expected = Math.round((current / target) * 100);

                        return result === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should calculate percentage correctly for exact ratios', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true }),
                    fc.float({ min: Math.fround(0.1), max: Math.fround(5), noNaN: true }),
                    (target, ratio) => {
                        const current = target * ratio;
                        const result = getPercentage(current, target);
                        const expected = Math.round(ratio * 100);

                        return result === expected;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return 100% when current equals target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
                    (value) => {
                        const result = getPercentage(value, value);
                        return result === 100;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return 50% when current is half of target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (target) => {
                        const current = target / 2;
                        const result = getPercentage(current, target);
                        return result === 50;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return 200% when current is double the target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
                    (target) => {
                        const current = target * 2;
                        const result = getPercentage(current, target);
                        return result === 200;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Percentage returns 0 when target is 0 or negative
     */
    describe('Property: Percentage returns 0 for zero or negative target', () => {
        it('should return 0 when target is 0', () => {
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

        it('should return 0 when target is negative', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true }),
                    (current, negativeTarget) => {
                        const result = getPercentage(current, negativeTarget);
                        return result === 0;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Percentage is always a non-negative integer
     */
    describe('Property: Percentage is always a non-negative integer', () => {
        it('should always return a non-negative integer', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const result = getPercentage(current, target);

                        // Result should be a non-negative integer
                        return (
                            Number.isInteger(result) &&
                            result >= 0
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should return 0 for zero current with positive target', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
                    (target) => {
                        const result = getPercentage(0, target);
                        return result === 0;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Percentage scales linearly with current value
     */
    describe('Property: Percentage scales linearly with current value', () => {
        it('should double percentage when current doubles', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(1000), noNaN: true }),
                    fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true }),
                    (current, target) => {
                        // Ensure current * 2 doesn't cause overflow issues
                        if (current * 2 > 10000) return true;

                        const percentage1 = getPercentage(current, target);
                        const percentage2 = getPercentage(current * 2, target);

                        // Due to rounding, allow for small differences
                        // percentage2 should be approximately 2 * percentage1
                        const expectedDouble = Math.round((current * 2 / target) * 100);

                        return percentage2 === expectedDouble;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should halve percentage when target doubles', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
                    fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
                    (current, target) => {
                        const percentage1 = getPercentage(current, target);
                        const percentage2 = getPercentage(current, target * 2);

                        // Due to rounding, verify against expected formula
                        const expected1 = Math.round((current / target) * 100);
                        const expected2 = Math.round((current / (target * 2)) * 100);

                        return percentage1 === expected1 && percentage2 === expected2;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Percentage is consistent with progress color boundaries
     */
    describe('Property: Percentage consistency with progress color', () => {
        it('should produce percentage that matches progress color logic', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
                    fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
                    (current, target) => {
                        const percentage = getPercentage(current, target);
                        const color = getProgressColor(current, target);

                        // Verify color matches percentage ranges
                        if (percentage >= 80 && percentage <= 100) {
                            return color === 'green';
                        }
                        if ((percentage >= 50 && percentage < 80) || (percentage > 100 && percentage <= 120)) {
                            return color === 'yellow';
                        }
                        if (percentage < 50 || percentage > 120) {
                            return color === 'red';
                        }

                        return true;
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

    /**
     * **Validates: Requirement 25.6**
     * THE Food_Tracker SHALL calculate macro goals based on calorie goal using formula:
     * Protein 30%, Fat 30%, Carbs 40%
     */
    describe('Property: Macro goals follow standard distribution formula', () => {
        it('should calculate protein as (calorieGoal * 0.30) / 4', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
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
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
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
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
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

        it('should calculate all macros correctly in a single call', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(500), max: Math.fround(5000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);

                        const expectedProtein = roundToOneDecimal(
                            (calorieGoal * MACRO_DISTRIBUTION.protein) / CALORIES_PER_GRAM.protein
                        );
                        const expectedFat = roundToOneDecimal(
                            (calorieGoal * MACRO_DISTRIBUTION.fat) / CALORIES_PER_GRAM.fat
                        );
                        const expectedCarbs = roundToOneDecimal(
                            (calorieGoal * MACRO_DISTRIBUTION.carbs) / CALORIES_PER_GRAM.carbs
                        );

                        return (
                            result.protein === expectedProtein &&
                            result.fat === expectedFat &&
                            result.carbs === expectedCarbs
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Macro distribution constants are correct
     */
    describe('Property: Macro distribution constants', () => {
        it('should have protein distribution of 30%', () => {
            expect(MACRO_DISTRIBUTION.protein).toBe(0.30);
        });

        it('should have fat distribution of 30%', () => {
            expect(MACRO_DISTRIBUTION.fat).toBe(0.30);
        });

        it('should have carbs distribution of 40%', () => {
            expect(MACRO_DISTRIBUTION.carbs).toBe(0.40);
        });

        it('should have distribution sum equal to 100%', () => {
            const sum = MACRO_DISTRIBUTION.protein + MACRO_DISTRIBUTION.fat + MACRO_DISTRIBUTION.carbs;
            expect(sum).toBe(1.0);
        });

        it('should have protein calories per gram of 4', () => {
            expect(CALORIES_PER_GRAM.protein).toBe(4);
        });

        it('should have fat calories per gram of 9', () => {
            expect(CALORIES_PER_GRAM.fat).toBe(9);
        });

        it('should have carbs calories per gram of 4', () => {
            expect(CALORIES_PER_GRAM.carbs).toBe(4);
        });
    });

    /**
     * Property: Zero calorie goal returns zeros
     */
    describe('Property: Zero calorie goal returns zeros', () => {
        it('should return all zeros for zero calorie goal', () => {
            const result = calculateMacroGoals(0);

            expect(result.protein).toBe(0);
            expect(result.fat).toBe(0);
            expect(result.carbs).toBe(0);
        });
    });

    /**
     * Property: Negative calorie goal returns zeros
     */
    describe('Property: Negative calorie goal returns zeros', () => {
        it('should return all zeros for any negative calorie goal', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);

                        return (
                            result.protein === 0 &&
                            result.fat === 0 &&
                            result.carbs === 0
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Macro goals are always non-negative
     */
    describe('Property: Macro goals are always non-negative', () => {
        it('should always return non-negative macro values for any input', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);

                        return (
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
     * Property: Macro goals scale linearly with calorie goal
     */
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

        it('should halve macro goals when calorie goal halves', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(1000), max: Math.fround(5000), noNaN: true }),
                    (baseCalories) => {
                        const baseResult = calculateMacroGoals(baseCalories);
                        const halfResult = calculateMacroGoals(baseCalories / 2);

                        // Allow for rounding differences
                        const tolerance = 0.2;

                        const proteinRatio = baseResult.protein > 0
                            ? halfResult.protein / baseResult.protein
                            : 0.5;
                        const fatRatio = baseResult.fat > 0
                            ? halfResult.fat / baseResult.fat
                            : 0.5;
                        const carbsRatio = baseResult.carbs > 0
                            ? halfResult.carbs / baseResult.carbs
                            : 0.5;

                        return (
                            Math.abs(proteinRatio - 0.5) < tolerance &&
                            Math.abs(fatRatio - 0.5) < tolerance &&
                            Math.abs(carbsRatio - 0.5) < tolerance
                        );
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Results are rounded to one decimal place
     */
    describe('Property: Results are rounded to one decimal place', () => {
        it('should round all macro values to one decimal place', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);

                        // Check that each value has at most one decimal place
                        const hasOneDecimal = (value: number): boolean => {
                            const rounded = Math.round(value * 10) / 10;
                            return Math.abs(value - rounded) < 0.0001;
                        };

                        return (
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
     * Property: Specific calorie goal examples
     */
    describe('Property: Specific calorie goal examples', () => {
        it('should calculate correct macros for 2000 calorie goal', () => {
            const result = calculateMacroGoals(2000);

            // Protein: (2000 * 0.30) / 4 = 150g
            expect(result.protein).toBe(150);
            // Fat: (2000 * 0.30) / 9 = 66.7g (rounded)
            expect(result.fat).toBe(66.7);
            // Carbs: (2000 * 0.40) / 4 = 200g
            expect(result.carbs).toBe(200);
        });

        it('should calculate correct macros for 1500 calorie goal', () => {
            const result = calculateMacroGoals(1500);

            // Protein: (1500 * 0.30) / 4 = 112.5g
            expect(result.protein).toBe(112.5);
            // Fat: (1500 * 0.30) / 9 = 50g
            expect(result.fat).toBe(50);
            // Carbs: (1500 * 0.40) / 4 = 150g
            expect(result.carbs).toBe(150);
        });

        it('should calculate correct macros for 2500 calorie goal', () => {
            const result = calculateMacroGoals(2500);

            // Protein: (2500 * 0.30) / 4 = 187.5g
            expect(result.protein).toBe(187.5);
            // Fat: (2500 * 0.30) / 9 = 83.3g (rounded)
            expect(result.fat).toBe(83.3);
            // Carbs: (2500 * 0.40) / 4 = 250g
            expect(result.carbs).toBe(250);
        });
    });

    /**
     * Property: Fat is always less than protein and carbs for same calorie goal
     * (because fat has 9 cal/g vs 4 cal/g for protein and carbs)
     */
    describe('Property: Fat grams are less than protein and carbs grams', () => {
        it('should have fat grams less than protein grams for positive calorie goals', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);

                        // Fat has same percentage as protein (30%) but 9 cal/g vs 4 cal/g
                        // So fat grams should be less than protein grams
                        return result.fat < result.protein;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });

        it('should have fat grams less than carbs grams for positive calorie goals', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);

                        // Fat has 30% at 9 cal/g, carbs has 40% at 4 cal/g
                        // So fat grams should be less than carbs grams
                        return result.fat < result.carbs;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });

    /**
     * Property: Carbs are always greater than protein
     * (because carbs has 40% vs protein 30%, both at 4 cal/g)
     */
    describe('Property: Carbs grams are greater than protein grams', () => {
        it('should have carbs grams greater than protein grams for positive calorie goals', () => {
            fc.assert(
                fc.property(
                    fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
                    (calorieGoal) => {
                        const result = calculateMacroGoals(calorieGoal);

                        // Carbs has 40% at 4 cal/g, protein has 30% at 4 cal/g
                        // So carbs grams should be greater than protein grams
                        return result.carbs > result.protein;
                    }
                ),
                PROPERTY_TEST_CONFIG
            );
        });
    });
});
