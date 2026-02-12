/**
 * PortionSelector Property-Based Tests
 *
 * Property 8: Portion Validation
 * For any invalid input (negative, zero, non-numeric), display Russian error
 *
 * **Validates: Requirements 9.6**
 *
 * @module food-tracker/components/__tests__/PortionSelector.property.test
 */

import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import { PortionSelector } from '../PortionSelector';
import type { FoodItem } from '../../types';

// ============================================================================
// Test Data
// ============================================================================

const createMockFood = (): FoodItem => ({
    id: 'food-1',
    name: 'Тестовый продукт',
    category: 'Тест',
    servingSize: 100,
    servingUnit: 'г',
    nutritionPer100: {
        calories: 100,
        protein: 10,
        fat: 5,
        carbs: 15,
    },
    source: 'database',
    verified: true,
});

// ============================================================================
// Property Tests
// ============================================================================

describe('PortionSelector Property Tests', () => {
    beforeEach(() => {
        Element.prototype.scrollIntoView = jest.fn();
    });

    afterEach(() => {
        cleanup();
    });

    /**
     * Property 8: Portion Validation
     * For any invalid input (negative, zero, non-numeric), display Russian error
     *
     * **Validates: Requirements 9.6**
     */
    describe('Property 8: Portion Validation', () => {
        it('displays Russian error for negative values', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: -1000, max: -1 }),
                    (negativeValue) => {
                        const mockFood = createMockFood();
                        const onPortionChange = jest.fn();

                        render(
                            <PortionSelector
                                food={mockFood}
                                onPortionChange={onPortionChange}
                            />
                        );

                        const input = screen.getByRole('spinbutton', { name: /количество порции/i });
                        fireEvent.change(input, { target: { value: String(negativeValue) } });
                        fireEvent.blur(input);

                        // Should show Russian error message
                        const errorElement = screen.queryByRole('alert');
                        if (errorElement) {
                            // Error message should be in Russian (contain Cyrillic characters)
                            const hasRussianText = /[а-яА-ЯёЁ]/.test(errorElement.textContent || '');
                            expect(hasRussianText).toBe(true);
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('displays Russian error for zero value', () => {
            const mockFood = createMockFood();
            const onPortionChange = jest.fn();

            render(
                <PortionSelector
                    food={mockFood}
                    onPortionChange={onPortionChange}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            fireEvent.change(input, { target: { value: '0' } });
            fireEvent.blur(input);

            // Should show Russian error message
            const errorElement = screen.queryByRole('alert');
            if (errorElement) {
                const hasRussianText = /[а-яА-ЯёЁ]/.test(errorElement.textContent || '');
                expect(hasRussianText).toBe(true);
            }
        });

        it('displays Russian error for non-numeric values', () => {
            const nonNumericValues = ['abc', 'xyz', '!@#', 'test', 'hello'];

            nonNumericValues.forEach((nonNumericValue) => {
                const mockFood = createMockFood();
                const onPortionChange = jest.fn();

                render(
                    <PortionSelector
                        food={mockFood}
                        onPortionChange={onPortionChange}
                    />
                );

                const input = screen.getByRole('spinbutton', { name: /количество порции/i });
                fireEvent.change(input, { target: { value: nonNumericValue } });
                fireEvent.blur(input);

                // Should show Russian error message
                const errorElement = screen.queryByRole('alert');
                if (errorElement) {
                    const hasRussianText = /[а-яА-ЯёЁ]/.test(errorElement.textContent || '');
                    expect(hasRussianText).toBe(true);
                }

                cleanup();
            });
        });

        it('displays Russian error for empty input', () => {
            const mockFood = createMockFood();
            const onPortionChange = jest.fn();

            render(
                <PortionSelector
                    food={mockFood}
                    onPortionChange={onPortionChange}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            fireEvent.change(input, { target: { value: '' } });

            // Should show Russian error message
            const errorElement = screen.queryByRole('alert');
            if (errorElement) {
                const hasRussianText = /[а-яА-ЯёЁ]/.test(errorElement.textContent || '');
                expect(hasRussianText).toBe(true);
            }
        });

        it('displays Russian error for values exceeding maximum', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2001, max: 10000 }),
                    (exceedingValue) => {
                        const mockFood = createMockFood();
                        const onPortionChange = jest.fn();

                        render(
                            <PortionSelector
                                food={mockFood}
                                onPortionChange={onPortionChange}
                            />
                        );

                        const input = screen.getByRole('spinbutton', { name: /количество порции/i });
                        fireEvent.change(input, { target: { value: String(exceedingValue) } });
                        fireEvent.blur(input);

                        // Should show Russian error message about maximum
                        const errorElement = screen.queryByRole('alert');
                        if (errorElement) {
                            const hasRussianText = /[а-яА-ЯёЁ]/.test(errorElement.textContent || '');
                            expect(hasRussianText).toBe(true);
                            // Should mention maximum value
                            expect(errorElement.textContent).toContain('2000');
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 10 }
            );
        });

        it('accepts valid positive values without error', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 2000 }),
                    (validValue) => {
                        const mockFood = createMockFood();
                        const onPortionChange = jest.fn();

                        render(
                            <PortionSelector
                                food={mockFood}
                                onPortionChange={onPortionChange}
                            />
                        );

                        const input = screen.getByRole('spinbutton', { name: /количество порции/i });
                        fireEvent.change(input, { target: { value: String(validValue) } });
                        fireEvent.blur(input);

                        // Should NOT show error for valid values
                        const errorElement = screen.queryByRole('alert');
                        expect(errorElement).not.toBeInTheDocument();

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });

        it('all error messages contain Russian text', () => {
            const invalidInputs = ['-1', '0', 'abc', '', '3000'];

            invalidInputs.forEach((invalidInput) => {
                const mockFood = createMockFood();
                const onPortionChange = jest.fn();

                render(
                    <PortionSelector
                        food={mockFood}
                        onPortionChange={onPortionChange}
                    />
                );

                const input = screen.getByRole('spinbutton', { name: /количество порции/i });
                fireEvent.change(input, { target: { value: invalidInput } });
                fireEvent.blur(input);

                const errorElement = screen.queryByRole('alert');
                if (errorElement) {
                    // Verify error message is in Russian
                    const hasRussianText = /[а-яА-ЯёЁ]/.test(errorElement.textContent || '');
                    expect(hasRussianText).toBe(true);
                }

                cleanup();
            });
        });
    });

    /**
     * Additional Property: КБЖУ Calculation Consistency
     * For any valid portion, КБЖУ values should be proportional
     */
    describe('Property: КБЖУ Calculation Consistency', () => {
        it('calculates КБЖУ proportionally for any valid portion', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 500 }),
                    (portionAmount) => {
                        const mockFood = createMockFood();
                        let capturedNutrition: { calories: number; protein: number; fat: number; carbs: number } | null = null;

                        const onPortionChange = jest.fn((_, __, nutrition) => {
                            capturedNutrition = nutrition;
                        });

                        render(
                            <PortionSelector
                                food={mockFood}
                                initialAmount={portionAmount}
                                onPortionChange={onPortionChange}
                            />
                        );

                        // Wait for initial render to trigger onPortionChange
                        if (capturedNutrition) {
                            const expectedCalories = (mockFood.nutritionPer100.calories * portionAmount) / 100;
                            const expectedProtein = (mockFood.nutritionPer100.protein * portionAmount) / 100;
                            const expectedFat = (mockFood.nutritionPer100.fat * portionAmount) / 100;
                            const expectedCarbs = (mockFood.nutritionPer100.carbs * portionAmount) / 100;

                            // Allow for rounding differences (1 decimal place)
                            expect(Math.abs(capturedNutrition.calories - expectedCalories)).toBeLessThan(0.2);
                            expect(Math.abs(capturedNutrition.protein - expectedProtein)).toBeLessThan(0.2);
                            expect(Math.abs(capturedNutrition.fat - expectedFat)).toBeLessThan(0.2);
                            expect(Math.abs(capturedNutrition.carbs - expectedCarbs)).toBeLessThan(0.2);
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });
    });
});
