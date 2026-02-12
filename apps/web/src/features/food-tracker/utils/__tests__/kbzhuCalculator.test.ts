/**
 * Unit Tests for КБЖУ Calculator
 *
 * Tests the КБЖУ calculation utilities including:
 * - calculateKBZHU: Portion-based calculation
 * - calculateFoodKBZHU: Food item calculation
 * - calculateDailyTotals: Sum of entries
 * - getPercentage: Goal percentage calculation
 * - getProgressColor: Color coding for progress
 * - calculateMacroGoals: Macro goals from calorie goal
 * - validatePortionAmount: Portion validation
 *
 * @module food-tracker/utils/__tests__/kbzhuCalculator.test
 */

import {
    calculateKBZHU,
    calculateFoodKBZHU,
    calculateDailyTotals,
    getPercentage,
    getProgressColor,
    calculateMacroGoals,
    validatePortionAmount,
    roundToOneDecimal,
    EMPTY_KBZHU,
    MACRO_DISTRIBUTION,
    CALORIES_PER_GRAM,
} from '../kbzhuCalculator';
import type { KBZHU, FoodItem, FoodEntry } from '../../types';

// ============================================================================
// Test Data
// ============================================================================

const sampleNutritionPer100: KBZHU = {
    calories: 250,
    protein: 20,
    fat: 15,
    carbs: 10,
};

const sampleFoodItem: FoodItem = {
    id: 'test-food-1',
    name: 'Тестовый продукт',
    category: 'Тест',
    servingSize: 100,
    servingUnit: 'г',
    nutritionPer100: sampleNutritionPer100,
    source: 'database',
    verified: true,
};

const createFoodEntry = (nutrition: KBZHU, overrides?: Partial<FoodEntry>): FoodEntry => ({
    id: 'entry-1',
    foodId: 'food-1',
    foodName: 'Тестовый продукт',
    mealType: 'breakfast',
    portionType: 'grams',
    portionAmount: 100,
    nutrition,
    time: '08:00',
    date: '2024-01-15',
    createdAt: '2024-01-15T08:00:00Z',
    updatedAt: '2024-01-15T08:00:00Z',
    ...overrides,
});

// ============================================================================
// roundToOneDecimal Tests
// ============================================================================

describe('roundToOneDecimal', () => {
    it('should round to one decimal place', () => {
        expect(roundToOneDecimal(1.234)).toBe(1.2);
        expect(roundToOneDecimal(1.256)).toBe(1.3);
        expect(roundToOneDecimal(1.25)).toBe(1.3);
    });

    it('should handle whole numbers', () => {
        expect(roundToOneDecimal(5)).toBe(5);
        expect(roundToOneDecimal(100)).toBe(100);
    });

    it('should handle zero', () => {
        expect(roundToOneDecimal(0)).toBe(0);
    });

    it('should handle negative numbers', () => {
        expect(roundToOneDecimal(-1.234)).toBe(-1.2);
        expect(roundToOneDecimal(-1.256)).toBe(-1.3);
    });
});

// ============================================================================
// calculateKBZHU Tests
// ============================================================================

