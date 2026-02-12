/**
 * SearchTab Property-Based Tests
 *
 * Property tests for search results display.
 *
 * **Property 7: Search Results Display**
 * For any result, display includes name, serving size, and calories.
 * **Validates: Requirements 5.3**
 *
 * @module food-tracker/components/__tests__/SearchTab.property.test
 */

import React from 'react';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import { SearchTab } from '../SearchTab';
import type { FoodItem, KBZHU, FoodSource } from '../../types';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate valid KBZHU values (integers to avoid floating point issues)
 */
const kbzhuGenerator = (): fc.Arbitrary<KBZHU> =>
    fc.record({
        calories: fc.integer({ min: 10, max: 900 }),
        protein: fc.integer({ min: 1, max: 50 }),
        fat: fc.integer({ min: 1, max: 50 }),
        carbs: fc.integer({ min: 1, max: 50 }),
    });

/**
 * Generate valid food source
 */
const foodSourceGenerator = (): fc.Arbitrary<FoodSource> =>
    fc.constantFrom('database', 'usda', 'openfoodfacts', 'user');

/**
 * Generate valid serving unit
 */
const servingUnitGenerator = (): fc.Arbitrary<string> =>
    fc.constantFrom('г', 'мл', 'шт', 'порция');

/**
 * Generate a clean food name (no trailing/leading spaces, no multiple spaces)
 */
const foodNameGenerator = (): fc.Arbitrary<string> =>
    fc.tuple(
        fc.constantFrom('Яблоко', 'Банан', 'Курица', 'Рис', 'Гречка', 'Творог', 'Молоко', 'Хлеб', 'Сыр', 'Яйцо'),
        fc.integer({ min: 1, max: 100 })
    ).map(([base, num]) => `${base} ${num}`);

/**
 * Generate a unique food item with index-based ID
 */
const foodItemGenerator = (index: number): fc.Arbitrary<FoodItem> =>
    fc.record({
        id: fc.constant(`food-item-${index}-${Math.random().toString(36).slice(2)}`),
        name: foodNameGenerator(),
        brand: fc.constant(undefined),
        category: fc.constantFrom('Фрукты', 'Овощи', 'Мясо', 'Молочные'),
        servingSize: fc.integer({ min: 50, max: 500 }),
        servingUnit: servingUnitGenerator(),
        nutritionPer100: kbzhuGenerator(),
        barcode: fc.constant(undefined),
        source: foodSourceGenerator(),
        verified: fc.boolean(),
        additionalNutrients: fc.constant(undefined),
    });

/**
 * Generate array of food items with unique IDs and names
 */
const uniqueFoodItemsGenerator = (count: number): fc.Arbitrary<FoodItem[]> =>
    fc.tuple(
        ...Array.from({ length: count }, (_, i) => foodItemGenerator(i))
    ).map(items => {
        // Ensure unique names by using index
        return items.map((item, idx) => ({
            ...item,
            name: `${item.name.split(' ')[0]} ${idx + 1}`,
        }));
    });

// ============================================================================
// Property Tests
// ============================================================================

