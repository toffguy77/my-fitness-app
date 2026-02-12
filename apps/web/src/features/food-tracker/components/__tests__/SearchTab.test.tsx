/**
 * SearchTab Unit Tests
 *
 * Tests for the SearchTab component functionality.
 *
 * @module food-tracker/components/__tests__/SearchTab.test
 */

import React from 'react';
import { render, screen, cleanup, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchTab } from '../SearchTab';
import type { FoodItem } from '../../types';

// ============================================================================
// Test Data
// ============================================================================

const createMockFood = (overrides: Partial<FoodItem> = {}): FoodItem => ({
    id: `food-${Math.random().toString(36).slice(2)}`,
    name: 'Яблоко',
    category: 'Фрукты',
    servingSize: 100,
    servingUnit: 'г',
    nutritionPer100: {
        calories: 52,
        protein: 0.3,
        fat: 0.2,
        carbs: 14,
    },
    source: 'database',
    verified: true,
    ...overrides,
});

const mockRecentFoods: FoodItem[] = [
    createMockFood({ id: 'recent-1', name: 'Банан', nutritionPer100: { calories: 89, protein: 1.1, fat: 0.3, carbs: 23 } }),
    createMockFood({ id: 'recent-2', name: 'Творог', nutritionPer100: { calories: 121, protein: 18, fat: 5, carbs: 3 } }),
    createMockFood({ id: 'recent-3', name: 'Гречка', nutritionPer100: { calories: 343, protein: 13, fat: 3, carbs: 68 } }),
];

const mockPopularFoods: FoodItem[] = [
    createMockFood({ id: 'popular-1', name: 'Курица', nutritionPer100: { calories: 165, protein: 31, fat: 4, carbs: 0 } }),
    createMockFood({ id: 'popular-2', name: 'Рис', nutritionPer100: { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 } }),
];

// ============================================================================
// Tests
// ============================================================================