describe('calculateKBZHU', () => {
    describe('valid inputs', () => {
        it('should calculate КБЖУ for 100g portion (same as per 100)', () => {
            const result = calculateKBZHU(sampleNutritionPer100, 100);
            expect(result.calories).toBe(250);
            expect(result.protein).toBe(20);
            expect(result.fat).toBe(15);
            expect(result.carbs).toBe(10);
        });

        it('should calculate КБЖУ for 50g portion (half)', () => {
            const result = calculateKBZHU(sampleNutritionPer100, 50);
            expect(result.calories).toBe(125);
            expect(result.protein).toBe(10);
            expect(result.fat).toBe(7.5);
            expect(result.carbs).toBe(5);
        });

        it('should calculate КБЖУ for 150g portion', () => {
            const result = calculateKBZHU(sampleNutritionPer100, 150);
            expect(result.calories).toBe(375);
            expect(result.protein).toBe(30);
            expect(result.fat).toBe(22.5);
            expect(result.carbs).toBe(15);
        });

        it('should calculate КБЖУ for small portion (10g)', () => {
            const result = calculateKBZHU(sampleNutritionPer100, 10);
            expect(result.calories).toBe(25);
            expect(result.protein).toBe(2);
            expect(result.fat).toBe(1.5);
            expect(result.carbs).toBe(1);
        });

        it('should calculate КБЖУ for large portion (500g)', () => {
            const result = calculateKBZHU(sampleNutritionPer100, 500);
            expect(result.calories).toBe(1250);
            expect(result.protein).toBe(100);
            expect(result.fat).toBe(75);
            expect(result.carbs).toBe(50);
        });

        it('should round results to one decimal place', () => {
            const nutrition: KBZHU = { calories: 123, protein: 12.3, fat: 4.56, carbs: 7.89 };
            const result = calculateKBZHU(nutrition, 33);
            // 123 * 33 / 100 = 40.59 → 40.6
            expect(result.calories).toBe(40.6);
            // 12.3 * 33 / 100 = 4.059 → 4.1
            expect(result.protein).toBe(4.1);
        });
    });

    describe('invalid inputs', () => {
        it('should return empty КБЖУ for zero portion', () => {
            const result = calculateKBZHU(sampleNutritionPer100, 0);
            expect(result).toEqual(EMPTY_KBZHU);
        });

        it('should return empty КБЖУ for negative portion', () => {
            const result = calculateKBZHU(sampleNutritionPer100, -50);
            expect(result).toEqual(EMPTY_KBZHU);
        });

        it('should return empty КБЖУ for NaN portion', () => {
            const result = calculateKBZHU(sampleNutritionPer100, NaN);
            expect(result).toEqual(EMPTY_KBZHU);
        });

        it('should return empty КБЖУ for Infinity portion', () => {
            const result = calculateKBZHU(sampleNutritionPer100, Infinity);
            expect(result).toEqual(EMPTY_KBZHU);
        });

        it('should return empty КБЖУ for -Infinity portion', () => {
            const result = calculateKBZHU(sampleNutritionPer100, -Infinity);
            expect(result).toEqual(EMPTY_KBZHU);
        });
    });

    describe('edge cases', () => {
        it('should handle zero nutrition values', () => {
            const zeroNutrition: KBZHU = { calories: 0, protein: 0, fat: 0, carbs: 0 };
            const result = calculateKBZHU(zeroNutrition, 100);
            expect(result).toEqual(EMPTY_KBZHU);
        });

        it('should handle very small portion amounts', () => {
            const result = calculateKBZHU(sampleNutritionPer100, 0.1);
            expect(result.calories).toBe(0.3);
            expect(result.protein).toBe(0);
            expect(result.fat).toBe(0);
            expect(result.carbs).toBe(0);
        });
    });
});

// ============================================================================
// calculateFoodKBZHU Tests
// ============================================================================

describe('calculateFoodKBZHU', () => {
    it('should calculate КБЖУ from food item', () => {
        const result = calculateFoodKBZHU(sampleFoodItem, 100);
        expect(result.calories).toBe(250);
        expect(result.protein).toBe(20);
        expect(result.fat).toBe(15);
        expect(result.carbs).toBe(10);
    });

    it('should calculate КБЖУ for different portion sizes', () => {
        const result = calculateFoodKBZHU(sampleFoodItem, 200);
        expect(result.calories).toBe(500);
        expect(result.protein).toBe(40);
        expect(result.fat).toBe(30);
        expect(result.carbs).toBe(20);
    });
});

// ============================================================================
// calculateDailyTotals Tests
// ============================================================================

describe('calculateDailyTotals', () => {
    it('should return empty КБЖУ for empty array', () => {
        const result = calculateDailyTotals([]);
        expect(result).toEqual(EMPTY_KBZHU);
    });

    it('should return same values for single entry', () => {
        const entry = createFoodEntry({ calories: 250, protein: 20, fat: 15, carbs: 10 });
        const result = calculateDailyTotals([entry]);
        expect(result.calories).toBe(250);
        expect(result.protein).toBe(20);
        expect(result.fat).toBe(15);
        expect(result.carbs).toBe(10);
    });

    it('should sum multiple entries correctly', () => {
        const entries = [
            createFoodEntry({ calories: 250, protein: 20, fat: 15, carbs: 10 }, { id: 'e1' }),
            createFoodEntry({ calories: 300, protein: 25, fat: 10, carbs: 30 }, { id: 'e2' }),
            createFoodEntry({ calories: 150, protein: 10, fat: 5, carbs: 20 }, { id: 'e3' }),
        ];
        const result = calculateDailyTotals(entries);
        expect(result.calories).toBe(700);
        expect(result.protein).toBe(55);
        expect(result.fat).toBe(30);
        expect(result.carbs).toBe(60);
    });

    it('should round totals to one decimal place', () => {
        const entries = [
            createFoodEntry({ calories: 100.33, protein: 10.11, fat: 5.22, carbs: 15.44 }, { id: 'e1' }),
            createFoodEntry({ calories: 100.33, protein: 10.11, fat: 5.22, carbs: 15.44 }, { id: 'e2' }),
        ];
        const result = calculateDailyTotals(entries);
        expect(result.calories).toBe(200.7);
        expect(result.protein).toBe(20.2);
        expect(result.fat).toBe(10.4);
        expect(result.carbs).toBe(30.9);
    });

    it('should handle entries with zero values', () => {
        const entries = [
            createFoodEntry({ calories: 100, protein: 10, fat: 5, carbs: 15 }, { id: 'e1' }),
            createFoodEntry({ calories: 0, protein: 0, fat: 0, carbs: 0 }, { id: 'e2' }),
        ];
        const result = calculateDailyTotals(entries);
        expect(result.calories).toBe(100);
        expect(result.protein).toBe(10);
        expect(result.fat).toBe(5);
        expect(result.carbs).toBe(15);
    });
});