describe('SearchTab Property Tests', () => {
    afterEach(() => {
        cleanup();
    });

    /**
     * Property 7: Search Results Display
     *
     * For any result, display includes name, serving size, and calories.
     * **Validates: Requirements 5.3**
     */
    describe('Property 7: Search Results Display', () => {
        it('displays name for each food item in recent foods', () => {
            fc.assert(
                fc.property(uniqueFoodItemsGenerator(2), (foods) => {
                    cleanup();
                    render(
                        <SearchTab
                            onSelectFood={jest.fn()}
                            recentFoods={foods}
                        />
                    );

                    // Each food name should be displayed
                    for (const food of foods) {
                        expect(screen.getByText(food.name)).toBeInTheDocument();
                    }

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('displays serving size with unit for each food item', () => {
            fc.assert(
                fc.property(uniqueFoodItemsGenerator(2), (foods) => {
                    cleanup();
                    render(
                        <SearchTab
                            onSelectFood={jest.fn()}
                            recentFoods={foods}
                        />
                    );

                    // Each food should show serving info - use getAllByText since values might match
                    for (const food of foods) {
                        const servingText = `${food.servingSize} ${food.servingUnit}`;
                        const elements = screen.getAllByText(servingText);
                        expect(elements.length).toBeGreaterThanOrEqual(1);
                    }

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('displays calories in ккал format for each food item', () => {
            fc.assert(
                fc.property(uniqueFoodItemsGenerator(2), (foods) => {
                    cleanup();
                    render(
                        <SearchTab
                            onSelectFood={jest.fn()}
                            recentFoods={foods}
                        />
                    );

                    // Each food should show calories - use getAllByText since values might match
                    for (const food of foods) {
                        const caloriesText = `${Math.round(food.nutritionPer100.calories)} ккал`;
                        const elements = screen.getAllByText(caloriesText);
                        expect(elements.length).toBeGreaterThanOrEqual(1);
                    }

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('has accessible aria-label with name, serving, and calories', () => {
            fc.assert(
                fc.property(uniqueFoodItemsGenerator(2), (foods) => {
                    cleanup();
                    render(
                        <SearchTab
                            onSelectFood={jest.fn()}
                            recentFoods={foods}
                        />
                    );

                    // Each food item should have accessible label
                    for (const food of foods) {
                        const servingText = `${food.servingSize} ${food.servingUnit}`;
                        const caloriesText = `${Math.round(food.nutritionPer100.calories)} ккал`;
                        const expectedLabel = `${food.name}, ${servingText}, ${caloriesText}`;

                        expect(screen.getByRole('option', { name: expectedLabel })).toBeInTheDocument();
                    }

                    return true;
                }),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Additional property: Popular foods display
     */
    describe('Property: Popular Foods Display', () => {
        it('displays all popular foods with complete information', () => {
            fc.assert(
                fc.property(uniqueFoodItemsGenerator(2), (foods) => {
                    cleanup();
                    render(
                        <SearchTab
                            onSelectFood={jest.fn()}
                            popularFoods={foods}
                        />
                    );

                    // Each food should be displayed with all info
                    for (const food of foods) {
                        // Check name is displayed
                        expect(screen.getByText(food.name)).toBeInTheDocument();

                        // Check serving info (use getAllByText for potential duplicates)
                        const servingText = `${food.servingSize} ${food.servingUnit}`;
                        expect(screen.getAllByText(servingText).length).toBeGreaterThanOrEqual(1);

                        // Check calories (use getAllByText for potential duplicates)
                        const caloriesText = `${Math.round(food.nutritionPer100.calories)} ккал`;
                        expect(screen.getAllByText(caloriesText).length).toBeGreaterThanOrEqual(1);
                    }

                    return true;
                }),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Additional property: Food selection callback
     */
    describe('Property: Food Selection', () => {
        it('calls onSelectFood with correct food item when clicked', async () => {
            const user = userEvent.setup();

            await fc.assert(
                fc.asyncProperty(uniqueFoodItemsGenerator(2), async (foods) => {
                    cleanup();
                    const onSelectFood = jest.fn();

                    render(
                        <SearchTab
                            onSelectFood={onSelectFood}
                            recentFoods={foods}
                        />
                    );

                    // Click on first food item
                    const firstFood = foods[0];
                    const servingText = `${firstFood.servingSize} ${firstFood.servingUnit}`;
                    const caloriesText = `${Math.round(firstFood.nutritionPer100.calories)} ккал`;
                    const expectedLabel = `${firstFood.name}, ${servingText}, ${caloriesText}`;

                    const foodItem = screen.getByRole('option', { name: expectedLabel });
                    await user.click(foodItem);

                    // Callback should be called with the food item
                    expect(onSelectFood).toHaveBeenCalledTimes(1);
                    expect(onSelectFood).toHaveBeenCalledWith(firstFood);

                    return true;
                }),
                { numRuns: 20 }
            );
        });
    });

    /**
     * Property: Search input displays correctly
     */
    describe('Property: Search Input', () => {
        it('renders search input with correct placeholder', () => {
            fc.assert(
                fc.property(uniqueFoodItemsGenerator(1), (foods) => {
                    cleanup();
                    render(
                        <SearchTab
                            onSelectFood={jest.fn()}
                            recentFoods={foods}
                        />
                    );

                    const input = screen.getByRole('textbox', { name: /поиск/i });
                    expect(input).toBeInTheDocument();
                    expect(input).toHaveAttribute('placeholder', 'Поиск блюд и продуктов');

                    return true;
                }),
                { numRuns: 20 }
            );
        });
    });

    /**
     * Property: List structure is correct
     */
    describe('Property: List Structure', () => {
        it('renders food items in a listbox with correct roles', () => {
            fc.assert(
                fc.property(uniqueFoodItemsGenerator(2), (foods) => {
                    cleanup();
                    render(
                        <SearchTab
                            onSelectFood={jest.fn()}
                            recentFoods={foods}
                        />
                    );

                    // Should have a listbox
                    const listbox = screen.getByRole('listbox', { name: /список продуктов/i });
                    expect(listbox).toBeInTheDocument();

                    // Should have correct number of options
                    const options = within(listbox).getAllByRole('option');
                    expect(options).toHaveLength(foods.length);

                    return true;
                }),
                { numRuns: 30 }
            );
        });
    });
});
