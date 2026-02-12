/**
 * MealSlot Component Unit Tests
 *
 * Tests for meal slot rendering, entries display, and interactions.
 *
 * @module food-tracker/components/__tests__/MealSlot.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MealSlot } from '../MealSlot';
import type { FoodEntry, MealType } from '../../types';

// ============================================================================
// Test Helpers
// ============================================================================

const createEntry = (
    id: string,
    foodName: string,
    calories: number,
    time: string = '08:00'
): FoodEntry => ({
    id,
    foodId: `food-${id}`,
    foodName,
    mealType: 'breakfast',
    portionType: 'grams',
    portionAmount: 100,
    nutrition: {
        calories,
        protein: 10,
        fat: 5,
        carbs: 15,
    },
    time,
    date: '2025-01-15',
    createdAt: '2025-01-15T08:00:00.000Z',
    updatedAt: '2025-01-15T08:00:00.000Z',
});

// ============================================================================
// Tests
// ============================================================================

describe('MealSlot', () => {
    const mockOnAddEntry = jest.fn();
    const mockOnEntryClick = jest.fn();
    const mockOnEditEntry = jest.fn();
    const mockOnDeleteEntry = jest.fn();

    beforeEach(() => {
        mockOnAddEntry.mockClear();
        mockOnEntryClick.mockClear();
        mockOnEditEntry.mockClear();
        mockOnDeleteEntry.mockClear();
    });

    describe('Rendering with Entries', () => {
        it('renders meal slot with Russian label for breakfast', () => {
            const entries = [createEntry('1', 'Овсянка', 250)];
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('Завтрак')).toBeInTheDocument();
        });

        it('renders meal slot with Russian label for lunch', () => {
            const entries = [createEntry('1', 'Суп', 300)];
            render(
                <MealSlot
                    mealType="lunch"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('Обед')).toBeInTheDocument();
        });

        it('renders meal slot with Russian label for dinner', () => {
            const entries = [createEntry('1', 'Курица', 400)];
            render(
                <MealSlot
                    mealType="dinner"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('Ужин')).toBeInTheDocument();
        });

        it('renders meal slot with Russian label for snack', () => {
            const entries = [createEntry('1', 'Яблоко', 80)];
            render(
                <MealSlot
                    mealType="snack"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('Перекус')).toBeInTheDocument();
        });

        it('renders all food entries', () => {
            const entries = [
                createEntry('1', 'Овсянка', 250),
                createEntry('2', 'Яйцо', 150),
                createEntry('3', 'Тост', 100),
            ];
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('Овсянка')).toBeInTheDocument();
            expect(screen.getByText('Яйцо')).toBeInTheDocument();
            expect(screen.getByText('Тост')).toBeInTheDocument();
        });

        it('displays first entry time', () => {
            const entries = [
                createEntry('1', 'Овсянка', 250, '08:30'),
                createEntry('2', 'Яйцо', 150, '09:00'),
            ];
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('08:30')).toBeInTheDocument();
        });
    });

    describe('Empty State', () => {
        it('renders empty state message when no entries', () => {
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('Нет записей')).toBeInTheDocument();
        });

        it('renders "Добавить еду" button in empty state', () => {
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('Добавить еду')).toBeInTheDocument();
        });

        it('calls onAddEntry when "Добавить еду" is clicked', () => {
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            fireEvent.click(screen.getByText('Добавить еду'));
            expect(mockOnAddEntry).toHaveBeenCalledWith('breakfast');
        });
    });

    describe('Add Button', () => {
        it('renders add button with correct aria-label', () => {
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByLabelText('Добавить в Завтрак')).toBeInTheDocument();
        });

        it('calls onAddEntry with meal type when add button is clicked', () => {
            render(
                <MealSlot
                    mealType="lunch"
                    entries={[]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            fireEvent.click(screen.getByLabelText('Добавить в Обед'));
            expect(mockOnAddEntry).toHaveBeenCalledWith('lunch');
        });
    });

    describe('Subtotals', () => {
        it('displays subtotals when entries exist', () => {
            const entries = [
                createEntry('1', 'Овсянка', 250),
                createEntry('2', 'Яйцо', 150),
            ];
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            // Should show "Итого:" label
            expect(screen.getByText('Итого:')).toBeInTheDocument();
            // Should show total calories (250 + 150 = 400)
            expect(screen.getByText('400 ккал')).toBeInTheDocument();
        });

        it('calculates correct subtotals for multiple entries', () => {
            const entries = [
                {
                    ...createEntry('1', 'Овсянка', 250),
                    nutrition: { calories: 250, protein: 10, fat: 5, carbs: 40 },
                },
                {
                    ...createEntry('2', 'Яйцо', 150),
                    nutrition: { calories: 150, protein: 12, fat: 10, carbs: 1 },
                },
            ];
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                />
            );

            // Total protein: 10 + 12 = 22
            expect(screen.getByText('Б: 22г')).toBeInTheDocument();
            // Total fat: 5 + 10 = 15
            expect(screen.getByText('Ж: 15г')).toBeInTheDocument();
            // Total carbs: 40 + 1 = 41
            expect(screen.getByText('У: 41г')).toBeInTheDocument();
        });
    });

    describe('Entry Interactions', () => {
        it('calls onEntryClick when entry is clicked', () => {
            const entries = [createEntry('1', 'Овсянка', 250)];
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={entries}
                    onAddEntry={mockOnAddEntry}
                    onEntryClick={mockOnEntryClick}
                />
            );

            fireEvent.click(screen.getByText('Овсянка'));
            expect(mockOnEntryClick).toHaveBeenCalledWith(entries[0]);
        });
    });

    describe('Accessibility', () => {
        it('has proper section aria-label', () => {
            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByRole('region', { name: 'Завтрак - приём пищи' })).toBeInTheDocument();
        });

        it('has proper aria-label for each meal type', () => {
            const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
            const expectedLabels = [
                'Завтрак - приём пищи',
                'Обед - приём пищи',
                'Ужин - приём пищи',
                'Перекус - приём пищи',
            ];

            mealTypes.forEach((mealType, index) => {
                const { unmount } = render(
                    <MealSlot
                        mealType={mealType}
                        entries={[]}
                        onAddEntry={mockOnAddEntry}
                    />
                );
                expect(screen.getByRole('region', { name: expectedLabels[index] })).toBeInTheDocument();
                unmount();
            });
        });
    });

    describe('Custom className', () => {
        it('applies custom className to container', () => {
            const { container } = render(
                <MealSlot
                    mealType="breakfast"
                    entries={[]}
                    onAddEntry={mockOnAddEntry}
                    className="custom-class"
                />
            );

            expect(container.firstChild).toHaveClass('custom-class');
        });
    });
});