// ============================================================================
// getPercentage Tests
// ============================================================================

describe('getPercentage', () => {
    it('should calculate percentage correctly', () => {
        expect(getPercentage(50, 100)).toBe(50);
        expect(getPercentage(100, 100)).toBe(100);
        expect(getPercentage(75, 100)).toBe(75);
    });

    it('should handle values exceeding target', () => {
        expect(getPercentage(150, 100)).toBe(150);
        expect(getPercentage(200, 100)).toBe(200);
    });

    it('should return 0 for zero target', () => {
        expect(getPercentage(50, 0)).toBe(0);
        expect(getPercentage(0, 0)).toBe(0);
    });

    it('should return 0 for negative target', () => {
        expect(getPercentage(50, -100)).toBe(0);
    });

    it('should handle zero current value', () => {
        expect(getPercentage(0, 100)).toBe(0);
    });

    it('should round to nearest integer', () => {
        expect(getPercentage(33, 100)).toBe(33);
        expect(getPercentage(66.6, 100)).toBe(67);
        expect(getPercentage(33.3, 100)).toBe(33);
    });

    it('should handle decimal targets', () => {
        expect(getPercentage(50, 200)).toBe(25);
        expect(getPercentage(150, 200)).toBe(75);
    });
});

// ============================================================================
// getProgressColor Tests
// ============================================================================

describe('getProgressColor', () => {
    describe('green zone (80-100%)', () => {
        it('should return green for 80%', () => {
            expect(getProgressColor(80, 100)).toBe('green');
        });

        it('should return green for 90%', () => {
            expect(getProgressColor(90, 100)).toBe('green');
        });

        it('should return green for 100%', () => {
            expect(getProgressColor(100, 100)).toBe('green');
        });

        it('should return green for exactly 80%', () => {
            expect(getProgressColor(160, 200)).toBe('green');
        });
    });

    describe('yellow zone (50-79% or 101-120%)', () => {
        it('should return yellow for 50%', () => {
            expect(getProgressColor(50, 100)).toBe('yellow');
        });

        it('should return yellow for 79%', () => {
            expect(getProgressColor(79, 100)).toBe('yellow');
        });

        it('should return yellow for 101%', () => {
            expect(getProgressColor(101, 100)).toBe('yellow');
        });

        it('should return yellow for 120%', () => {
            expect(getProgressColor(120, 100)).toBe('yellow');
        });

        it('should return yellow for 65%', () => {
            expect(getProgressColor(65, 100)).toBe('yellow');
        });

        it('should return yellow for 110%', () => {
            expect(getProgressColor(110, 100)).toBe('yellow');
        });
    });

    describe('red zone (<50% or >120%)', () => {
        it('should return red for 0%', () => {
            expect(getProgressColor(0, 100)).toBe('red');
        });

        it('should return red for 49%', () => {
            expect(getProgressColor(49, 100)).toBe('red');
        });

        it('should return red for 121%', () => {
            expect(getProgressColor(121, 100)).toBe('red');
        });

        it('should return red for 150%', () => {
            expect(getProgressColor(150, 100)).toBe('red');
        });

        it('should return red for 25%', () => {
            expect(getProgressColor(25, 100)).toBe('red');
        });

        it('should return red for 200%', () => {
            expect(getProgressColor(200, 100)).toBe('red');
        });
    });

    describe('edge cases', () => {
        it('should return red for zero target', () => {
            expect(getProgressColor(50, 0)).toBe('red');
        });

        it('should return red for negative target', () => {
            expect(getProgressColor(50, -100)).toBe('red');
        });
    });
});

// ============================================================================
// calculateMacroGoals Tests
// ============================================================================

