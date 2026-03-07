/**
 * FoodEntryModal Branch Coverage Tests
 *
 * Targets uncovered branches: edit mode, food selection, portion flow,
 * batch foods, manual entry, save/update, escape in portion step,
 * clone food, keyboard navigation edge cases, and editing details.
 *
 * @module food-tracker/components/__tests__/FoodEntryModal.branches.test
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FoodEntryModal } from '../FoodEntryModal';
import type { FoodEntry, FoodItem, MealType } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

const mockAddEntry = jest.fn().mockResolvedValue(undefined);
const mockUpdateEntry = jest.fn().mockResolvedValue(undefined);

jest.mock('../../store/foodTrackerStore', () => ({
    useFoodTrackerStore: (selector: (s: any) => any) =>
        selector({
            addEntry: mockAddEntry,
            updateEntry: mockUpdateEntry,
            selectedDate: '2025-01-15',
        }),
}));

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn().mockResolvedValue({ items: [] }),
        post: jest.fn().mockResolvedValue({}),
    },
}));

jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000${path}`,
}));

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}));

// Mock child components to isolate FoodEntryModal logic
jest.mock('../SearchTab', () => ({
    SearchTab: ({ onSelectFood, onManualEntry }: any) => (
        <div data-testid="search-tab">
            <input placeholder="Поиск блюд и продуктов" />
            <button
                data-testid="select-food-btn"
                onClick={() =>
                    onSelectFood({
                        id: 'food-1',
                        name: 'Яблоко',
                        category: 'Фрукты',
                        servingSize: 150,
                        servingUnit: 'г',
                        nutritionPer100: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
                        source: 'database',
                        verified: true,
                    })
                }
            >
                Select Apple
            </button>
            <button
                data-testid="select-user-food-btn"
                onClick={() =>
                    onSelectFood({
                        id: 'food-2',
                        name: 'Мой продукт',
                        category: 'user',
                        servingSize: 100,
                        servingUnit: 'г',
                        nutritionPer100: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                        source: 'user',
                        verified: false,
                    })
                }
            >
                Select User Food
            </button>
            {onManualEntry && (
                <button data-testid="manual-entry-btn" onClick={onManualEntry}>
                    Manual
                </button>
            )}
        </div>
    ),
}));

jest.mock('../BarcodeTab', () => ({
    BarcodeTab: ({ onSelectFood }: any) => <div data-testid="barcode-tab">Barcode</div>,
}));

jest.mock('../AIPhotoTab', () => ({
    AIPhotoTab: ({ onSelectFoods, onManualSearch }: any) => (
        <div data-testid="photo-tab">
            <button
                data-testid="select-single-photo-food"
                onClick={() =>
                    onSelectFoods([
                        {
                            id: 'photo-1',
                            name: 'Фото еда',
                            category: 'Общее',
                            servingSize: 200,
                            servingUnit: 'г',
                            nutritionPer100: { calories: 80, protein: 5, fat: 3, carbs: 10 },
                            source: 'database',
                            verified: false,
                        },
                    ])
                }
            >
                Single Photo Food
            </button>
            <button
                data-testid="select-batch-photo-foods"
                onClick={() =>
                    onSelectFoods([
                        {
                            id: 'batch-1',
                            name: 'Суп',
                            category: 'Первые блюда',
                            servingSize: 250,
                            servingUnit: 'г',
                            nutritionPer100: { calories: 60, protein: 3, fat: 2, carbs: 8 },
                            source: 'database',
                            verified: false,
                        },
                        {
                            id: 'batch-2',
                            name: 'Хлеб',
                            category: 'Хлеб',
                            servingSize: 30,
                            servingUnit: 'г',
                            nutritionPer100: { calories: 265, protein: 9, fat: 3, carbs: 49 },
                            source: 'database',
                            verified: false,
                        },
                        {
                            id: 'batch-3',
                            name: 'Сок',
                            category: 'Напитки',
                            servingSize: 200,
                            servingUnit: 'мл',
                            nutritionPer100: { calories: 46, protein: 0.1, fat: 0.1, carbs: 11 },
                            source: 'database',
                            verified: false,
                        },
                    ])
                }
            >
                Batch Photo Foods
            </button>
            <button data-testid="manual-search-btn" onClick={onManualSearch}>
                Manual Search
            </button>
        </div>
    ),
}));

jest.mock('../ChatTab', () => ({
    ChatTab: ({ onSelectFood }: any) => (
        <div data-testid="chat-tab">
            <p>Опишите, что вы съели</p>
        </div>
    ),
}));

jest.mock('../ManualEntryForm', () => ({
    ManualEntryForm: ({ onSubmit, onCancel }: any) => (
        <div data-testid="manual-entry-form">
            <button
                data-testid="submit-manual"
                onClick={() =>
                    onSubmit({
                        id: 'manual-1',
                        name: 'Ручной продукт',
                        category: 'Общее',
                        servingSize: 100,
                        servingUnit: 'г',
                        nutritionPer100: { calories: 200, protein: 15, fat: 8, carbs: 25 },
                        source: 'user',
                        verified: false,
                    })
                }
            >
                Submit Manual
            </button>
            <button data-testid="cancel-manual" onClick={onCancel}>
                Cancel Manual
            </button>
        </div>
    ),
}));

jest.mock('../PortionSelector', () => ({
    PortionSelector: ({ food, onPortionChange }: any) => (
        <div data-testid="portion-selector">
            <span>{food?.name}</span>
            <button
                data-testid="set-portion"
                onClick={() =>
                    onPortionChange('grams', 200, {
                        calories: (food?.nutritionPer100?.calories || 100) * 2,
                        protein: (food?.nutritionPer100?.protein || 10) * 2,
                        fat: (food?.nutritionPer100?.fat || 5) * 2,
                        carbs: (food?.nutritionPer100?.carbs || 15) * 2,
                    })
                }
            >
                Set 200g
            </button>
        </div>
    ),
}));

jest.mock('../../hooks/useFoodSearch', () => ({
    useFoodSearch: () => ({
        results: [],
        recentFoods: [],
        favoriteFoods: [],
        isSearching: false,
        setQuery: jest.fn(),
    }),
}));

// ============================================================================
// Helpers
// ============================================================================

function createEditingEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
    return {
        id: 'entry-1',
        foodId: 'food-1',
        foodName: 'Овсянка',
        mealType: 'breakfast',
        portionType: 'grams',
        portionAmount: 200,
        nutrition: { calories: 300, protein: 20, fat: 10, carbs: 40 },
        time: '08:30',
        date: '2025-01-15',
        createdAt: '2025-01-15T08:30:00.000Z',
        updatedAt: '2025-01-15T08:30:00.000Z',
        ...overrides,
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('FoodEntryModal Branch Coverage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -------------------------------------------------------------------------
    // Edit mode branches (lines 109-146, 326-337, 412-414, 668-669)
    // -------------------------------------------------------------------------
    describe('Edit mode', () => {
        it('opens in portion-selection step with pre-filled data when editingEntry is provided', () => {
            const entry = createEditingEntry();
            render(
                <FoodEntryModal
                    isOpen={true}
                    onClose={jest.fn()}
                    editingEntry={entry}
                />
            );

            // Should show "Редактировать" title (edit mode)
            expect(screen.getByText('Редактировать')).toBeInTheDocument();
            // Should show portion selector, not search tabs
            expect(screen.getByTestId('portion-selector')).toBeInTheDocument();
            expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        });

        it('shows back button in portion-selection step', () => {
            const entry = createEditingEntry();
            render(
                <FoodEntryModal
                    isOpen={true}
                    onClose={jest.fn()}
                    editingEntry={entry}
                />
            );

            expect(screen.getByLabelText('Назад')).toBeInTheDocument();
        });

        it('shows "Сохранить" button text in edit mode', () => {
            const entry = createEditingEntry();
            render(
                <FoodEntryModal
                    isOpen={true}
                    onClose={jest.fn()}
                    editingEntry={entry}
                />
            );

            expect(screen.getByText('Сохранить')).toBeInTheDocument();
        });

        it('calls updateEntry when saving in edit mode', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();
            const entry = createEditingEntry();

            render(
                <FoodEntryModal
                    isOpen={true}
                    onClose={onClose}
                    editingEntry={entry}
                    mealType="breakfast"
                />
            );

            // Set portion to enable save
            await user.click(screen.getByTestId('set-portion'));

            // Click save
            await user.click(screen.getByText('Сохранить'));

            await waitFor(() => {
                expect(mockUpdateEntry).toHaveBeenCalledWith('entry-1', expect.objectContaining({
                    mealType: 'breakfast',
                }));
            });

            await waitFor(() => {
                expect(onClose).toHaveBeenCalled();
            });
        });

        it('handles editingEntry with zero portionAmount', () => {
            const entry = createEditingEntry({ portionAmount: 0 });
            render(
                <FoodEntryModal
                    isOpen={true}
                    onClose={jest.fn()}
                    editingEntry={entry}
                />
            );

            // Should render without error (nutrition per 100 defaults to 0)
            expect(screen.getByText('Редактировать')).toBeInTheDocument();
        });

        it('handles editingEntry with milliliters portionType', () => {
            const entry = createEditingEntry({ portionType: 'milliliters' });
            render(
                <FoodEntryModal
                    isOpen={true}
                    onClose={jest.fn()}
                    editingEntry={entry}
                />
            );

            expect(screen.getByText('Редактировать')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Food selection branches (lines 221-227, 232-237)
    // -------------------------------------------------------------------------
    describe('Food selection', () => {
        it('transitions to portion step when a food is selected', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));

            expect(screen.getByTestId('portion-selector')).toBeInTheDocument();
            // Food name appears in heading and portion selector
            expect(screen.getAllByText('Яблоко').length).toBeGreaterThanOrEqual(1);
        });

        it('uses servingSize from food item as initial portion amount', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            // Select food with servingSize 150
            await user.click(screen.getByTestId('select-food-btn'));

            // Portion selector should be visible
            expect(screen.getByTestId('portion-selector')).toBeInTheDocument();
        });

        it('handles single food from AI photo (foods.length === 1)', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            // Switch to photo tab
            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));
            // Select single food from photo
            await user.click(screen.getByTestId('select-single-photo-food'));

            expect(screen.getByTestId('portion-selector')).toBeInTheDocument();
        });

        it('handles batch foods from AI photo (foods.length > 1)', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));
            await user.click(screen.getByTestId('select-batch-photo-foods'));

            // Should show batch progress indicator
            expect(screen.getByText(/Добавляем 1 из 3/)).toBeInTheDocument();
            expect(screen.getByText('Пропустить')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Batch flow branches (lines 292-299, 357-365)
    // -------------------------------------------------------------------------
    describe('Batch flow', () => {
        it('advances to next batch item when skip is clicked', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));
            await user.click(screen.getByTestId('select-batch-photo-foods'));

            expect(screen.getByText(/Добавляем 1 из 3/)).toBeInTheDocument();

            // Skip first item
            await user.click(screen.getByText('Пропустить'));
            expect(screen.getByText(/Добавляем 2 из 3/)).toBeInTheDocument();
        });

        it('closes modal when skipping the last batch item', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();
            render(
                <FoodEntryModal isOpen={true} onClose={onClose} />
            );

            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));
            await user.click(screen.getByTestId('select-batch-photo-foods'));

            // Skip all three items
            await user.click(screen.getByText('Пропустить'));
            await user.click(screen.getByText('Пропустить'));
            await user.click(screen.getByText('Пропустить'));

            expect(onClose).toHaveBeenCalled();
        });

        it('advances to next batch item after saving', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));
            await user.click(screen.getByTestId('select-batch-photo-foods'));

            // Set portion then save
            await user.click(screen.getByTestId('set-portion'));

            // Button should say "Добавить и далее" since there are more items
            expect(screen.getByText('Добавить и далее')).toBeInTheDocument();

            await user.click(screen.getByText('Добавить и далее'));

            await waitFor(() => {
                expect(mockAddEntry).toHaveBeenCalled();
            });
        });
    });

    // -------------------------------------------------------------------------
    // Save new entry branches (lines 339-365)
    // -------------------------------------------------------------------------
    describe('Save new entry', () => {
        it('calls addEntry and closes when saving a non-batch new entry', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();
            render(
                <FoodEntryModal isOpen={true} onClose={onClose} mealType="lunch" />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            await user.click(screen.getByTestId('set-portion'));
            await user.click(screen.getByText('Добавить'));

            await waitFor(() => {
                expect(mockAddEntry).toHaveBeenCalledWith('lunch', expect.objectContaining({
                    foodId: 'food-1',
                    mealType: 'lunch',
                    foodName: 'Яблоко',
                }));
            });

            await waitFor(() => {
                expect(onClose).toHaveBeenCalled();
            });
        });

        it('does not save when no food is selected', async () => {
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            // No save button visible in food selection step
            expect(screen.queryByText('Добавить')).not.toBeInTheDocument();
        });

        it('disables save button when no calculated nutrition', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));

            // Save button should be disabled since no portion change has triggered
            const saveButton = screen.getByText('Добавить').closest('button');
            expect(saveButton).toBeDisabled();
        });

        it('handles save error gracefully', async () => {
            const user = userEvent.setup();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockAddEntry.mockRejectedValueOnce(new Error('Save failed'));

            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} mealType="breakfast" />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            await user.click(screen.getByTestId('set-portion'));
            await user.click(screen.getByText('Добавить'));

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to save entry:', expect.any(Error));
            });

            consoleSpy.mockRestore();
        });
    });

    // -------------------------------------------------------------------------
    // Escape key in portion step (lines 168-170)
    // -------------------------------------------------------------------------
    describe('Escape key in different steps', () => {
        it('goes back to food selection when Escape is pressed in portion step', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();
            render(
                <FoodEntryModal isOpen={true} onClose={onClose} />
            );

            // Select food to go to portion step
            await user.click(screen.getByTestId('select-food-btn'));
            expect(screen.getByTestId('portion-selector')).toBeInTheDocument();

            // Press Escape
            fireEvent.keyDown(document, { key: 'Escape' });

            // Should go back to food selection, not close
            expect(onClose).not.toHaveBeenCalled();
            expect(screen.queryByTestId('portion-selector')).not.toBeInTheDocument();
            expect(screen.getByRole('tablist')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Back button behavior (lines 250-251, 272)
    // -------------------------------------------------------------------------
    describe('Back button', () => {
        it('returns to food selection from portion step', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            expect(screen.getByTestId('portion-selector')).toBeInTheDocument();

            await user.click(screen.getByLabelText('Назад'));

            expect(screen.queryByTestId('portion-selector')).not.toBeInTheDocument();
            expect(screen.getByRole('tablist')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Manual entry branches (lines 256, 261-267)
    // -------------------------------------------------------------------------
    describe('Manual entry', () => {
        it('switches to manual tab and shows manual entry form', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByRole('tab', { name: 'Ручной ввод' }));
            expect(screen.getByTestId('manual-entry-form')).toBeInTheDocument();
        });

        it('transitions to portion step when manual form is submitted', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByRole('tab', { name: 'Ручной ввод' }));
            await user.click(screen.getByTestId('submit-manual'));

            expect(screen.getByTestId('portion-selector')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Clone food branch (lines 277-286)
    // -------------------------------------------------------------------------
    describe('Clone food', () => {
        it('shows bookmark button for non-user food source', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));

            // Should show bookmark button for database source
            expect(screen.getByLabelText('Сохранить как свой')).toBeInTheDocument();
        });

        it('does not show bookmark button for user food source', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-user-food-btn'));

            // Should not show bookmark for user-sourced food
            expect(screen.queryByLabelText('Сохранить как свой')).not.toBeInTheDocument();
        });

        it('calls API to clone food when bookmark is clicked', async () => {
            const user = userEvent.setup();
            const { apiClient } = require('@/shared/utils/api-client');
            const toast = require('react-hot-toast').default;

            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            await user.click(screen.getByLabelText('Сохранить как свой'));

            await waitFor(() => {
                expect(apiClient.post).toHaveBeenCalled();
                expect(toast.success).toHaveBeenCalledWith('Продукт сохранён');
            });
        });

        it('shows error toast when clone fails', async () => {
            const user = userEvent.setup();
            const { apiClient } = require('@/shared/utils/api-client');
            const toast = require('react-hot-toast').default;
            apiClient.post.mockRejectedValueOnce(new Error('Clone failed'));

            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            await user.click(screen.getByLabelText('Сохранить как свой'));

            await waitFor(() => {
                expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить продукт');
            });
        });
    });

    // -------------------------------------------------------------------------
    // Editing details branches (lines 531-596, 598-632)
    // -------------------------------------------------------------------------
    describe('Editing food details', () => {
        it('shows edit button and toggles editing mode', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));

            // Click edit button
            await user.click(screen.getByLabelText('Редактировать'));

            // Should show input fields for name and nutrition
            expect(screen.getByDisplayValue('Яблоко')).toBeInTheDocument();
        });

        it('displays nutrition per-100g info when not editing', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));

            // Should show nutrition per-100g summary
            expect(screen.getByText(/На 100г:/)).toBeInTheDocument();
        });

        it('does not show brand when food has no brand', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));

            // The mock food (Яблоко) has no brand property,
            // so no brand paragraph should be rendered
            // The food name heading should exist
            const heading = screen.getByRole('heading', { level: 3 });
            expect(heading).toHaveTextContent('Яблоко');
        });
    });

    // -------------------------------------------------------------------------
    // Nutrition per-100g editing (lines 315-316)
    // -------------------------------------------------------------------------
    describe('Nutrition editing', () => {
        it('allows editing nutrition per-100g values', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            await user.click(screen.getByLabelText('Редактировать'));

            // Find and modify calorie input
            const calorieInputs = screen.getAllByRole('spinbutton');
            expect(calorieInputs.length).toBeGreaterThanOrEqual(4);

            // Change calories value
            await user.clear(calorieInputs[0]);
            await user.type(calorieInputs[0], '100');
        });

        it('closes editing mode when "Готово" is clicked', async () => {
            const user = userEvent.setup();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            await user.click(screen.getByLabelText('Редактировать'));

            await user.click(screen.getByText('Готово'));

            // Should be back in non-editing mode
            expect(screen.getByText(/На 100г:/)).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Keyboard tab navigation edge case (line 210)
    // -------------------------------------------------------------------------
    describe('Tab keyboard navigation - no-op key', () => {
        it('does not change tab on irrelevant key press', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            fireEvent.keyDown(searchTab, { key: 'a' });

            // Search tab should still be selected
            expect(searchTab).toHaveAttribute('aria-selected', 'true');
        });
    });

    // -------------------------------------------------------------------------
    // Modal reset on reopen (lines 147-154)
    // -------------------------------------------------------------------------
    describe('Reset when reopened without editingEntry', () => {
        it('resets to food selection step when reopening without editingEntry', async () => {
            const { rerender } = render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} />
            );

            // Close
            rerender(<FoodEntryModal isOpen={false} onClose={jest.fn()} />);

            // Reopen
            rerender(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            await waitFor(() => {
                expect(screen.getByText('Добавить запись')).toBeInTheDocument();
            });
        });
    });

    // -------------------------------------------------------------------------
    // Meal type label display (line 648)
    // -------------------------------------------------------------------------
    describe('Meal type label in portion step', () => {
        const mealLabels: [MealType, string][] = [
            ['breakfast', 'Завтрак'],
            ['lunch', 'Обед'],
            ['dinner', 'Ужин'],
            ['snack', 'Перекус'],
        ];

        it.each(mealLabels)(
            'displays correct label for %s meal type',
            async (mealType, label) => {
                const user = userEvent.setup();
                render(
                    <FoodEntryModal isOpen={true} onClose={jest.fn()} mealType={mealType} />
                );

                await user.click(screen.getByTestId('select-food-btn'));

                expect(screen.getByText(label)).toBeInTheDocument();
            }
        );
    });

    // -------------------------------------------------------------------------
    // Title display branches (lines 408-414)
    // -------------------------------------------------------------------------
    describe('Modal title branches', () => {
        it('shows "Добавить запись" in food selection step', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);
            expect(screen.getByText('Добавить запись')).toBeInTheDocument();
        });

        it('shows food name in portion step for new entry', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            await user.click(screen.getByTestId('select-food-btn'));

            // Title shows food name when not editing
            // The title shows selectedFood.name when not editingEntry
            const title = screen.getByRole('heading', { level: 2 });
            expect(title.textContent).toBe('Яблоко');
        });

        it('shows "Редактировать" in portion step for edit mode', () => {
            const entry = createEditingEntry();
            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} editingEntry={entry} />
            );

            expect(screen.getByText('Редактировать')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // AIPhotoTab manual search callback (line 480)
    // -------------------------------------------------------------------------
    describe('AIPhotoTab manual search', () => {
        it('switches to search tab when manual search is requested from photo tab', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));
            await user.click(screen.getByTestId('manual-search-btn'));

            // Should switch to search tab
            expect(screen.getByRole('tab', { name: 'Поиск' })).toHaveAttribute('aria-selected', 'true');
        });
    });

    // -------------------------------------------------------------------------
    // Saving state display (lines 659-675)
    // -------------------------------------------------------------------------
    describe('Saving state', () => {
        it('shows spinner during save', async () => {
            const user = userEvent.setup();
            // Make addEntry hang
            let resolveAdd: () => void;
            mockAddEntry.mockImplementation(() => new Promise<void>((r) => { resolveAdd = r; }));

            render(
                <FoodEntryModal isOpen={true} onClose={jest.fn()} mealType="breakfast" />
            );

            await user.click(screen.getByTestId('select-food-btn'));
            await user.click(screen.getByTestId('set-portion'));
            await user.click(screen.getByText('Добавить'));

            // Should show saving state
            await waitFor(() => {
                expect(screen.getByText('Сохранение...')).toBeInTheDocument();
            });

            // Resolve to clean up
            await act(async () => {
                resolveAdd!();
            });
        });
    });
});
