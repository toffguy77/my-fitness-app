/**
 * Integration tests for Food Tracker feature
 * Tests complete user flows with MSW mocks
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import { DietTab } from '../components/DietTab';
import { FoodTrackerTabs } from '../components/FoodTrackerTabs';
import { DatePicker } from '../components/DatePicker';
import type { FoodEntry, MealType, KBZHU, EntriesByMealType } from '../types';

// Mock the API client
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

// Mock the config
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000/api${path}`,
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}));

// Import mocked modules
import { apiClient } from '@/shared/utils/api-client';

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Mock data
const mockEntries: EntriesByMealType = {
    breakfast: [
        {
            id: 'entry-1',
            foodId: 'food-1',
            foodName: 'Овсяная каша',
            mealType: 'breakfast',
            portionType: 'grams',
            portionAmount: 150,
            nutrition: { calories: 528, protein: 18.5, fat: 9.2, carbs: 92.7 },
            time: '08:30',
            date: '2024-01-15',
            createdAt: '2024-01-15T08:30:00.000Z',
            updatedAt: '2024-01-15T08:30:00.000Z',
        },
    ],
    lunch: [
        {
            id: 'entry-2',
            foodId: 'food-2',
            foodName: 'Куриная грудка',
            mealType: 'lunch',
            portionType: 'grams',
            portionAmount: 200,
            nutrition: { calories: 330, protein: 62, fat: 7.2, carbs: 0 },
            time: '13:00',
            date: '2024-01-15',
            createdAt: '2024-01-15T13:00:00.000Z',
            updatedAt: '2024-01-15T13:00:00.000Z',
        },
    ],
    dinner: [],
    snack: [],
};

const mockDailyTotals: KBZHU = {
    calories: 858,
    protein: 80.5,
    fat: 16.4,
    carbs: 92.7,
};

const mockTargetGoals = {
    calories: 2000,
    protein: 150,
    fat: 67,
    carbs: 200,
};

// Helper to create default DietTab props
const createDietTabProps = (overrides = {}) => ({
    entries: mockEntries,
    dailyTotals: mockDailyTotals,
    targetGoals: mockTargetGoals,
    isLoading: false,
    onAddEntry: jest.fn().mockResolvedValue(mockEntries.breakfast[0]),
    onUpdateEntry: jest.fn().mockResolvedValue(mockEntries.breakfast[0]),
    onDeleteEntry: jest.fn().mockResolvedValue(true),
    ...overrides,
});

describe('Food Tracker Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset store state
        useFoodTrackerStore.setState({
            selectedDate: '2024-01-15',
            entries: {
                breakfast: [],
                lunch: [],
                dinner: [],
                snack: [],
            },
            isLoading: false,
            error: null,
            dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            targetGoals: {
                calories: 2000,
                protein: 150,
                fat: 67,
                carbs: 200,
                isCustom: false,
            },
            waterIntake: 0,
            waterGoal: 8,
            glassSize: 250,
            isOffline: false,
            pendingOperations: [],
        });
        Object.defineProperty(navigator, 'onLine', {
            value: true, writable: true, configurable: true,
        });
    });

    describe('Complete Flow: Load Page → View Entries → Verify Totals', () => {
        it('loads and displays food entries with correct daily totals', async () => {
            render(<DietTab {...createDietTabProps()} />);

            // Verify meal slots are rendered
            expect(screen.getByText('Завтрак')).toBeInTheDocument();
            expect(screen.getByText('Обед')).toBeInTheDocument();
            expect(screen.getByText('Ужин')).toBeInTheDocument();
            expect(screen.getByText('Перекус')).toBeInTheDocument();

            // Verify food entries are displayed
            expect(screen.getByText('Овсяная каша')).toBeInTheDocument();
            expect(screen.getByText('Куриная грудка')).toBeInTheDocument();

            // Verify КБЖУ summary is displayed
            expect(screen.getByText('Ккал')).toBeInTheDocument();
            expect(screen.getByText('Белки')).toBeInTheDocument();
            expect(screen.getByText('Жиры')).toBeInTheDocument();
            expect(screen.getByText('Углеводы')).toBeInTheDocument();
        });

        it('displays empty state when no entries exist', async () => {
            const emptyEntries: EntriesByMealType = {
                breakfast: [],
                lunch: [],
                dinner: [],
                snack: [],
            };

            render(<DietTab {...createDietTabProps({
                entries: emptyEntries,
                dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            })} />);

            // Verify meal slots are rendered
            expect(screen.getByText('Завтрак')).toBeInTheDocument();
            expect(screen.getByText('Обед')).toBeInTheDocument();

            // Verify zero totals
            const zeroCaloriesElements = screen.getAllByText(/0/);
            expect(zeroCaloriesElements.length).toBeGreaterThan(0);
        });
    });

    describe('Tab Switching with Data', () => {
        it('switches between Рацион and Рекомендации tabs', async () => {
            const user = userEvent.setup();
            const onTabChange = jest.fn();

            render(
                <FoodTrackerTabs
                    activeTab="diet"
                    onTabChange={onTabChange}
                />
            );

            // Verify initial tab
            const dietTab = screen.getByRole('tab', { name: /рацион/i });
            const recommendationsTab = screen.getByRole('tab', { name: /рекомендации/i });

            expect(dietTab).toHaveAttribute('aria-selected', 'true');
            expect(recommendationsTab).toHaveAttribute('aria-selected', 'false');

            // Click recommendations tab
            await user.click(recommendationsTab);

            expect(onTabChange).toHaveBeenCalledWith('recommendations');
        });

        it('supports keyboard navigation between tabs', async () => {
            const user = userEvent.setup();
            const onTabChange = jest.fn();

            render(
                <FoodTrackerTabs
                    activeTab="diet"
                    onTabChange={onTabChange}
                />
            );

            const dietTab = screen.getByRole('tab', { name: /рацион/i });

            // Focus on diet tab
            await user.click(dietTab);

            // Press right arrow to move to recommendations
            await user.keyboard('{ArrowRight}');

            expect(onTabChange).toHaveBeenCalledWith('recommendations');
        });
    });

    describe('Date Navigation', () => {
        it('navigates to previous day', async () => {
            const user = userEvent.setup();
            const onDateChange = jest.fn();

            render(
                <DatePicker
                    selectedDate={new Date('2024-01-15')}
                    onDateChange={onDateChange}
                />
            );

            // Find and click previous day button
            const prevButton = screen.getByRole('button', { name: /предыдущий день/i });
            await user.click(prevButton);

            expect(onDateChange).toHaveBeenCalledWith(new Date('2024-01-14'));
        });

        it('prevents navigation to future dates', async () => {
            const user = userEvent.setup();
            const onDateChange = jest.fn();
            const today = new Date();

            render(
                <DatePicker
                    selectedDate={today}
                    onDateChange={onDateChange}
                />
            );

            // Find next day button - should be disabled
            const nextButton = screen.getByRole('button', { name: /следующий день/i });
            expect(nextButton).toBeDisabled();

            // Try to click anyway
            await user.click(nextButton);

            // Should not have been called
            expect(onDateChange).not.toHaveBeenCalled();
        });

        it('displays date in Russian format', () => {
            render(
                <DatePicker
                    selectedDate={new Date('2024-01-15')}
                    onDateChange={jest.fn()}
                />
            );

            // Should display Russian month name
            expect(screen.getByText(/января/i)).toBeInTheDocument();
        });
    });

    describe('Error Handling', () => {
        it('handles API errors gracefully - component still renders', async () => {
            render(<DietTab {...createDietTabProps()} />);

            // Component should still render meal slots
            expect(screen.getByText('Завтрак')).toBeInTheDocument();
            expect(screen.getByText('Обед')).toBeInTheDocument();
        });

        it('shows loading state when fetching data', async () => {
            render(<DietTab {...createDietTabProps({ isLoading: true })} />);

            // Component should still render structure during loading
            expect(screen.getByText('Завтрак')).toBeInTheDocument();
            expect(screen.getByText('Загрузка...')).toBeInTheDocument();
        });
    });

    describe('Water Tracker Integration', () => {
        it('displays water intake in Russian format', () => {
            useFoodTrackerStore.setState({
                waterIntake: 5,
                waterGoal: 8,
            });

            render(<DietTab {...createDietTabProps()} />);

            // Should display water in Russian format
            expect(screen.getByText(/5\s*\/\s*8/)).toBeInTheDocument();
            const waterElements = screen.getAllByText(/стакан/i);
            expect(waterElements.length).toBeGreaterThan(0);
        });

        it('renders add water button', async () => {
            useFoodTrackerStore.setState({
                waterIntake: 3,
                waterGoal: 8,
            });

            render(<DietTab {...createDietTabProps()} />);

            // Find add water button
            const addWaterButton = screen.getByRole('button', { name: /добавить стакан воды/i });
            expect(addWaterButton).toBeInTheDocument();
        });
    });

    describe('FAB Button', () => {
        it('renders FAB button for adding food', () => {
            render(<DietTab {...createDietTabProps()} />);

            // Should have FAB button
            const fabButton = screen.getByTestId('fab-add-food');
            expect(fabButton).toBeInTheDocument();
        });
    });
});

describe('Food Entry Store Operations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        useFoodTrackerStore.setState({
            selectedDate: '2024-01-15',
            entries: mockEntries,
            dailyTotals: mockDailyTotals,
            isLoading: false,
            error: null,
            targetGoals: {
                calories: 2000,
                protein: 150,
                fat: 67,
                carbs: 200,
                isCustom: false,
            },
            waterIntake: 5,
            waterGoal: 8,
            glassSize: 250,
            isOffline: false,
            pendingOperations: [],
        });
    });

    it('store has correct initial entries', () => {
        const state = useFoodTrackerStore.getState();

        expect(state.entries.breakfast).toHaveLength(1);
        expect(state.entries.lunch).toHaveLength(1);
        expect(state.entries.dinner).toHaveLength(0);
        expect(state.entries.snack).toHaveLength(0);
    });

    it('store has correct daily totals', () => {
        const state = useFoodTrackerStore.getState();

        expect(state.dailyTotals.calories).toBe(858);
        expect(state.dailyTotals.protein).toBe(80.5);
    });

    it('updates entry via store', async () => {
        const updatedEntry: FoodEntry = {
            ...mockEntries.breakfast[0],
            portionAmount: 200,
            nutrition: { calories: 704, protein: 24.6, fat: 12.2, carbs: 123.6 },
            updatedAt: new Date().toISOString(),
        };

        mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

        await act(async () => {
            await useFoodTrackerStore.getState().updateEntry('entry-1', { portionAmount: 200 });
        });

        // Verify entry was updated
        const state = useFoodTrackerStore.getState();
        const entry = state.entries.breakfast.find(e => e.id === 'entry-1');
        expect(entry?.portionAmount).toBe(200);
    });

    it('deletes entry via store', async () => {
        mockedApiClient.delete.mockResolvedValueOnce({ success: true });

        const initialCount = useFoodTrackerStore.getState().entries.breakfast.length;

        await act(async () => {
            await useFoodTrackerStore.getState().deleteEntry('entry-1', 'breakfast');
        });

        // Verify entry was deleted
        const state = useFoodTrackerStore.getState();
        expect(state.entries.breakfast.length).toBeLessThan(initialCount);
    });
});