describe('calculateMacroGoals', () => {
    it('should calculate macro goals for 2000 calorie goal', () => {
        const result = calculateMacroGoals(2000);
        // Protein: (2000 * 0.30) / 4 = 150g
        expect(result.protein).toBe(150);
        // Fat: (2000 * 0.30) / 9 = 66.67g → 66.7g
        expect(result.fat).toBe(66.7);
        // Carbs: (2000 * 0.40) / 4 = 200g
        expect(result.carbs).toBe(200);
    });

    it('should calculate macro goals for 1500 calorie goal', () => {
        const result = calculateMacroGoals(1500);
        // Protein: (1500 * 0.30) / 4 = 112.5g
        expect(result.protein).toBe(112.5);
        // Fat: (1500 * 0.30) / 9 = 50g
        expect(result.fat).toBe(50);
        // Carbs: (1500 * 0.40) / 4 = 150g
        expect(result.carbs).toBe(150);
    });

    it('should calculate macro goals for 2500 calorie goal', () => {
        const result = calculateMacroGoals(2500);
        // Protein: (2500 * 0.30) / 4 = 187.5g
        expect(result.protein).toBe(187.5);
        // Fat: (2500 * 0.30) / 9 = 83.33g → 83.3g
        expect(result.fat).toBe(83.3);
        // Carbs: (2500 * 0.40) / 4 = 250g
        expect(result.carbs).toBe(250);
    });

    it('should return zeros for zero calorie goal', () => {
        const result = calculateMacroGoals(0);
        expect(result.protein).toBe(0);
        expect(result.fat).toBe(0);
        expect(result.carbs).toBe(0);
    });

    it('should return zeros for negative calorie goal', () => {
        const result = calculateMacroGoals(-1000);
        expect(result.protein).toBe(0);
        expect(result.fat).toBe(0);
        expect(result.carbs).toBe(0);
    });

    it('should use correct macro distribution', () => {
        // Verify constants are correct
        expect(MACRO_DISTRIBUTION.protein).toBe(0.30);
        expect(MACRO_DISTRIBUTION.fat).toBe(0.30);
        expect(MACRO_DISTRIBUTION.carbs).toBe(0.40);
    });

    it('should use correct calories per gram', () => {
        // Verify constants are correct
        expect(CALORIES_PER_GRAM.protein).toBe(4);
        expect(CALORIES_PER_GRAM.fat).toBe(9);
        expect(CALORIES_PER_GRAM.carbs).toBe(4);
    });
});

// ============================================================================
// validatePortionAmount Tests
// ============================================================================

describe('validatePortionAmount', () => {
    describe('valid inputs', () => {
        it('should accept positive integers', () => {
            expect(validatePortionAmount(100)).toEqual({ isValid: true });
            expect(validatePortionAmount(1)).toEqual({ isValid: true });
            expect(validatePortionAmount(500)).toEqual({ isValid: true });
        });

        it('should accept positive decimals', () => {
            expect(validatePortionAmount(100.5)).toEqual({ isValid: true });
            expect(validatePortionAmount(0.1)).toEqual({ isValid: true });
            expect(validatePortionAmount(250.75)).toEqual({ isValid: true });
        });
    });

    describe('invalid inputs', () => {
        it('should reject zero', () => {
            const result = validatePortionAmount(0);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть положительным числом');
        });

        it('should reject negative numbers', () => {
            const result = validatePortionAmount(-50);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть положительным числом');
        });

        it('should reject NaN', () => {
            const result = validatePortionAmount(NaN);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть числом');
        });

        it('should reject Infinity', () => {
            const result = validatePortionAmount(Infinity);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть конечным числом');
        });

        it('should reject -Infinity', () => {
            const result = validatePortionAmount(-Infinity);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть конечным числом');
        });

        it('should reject non-number types', () => {
            // @ts-expect-error Testing invalid input
            const result = validatePortionAmount('100');
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть числом');
        });

        it('should reject undefined', () => {
            // @ts-expect-error Testing invalid input
            const result = validatePortionAmount(undefined);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть числом');
        });

        it('should reject null', () => {
            // @ts-expect-error Testing invalid input
            const result = validatePortionAmount(null);
            expect(result.isValid).toBe(false);
            expect(result.error).toBe('Порция должна быть числом');
        });
    });

    describe('Russian error messages', () => {
        it('should return Russian error for non-number', () => {
            // @ts-expect-error Testing invalid input
            const result = validatePortionAmount('abc');
            expect(result.error).toContain('числом');
        });

        it('should return Russian error for infinite', () => {
            const result = validatePortionAmount(Infinity);
            expect(result.error).toContain('конечным');
        });

        it('should return Russian error for non-positive', () => {
            const result = validatePortionAmount(-10);
            expect(result.error).toContain('положительным');
        });
    });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
    describe('EMPTY_KBZHU', () => {
        it('should have all zero values', () => {
            expect(EMPTY_KBZHU.calories).toBe(0);
            expect(EMPTY_KBZHU.protein).toBe(0);
            expect(EMPTY_KBZHU.fat).toBe(0);
            expect(EMPTY_KBZHU.carbs).toBe(0);
        });
    });

    describe('MACRO_DISTRIBUTION', () => {
        it('should sum to 1.0 (100%)', () => {
            const sum = MACRO_DISTRIBUTION.protein + MACRO_DISTRIBUTION.fat + MACRO_DISTRIBUTION.carbs;
            expect(sum).toBe(1.0);
        });
    });
});
