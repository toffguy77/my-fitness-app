/**
 * Unit tests for useKBZHUCalculator hook
 */

import { renderHook } from '@testing-library/react';
import { useKBZHUCalculator } from '../useKBZHUCalculator';
import type { KBZHU, FoodItem, FoodEntry, TargetGoals } from '../../types';

describe('useKBZHUCalculator', () => {
    describe('emptyKBZHU', () => {
        it('returns empty КБЖУ values', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.emptyKBZHU).toEqual({
                calories: 0,
                protein: 0,
                fat: 0,
                carbs: 0,
            });
        });
    });

    describe('calculateForPortion', () => {
        it('calculates КБЖУ for 100g portion', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const nutritionPer100: KBZHU = {
                calories: 250,
                protein: 20,
                fat: 15,
                carbs: 10,
            };

            const calculated = result.current.calculateForPortion(nutritionPer100, 100);

            expect(calculated).toEqual({
                calories: 250,
                protein: 20,
                fat: 15,
                carbs: 10,
            });
        });

        it('calculates КБЖУ for 150g portion', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const nutritionPer100: KBZHU = {
                calories: 250,
                protein: 20,
                fat: 15,
                carbs: 10,
            };

            const calculated = result.current.calculateForPortion(nutritionPer100, 150);

            expect(calculated).toEqual({
                calories: 375,
                protein: 30,
                fat: 22.5,
                carbs: 15,
            });
        });

        it('calculates КБЖУ for 50g portion', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const nutritionPer100: KBZHU = {
                calories: 250,
                protein: 20,
                fat: 15,
                carbs: 10,
            };

            const calculated = result.current.calculateForPortion(nutritionPer100, 50);

            expect(calculated).toEqual({
                calories: 125,
                protein: 10,
                fat: 7.5,
                carbs: 5,
            });
        });

        it('returns empty КБЖУ for zero portion', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const nutritionPer100: KBZHU = {
                calories: 250,
                protein: 20,
                fat: 15,
                carbs: 10,
            };

            const calculated = result.current.calculateForPortion(nutritionPer100, 0);

            expect(calculated).toEqual({
                calories: 0,
                protein: 0,
                fat: 0,
                carbs: 0,
            });
        });

        it('returns empty КБЖУ for negative portion', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const nutritionPer100: KBZHU = {
                calories: 250,
                protein: 20,
                fat: 15,
                carbs: 10,
            };

            const calculated = result.current.calculateForPortion(nutritionPer100, -50);

            expect(calculated).toEqual({
                calories: 0,
                protein: 0,
                fat: 0,
                carbs: 0,
            });
        });
    });

    describe('calculateForFood', () => {
        it('calculates КБЖУ for food item', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const food: FoodItem = {
                id: '1',
                name: 'Яблоко',
                category: 'Фрукты',
                servingSize: 100,
                servingUnit: 'г',
                nutritionPer100: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
                source: 'database',
                verified: true,
            };

            const calculated = result.current.calculateForFood(food, 200);

            expect(calculated).toEqual({
                calories: 104,
                protein: 0.6,
                fat: 0.4,
                carbs: 28,
            });
        });
    });

    describe('calculateTotals', () => {
        it('calculates daily totals from entries', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const entries: FoodEntry[] = [
                {
                    id: '1',
                    foodId: 'food-1',
                    foodName: 'Овсянка',
                    mealType: 'breakfast',
                    portionType: 'grams',
                    portionAmount: 100,
                    nutrition: { calories: 350, protein: 12, fat: 6, carbs: 60 },
                    time: '08:00',
                    date: '2024-01-15',
                    createdAt: '2024-01-15T08:00:00Z',
                    updatedAt: '2024-01-15T08:00:00Z',
                },
                {
                    id: '2',
                    foodId: 'food-2',
                    foodName: 'Яблоко',
                    mealType: 'snack',
                    portionType: 'grams',
                    portionAmount: 150,
                    nutrition: { calories: 78, protein: 0.5, fat: 0.3, carbs: 21 },
                    time: '15:00',
                    date: '2024-01-15',
                    createdAt: '2024-01-15T15:00:00Z',
                    updatedAt: '2024-01-15T15:00:00Z',
                },
            ];

            const totals = result.current.calculateTotals(entries);

            expect(totals).toEqual({
                calories: 428,
                protein: 12.5,
                fat: 6.3,
                carbs: 81,
            });
        });

        it('returns empty КБЖУ for empty entries', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const totals = result.current.calculateTotals([]);

            expect(totals).toEqual({
                calories: 0,
                protein: 0,
                fat: 0,
                carbs: 0,
            });
        });
    });

    describe('getColor', () => {
        it('returns green for 80-100%', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getColor(80, 100)).toBe('green');
            expect(result.current.getColor(90, 100)).toBe('green');
            expect(result.current.getColor(100, 100)).toBe('green');
        });

        it('returns yellow for 50-79%', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getColor(50, 100)).toBe('yellow');
            expect(result.current.getColor(65, 100)).toBe('yellow');
            expect(result.current.getColor(79, 100)).toBe('yellow');
        });

        it('returns yellow for 101-120%', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getColor(101, 100)).toBe('yellow');
            expect(result.current.getColor(110, 100)).toBe('yellow');
            expect(result.current.getColor(120, 100)).toBe('yellow');
        });

        it('returns red for below 50%', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getColor(0, 100)).toBe('red');
            expect(result.current.getColor(25, 100)).toBe('red');
            expect(result.current.getColor(49, 100)).toBe('red');
        });

        it('returns red for above 120%', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getColor(121, 100)).toBe('red');
            expect(result.current.getColor(150, 100)).toBe('red');
            expect(result.current.getColor(200, 100)).toBe('red');
        });
    });

    describe('getPercent', () => {
        it('calculates percentage correctly', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getPercent(50, 100)).toBe(50);
            expect(result.current.getPercent(75, 100)).toBe(75);
            expect(result.current.getPercent(100, 100)).toBe(100);
            expect(result.current.getPercent(150, 100)).toBe(150);
        });

        it('returns 0 for zero target', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getPercent(50, 0)).toBe(0);
        });

        it('returns 0 for negative target', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.getPercent(50, -100)).toBe(0);
        });
    });

    describe('getMacroGoals', () => {
        it('calculates macro goals from calorie goal', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const goals = result.current.getMacroGoals(2000);

            // Protein: (2000 * 0.30) / 4 = 150
            // Fat: (2000 * 0.30) / 9 = 66.67
            // Carbs: (2000 * 0.40) / 4 = 200
            expect(goals.protein).toBe(150);
            expect(goals.fat).toBeCloseTo(66.7, 1);
            expect(goals.carbs).toBe(200);
        });

        it('returns zeros for zero calorie goal', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const goals = result.current.getMacroGoals(0);

            expect(goals).toEqual({ protein: 0, fat: 0, carbs: 0 });
        });

        it('returns zeros for negative calorie goal', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const goals = result.current.getMacroGoals(-1000);

            expect(goals).toEqual({ protein: 0, fat: 0, carbs: 0 });
        });
    });

    describe('validatePortion', () => {
        it('returns valid for positive number', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const validation = result.current.validatePortion(100);

            expect(validation.isValid).toBe(true);
            expect(validation.error).toBeUndefined();
        });

        it('returns invalid with Russian error for zero', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const validation = result.current.validatePortion(0);

            expect(validation.isValid).toBe(false);
            expect(validation.error).toContain('положительным');
        });

        it('returns invalid with Russian error for negative', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const validation = result.current.validatePortion(-50);

            expect(validation.isValid).toBe(false);
            expect(validation.error).toContain('положительным');
        });

        it('returns invalid with Russian error for NaN', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const validation = result.current.validatePortion(NaN);

            expect(validation.isValid).toBe(false);
            expect(validation.error).toContain('числом');
        });

        it('returns invalid with Russian error for Infinity', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const validation = result.current.validatePortion(Infinity);

            expect(validation.isValid).toBe(false);
            expect(validation.error).toContain('конечным');
        });
    });

    describe('getProgress', () => {
        it('returns progress info for all macros', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const current: KBZHU = {
                calories: 1500,
                protein: 100,
                fat: 50,
                carbs: 150,
            };

            const targets: TargetGoals = {
                calories: 2000,
                protein: 150,
                fat: 67,
                carbs: 200,
                isCustom: false,
            };

            const progress = result.current.getProgress(current, targets);

            expect(progress.calories.current).toBe(1500);
            expect(progress.calories.target).toBe(2000);
            expect(progress.calories.percentage).toBe(75);
            expect(progress.calories.color).toBe('yellow');
            expect(progress.calories.isExceeded).toBe(false);

            expect(progress.protein.percentage).toBe(67);
            expect(progress.fat.percentage).toBe(75);
            expect(progress.carbs.percentage).toBe(75);
        });

        it('marks exceeded when over 100%', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            const current: KBZHU = {
                calories: 2500,
                protein: 100,
                fat: 50,
                carbs: 150,
            };

            const targets: TargetGoals = {
                calories: 2000,
                protein: 150,
                fat: 67,
                carbs: 200,
                isCustom: false,
            };

            const progress = result.current.getProgress(current, targets);

            expect(progress.calories.isExceeded).toBe(true);
        });
    });

    describe('formatValue', () => {
        it('formats value with default 1 decimal', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.formatValue(123.456)).toBe('123.5');
        });

        it('formats value with specified decimals', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.formatValue(123.456, 2)).toBe('123.46');
        });

        it('removes trailing .0', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.formatValue(100.0)).toBe('100');
        });

        it('returns 0 for non-finite values', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.formatValue(NaN)).toBe('0');
            expect(result.current.formatValue(Infinity)).toBe('0');
        });
    });

    describe('formatProgress', () => {
        it('formats progress as "current / target"', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.formatProgress(75, 100)).toBe('75 / 100');
        });

        it('formats progress with unit', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.formatProgress(75, 100, 'г')).toBe('75 / 100 г');
        });

        it('formats decimal values', () => {
            const { result } = renderHook(() => useKBZHUCalculator());

            expect(result.current.formatProgress(75.5, 100.0)).toBe('75.5 / 100');
        });
    });
});
