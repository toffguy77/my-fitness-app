/**
 * FoodEntryItem Property-Based Tests
 *
 * Property tests for food entry display completeness.
 *
 * **Property 6: Food Entry Display Completeness**
 * For any entry, display includes name, portion size with unit, and calories.
 * **Validates: Requirements 3.4, 3.5**
 *
 * @module food-tracker/components/__tests__/FoodEntryItem.property.test
 */

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { FoodEntryItem } from '../FoodEntryItem';
import type { FoodEntry, MealType, PortionType, KBZHU } from '../../types';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate valid KBZHU values
 */
const kbzhuGenerator = (): fc.Arbitrary<KBZHU> =>
    fc.record({
        calories: fc.float({ min: 0, max: 5000, noNaN: true }),
        protein: fc.float({ min: 0, max: 500, noNaN: true }),
        fat: fc.float({ min: 0, max: 500, noNaN: true }),
        carbs: fc.float({ min: 0, max: 500, noNaN: true }),
    });

/**
 * Generate valid meal types
 */
const mealTypeGenerator = (): fc.Arbitrary<MealType> =>
    fc.constantFrom('breakfast', 'lunch', 'dinner', 'snack');

/**
 * Generate valid portion types
 */
const portionTypeGenerator = (): fc.Arbitrary<PortionType> =>
    fc.constantFrom('grams', 'milliliters', 'portion');

/**
 * Generate valid time string (HH:mm format)
 */
const timeGenerator = (): fc.Arbitrary<string> =>
    fc.tuple(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 })
    ).map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

/**
 * Generate valid date string (YYYY-MM-DD format)
 */
const dateGenerator = (): fc.Arbitrary<string> =>
    fc.tuple(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 })
    ).map(([y, m, d]) =>
        `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
    );

/**
 * Generate valid ISO date string
 */
const isoDateGenerator = (): fc.Arbitrary<string> =>
    dateGenerator().map(d => `${d}T00:00:00.000Z`);

/**
 * Generate valid food entry
 */
const foodEntryGenerator = (): fc.Arbitrary<FoodEntry> =>
    fc.record({
        id: fc.uuid(),
        foodId: fc.uuid(),
        foodName: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        mealType: mealTypeGenerator(),
        portionType: portionTypeGenerator(),
        portionAmount: fc.float({ min: 1, max: 2000, noNaN: true }),
        nutrition: kbzhuGenerator(),
        time: timeGenerator(),
        date: dateGenerator(),
        createdAt: isoDateGenerator(),
        updatedAt: isoDateGenerator(),
    });

// ============================================================================
// Property Tests
// ============================================================================

describe('FoodEntryItem Property Tests', () => {
    // Clean up after each test
    afterEach(() => {
        cleanup();
    });

    /**
     * Property 6: Food Entry Display Completeness
     *
     * For any entry, display includes name, portion size with unit, and calories.
     * **Validates: Requirements 3.4, 3.5**
     */
    describe('Property 6: Food Entry Display Completeness', () => {
        it('always displays food name for any valid entry', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry) => {
                    cleanup(); // Clean up before each iteration
                    const { container } = render(<FoodEntryItem entry={entry} />);

                    // Food name should be displayed
                    const nameElement = container.querySelector('.text-gray-900');
                    expect(nameElement).toBeInTheDocument();
                    expect(nameElement?.textContent).toContain(entry.foodName);

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('always displays portion size with correct unit for any valid entry', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry) => {
                    cleanup(); // Clean up before each iteration
                    render(<FoodEntryItem entry={entry} />);

                    // Get expected unit
                    const expectedUnit =
                        entry.portionType === 'grams' ? 'г' :
                            entry.portionType === 'milliliters' ? 'мл' : 'порц.';

                    // Portion should be displayed with unit
                    const portionText = `${Math.round(entry.portionAmount)} ${expectedUnit}`;
                    expect(screen.getByText(portionText)).toBeInTheDocument();

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('always displays calories in ккал format for any valid entry', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry) => {
                    cleanup(); // Clean up before each iteration
                    render(<FoodEntryItem entry={entry} />);

                    // Calories should be displayed with ккал unit
                    const caloriesText = `${Math.round(entry.nutrition.calories)} ккал`;
                    expect(screen.getByText(caloriesText)).toBeInTheDocument();

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('has accessible aria-label containing name, portion, and calories', () => {
            fc.assert(
                fc.property(foodEntryGenerator(), (entry) => {
                    cleanup(); // Clean up before each iteration
                    render(<FoodEntryItem entry={entry} />);

                    // Get expected values
                    const expectedUnit =
                        entry.portionType === 'grams' ? 'г' :
                            entry.portionType === 'milliliters' ? 'мл' : 'порц.';
                    const portionText = `${Math.round(entry.portionAmount)} ${expectedUnit}`;
                    const caloriesText = `${Math.round(entry.nutrition.calories)} ккал`;

                    // Find element with aria-label
                    const element = screen.getByRole('button');
                    const ariaLabel = element.getAttribute('aria-label');

                    expect(ariaLabel).toContain(entry.foodName);
                    expect(ariaLabel).toContain(portionText);
                    expect(ariaLabel).toContain(caloriesText);

                    return true;
                }),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Additional property: Portion unit mapping is consistent
     */
    describe('Property: Portion Unit Mapping', () => {
        it('maps grams to г consistently', () => {
            fc.assert(
                fc.property(
                    foodEntryGenerator().map(e => ({ ...e, portionType: 'grams' as PortionType })),
                    (entry) => {
                        cleanup(); // Clean up before each iteration
                        render(<FoodEntryItem entry={entry} />);
                        expect(screen.getByText(/\d+ г/)).toBeInTheDocument();
                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });

        it('maps milliliters to мл consistently', () => {
            fc.assert(
                fc.property(
                    foodEntryGenerator().map(e => ({ ...e, portionType: 'milliliters' as PortionType })),
                    (entry) => {
                        cleanup(); // Clean up before each iteration
                        render(<FoodEntryItem entry={entry} />);
                        expect(screen.getByText(/\d+ мл/)).toBeInTheDocument();
                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });

        it('maps portion to порц. consistently', () => {
            fc.assert(
                fc.property(
                    foodEntryGenerator().map(e => ({ ...e, portionType: 'portion' as PortionType })),
                    (entry) => {
                        cleanup(); // Clean up before each iteration
                        render(<FoodEntryItem entry={entry} />);
                        expect(screen.getByText(/\d+ порц\./)).toBeInTheDocument();
                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });
    });
});