describe('SearchTab', () => {
    afterEach(() => {
        cleanup();
        jest.clearAllMocks();
    });

    describe('Rendering', () => {
        it('renders search input with Russian placeholder', () => {
            render(<SearchTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /поиск/i });
            expect(input).toBeInTheDocument();
            expect(input).toHaveAttribute('placeholder', 'Поиск блюд и продуктов');
        });

        it('renders recent foods section when provided', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    recentFoods={mockRecentFoods}
                />
            );

            expect(screen.getByText('Недавние')).toBeInTheDocument();
            expect(screen.getByText('Банан')).toBeInTheDocument();
            expect(screen.getByText('Творог')).toBeInTheDocument();
            expect(screen.getByText('Гречка')).toBeInTheDocument();
        });

        it('renders popular foods section when provided', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    popularFoods={mockPopularFoods}
                />
            );

            expect(screen.getByText('Популярные')).toBeInTheDocument();
            expect(screen.getByText('Курица')).toBeInTheDocument();
            expect(screen.getByText('Рис')).toBeInTheDocument();
        });

        it('renders both recent and popular sections', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    recentFoods={mockRecentFoods}
                    popularFoods={mockPopularFoods}
                />
            );

            expect(screen.getByText('Недавние')).toBeInTheDocument();
            expect(screen.getByText('Популярные')).toBeInTheDocument();
        });

        it('renders food items with serving size and calories', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    recentFoods={[mockRecentFoods[0]]}
                />
            );

            expect(screen.getByText('Банан')).toBeInTheDocument();
            expect(screen.getByText('100 г')).toBeInTheDocument();
            expect(screen.getByText('89 ккал')).toBeInTheDocument();
        });

        it('renders manual entry button when onManualEntry provided', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onManualEntry={jest.fn()}
                />
            );

            expect(screen.getByText('Ввести вручную')).toBeInTheDocument();
        });

        it('does not render manual entry button when onManualEntry not provided', () => {
            render(<SearchTab onSelectFood={jest.fn()} />);

            expect(screen.queryByText('Ввести вручную')).not.toBeInTheDocument();
        });
    });

    describe('Search Input', () => {
        it('focuses search input on mount', () => {
            render(<SearchTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /поиск/i });
            expect(document.activeElement).toBe(input);
        });

        it('updates input value when typing', async () => {
            const user = userEvent.setup();
            render(<SearchTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'яблоко');

            expect(input).toHaveValue('яблоко');
        });

        it('shows loading indicator while searching', async () => {
            const user = userEvent.setup();
            const onSearch = jest.fn().mockImplementation(() => new Promise(() => { })); // Never resolves

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                />
            );

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'яблоко');

            // Wait for debounce
            await waitFor(() => {
                expect(screen.getByRole('textbox', { name: /поиск/i }).parentElement?.querySelector('.animate-spin')).toBeInTheDocument();
            }, { timeout: 500 });
        });
    });

    describe('Search Debounce', () => {
        it('debounces search calls by 300ms', async () => {
            jest.useFakeTimers();
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onSearch = jest.fn().mockResolvedValue([]);

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                />
            );

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'яб');

            // Should not call immediately
            expect(onSearch).not.toHaveBeenCalled();

            // Advance timers
            jest.advanceTimersByTime(300);

            await waitFor(() => {
                expect(onSearch).toHaveBeenCalledWith('яб');
            });

            jest.useRealTimers();
        });

        it('does not search for queries shorter than 2 characters', async () => {
            jest.useFakeTimers();
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onSearch = jest.fn().mockResolvedValue([]);

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                />
            );

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'я');

            jest.advanceTimersByTime(500);

            expect(onSearch).not.toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('Search Results', () => {
        it('displays search results from onSearch callback', async () => {
            const user = userEvent.setup();
            const searchResults = [
                createMockFood({ id: 'result-1', name: 'Яблоко зеленое' }),
                createMockFood({ id: 'result-2', name: 'Яблоко красное' }),
            ];
            const onSearch = jest.fn().mockResolvedValue(searchResults);

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                />
            );

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'яблоко');

            await waitFor(() => {
                expect(screen.getByText('Яблоко зеленое')).toBeInTheDocument();
                expect(screen.getByText('Яблоко красное')).toBeInTheDocument();
            });
        });

        it('hides recent/popular foods when searching', async () => {
            const user = userEvent.setup();
            const onSearch = jest.fn().mockResolvedValue([]);

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                    recentFoods={mockRecentFoods}
                />
            );

            // Initially shows recent foods
            expect(screen.getByText('Недавние')).toBeInTheDocument();

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'яблоко');

            await waitFor(() => {
                expect(screen.queryByText('Недавние')).not.toBeInTheDocument();
            });
        });
    });

    describe('Empty State', () => {
        it('shows "Ничего не найдено" when search returns empty results', async () => {
            const user = userEvent.setup();
            const onSearch = jest.fn().mockResolvedValue([]);

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                />
            );

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'несуществующий продукт');

            await waitFor(() => {
                expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
            });
        });

        it('shows manual entry option in empty state when onManualEntry provided', async () => {
            const user = userEvent.setup();
            const onSearch = jest.fn().mockResolvedValue([]);
            const onManualEntry = jest.fn();

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                    onManualEntry={onManualEntry}
                />
            );

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'несуществующий');

            await waitFor(() => {
                expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
            });

            // Should show manual entry button in empty state
            const manualEntryButton = screen.getByRole('button', { name: /ввести вручную/i });
            expect(manualEntryButton).toBeInTheDocument();
        });
    });

    describe('Food Selection', () => {
        it('calls onSelectFood when food item is clicked', async () => {
            const user = userEvent.setup();
            const onSelectFood = jest.fn();

            render(
                <SearchTab
                    onSelectFood={onSelectFood}
                    recentFoods={mockRecentFoods}
                />
            );

            const foodItem = screen.getByRole('option', { name: /банан/i });
            await user.click(foodItem);

            expect(onSelectFood).toHaveBeenCalledTimes(1);
            expect(onSelectFood).toHaveBeenCalledWith(mockRecentFoods[0]);
        });

        it('calls onSelectFood when food item is selected with Enter key', async () => {
            const onSelectFood = jest.fn();

            render(
                <SearchTab
                    onSelectFood={onSelectFood}
                    recentFoods={mockRecentFoods}
                />
            );

            const foodItem = screen.getByRole('option', { name: /банан/i });
            foodItem.focus();
            fireEvent.keyDown(foodItem, { key: 'Enter' });

            expect(onSelectFood).toHaveBeenCalledTimes(1);
            expect(onSelectFood).toHaveBeenCalledWith(mockRecentFoods[0]);
        });

        it('calls onSelectFood when food item is selected with Space key', async () => {
            const onSelectFood = jest.fn();

            render(
                <SearchTab
                    onSelectFood={onSelectFood}
                    recentFoods={mockRecentFoods}
                />
            );

            const foodItem = screen.getByRole('option', { name: /банан/i });
            foodItem.focus();
            fireEvent.keyDown(foodItem, { key: ' ' });

            expect(onSelectFood).toHaveBeenCalledTimes(1);
            expect(onSelectFood).toHaveBeenCalledWith(mockRecentFoods[0]);
        });
    });

    describe('Manual Entry', () => {
        it('calls onManualEntry when manual entry button is clicked', async () => {
            const user = userEvent.setup();
            const onManualEntry = jest.fn();

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onManualEntry={onManualEntry}
                />
            );

            const button = screen.getByRole('button', { name: /ввести вручную/i });
            await user.click(button);

            expect(onManualEntry).toHaveBeenCalledTimes(1);
        });
    });

    describe('Accessibility', () => {
        it('has accessible listbox structure', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    recentFoods={mockRecentFoods}
                />
            );

            const listbox = screen.getByRole('listbox', { name: /список продуктов/i });
            expect(listbox).toBeInTheDocument();

            const options = within(listbox).getAllByRole('option');
            expect(options).toHaveLength(mockRecentFoods.length);
        });

        it('food items have correct aria-labels', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    recentFoods={[mockRecentFoods[0]]}
                />
            );

            const option = screen.getByRole('option', { name: 'Банан, 100 г, 89 ккал' });
            expect(option).toBeInTheDocument();
        });

        it('food items are focusable', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    recentFoods={mockRecentFoods}
                />
            );

            const options = screen.getAllByRole('option');
            options.forEach(option => {
                expect(option).toHaveAttribute('tabindex', '0');
            });
        });

        it('search input has accessible label', () => {
            render(<SearchTab onSelectFood={jest.fn()} />);

            const input = screen.getByRole('textbox', { name: /поиск блюд и продуктов/i });
            expect(input).toBeInTheDocument();
        });
    });

    describe('Loading State', () => {
        it('shows loading indicator when isLoading is true', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    isLoading={true}
                />
            );

            const spinner = document.querySelector('.animate-spin');
            expect(spinner).toBeInTheDocument();
        });

        it('hides loading indicator when isLoading is false', () => {
            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    isLoading={false}
                />
            );

            const spinner = document.querySelector('.animate-spin');
            expect(spinner).not.toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('handles search error gracefully', async () => {
            const user = userEvent.setup();
            const onSearch = jest.fn().mockRejectedValue(new Error('Network error'));

            render(
                <SearchTab
                    onSelectFood={jest.fn()}
                    onSearch={onSearch}
                />
            );

            const input = screen.getByRole('textbox', { name: /поиск/i });
            await user.type(input, 'яблоко');

            // Should show empty state after error
            await waitFor(() => {
                expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
            });
        });
    });
});
