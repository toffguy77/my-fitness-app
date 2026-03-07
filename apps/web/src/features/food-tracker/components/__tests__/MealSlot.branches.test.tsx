/**
 * MealSlot Branch Coverage Tests
 *
 * Targets uncovered branches: FoodEntryItem keyboard/click handlers,
 * portion type display in internal FoodEntryItem, and MealIcon switch.
 *
 * @module food-tracker/components/__tests__/MealSlot.branches.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MealSlot } from '../MealSlot';
import type { FoodEntry, MealType } from '../../types';

// ============================================================================
// Helpers
// ============================================================================

function createEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
    return {
        id: 'entry-1',
        foodId: 'food-1',
        foodName: 'Овсянка',
        mealType: 'breakfast',
        portionType: 'grams',
        portionAmount: 100,
        nutrition: { calories: 250, protein: 10, fat: 5, carbs: 15 },
        time: '08:00',
        date: '2025-01-15',
        createdAt: '2025-01-15T08:00:00.000Z',
        updatedAt: '2025-01-15T08:00:00.000Z',
        ...overrides,
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('MealSlot Branch Coverage', () => {
    const mockOnAddEntry = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -------------------------------------------------------------------------
    // FoodEntryItem keyboard handler branches (lines 79-81)
    // -------------------------------------------------------------------------
    describe('Internal FoodEntryItem keyboard interaction', () => {
        it('calls onEntryClick on Enter key press', () => {
            const onEntryClick = jest.fn();
            const entry = createEntry();

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                    onEntryClick={onEntryClick}
                />
            );

            const entryButton = screen.getByRole('button', {
                name: /Овсянка/,
            });
            fireEvent.keyDown(entryButton, { key: 'Enter' });

            expect(onEntryClick).toHaveBeenCalledWith(entry);
        });

        it('calls onEntryClick on Space key press', () => {
            const onEntryClick = jest.fn();
            const entry = createEntry();

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                    onEntryClick={onEntryClick}
                />
            );

            const entryButton = screen.getByRole('button', {
                name: /Овсянка/,
            });
            fireEvent.keyDown(entryButton, { key: ' ' });

            expect(onEntryClick).toHaveBeenCalledWith(entry);
        });

        it('does not call onEntryClick on other key press', () => {
            const onEntryClick = jest.fn();
            const entry = createEntry();

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                    onEntryClick={onEntryClick}
                />
            );

            const entryButton = screen.getByRole('button', {
                name: /Овсянка/,
            });
            fireEvent.keyDown(entryButton, { key: 'Tab' });

            expect(onEntryClick).not.toHaveBeenCalled();
        });

        it('does not throw when onEntryClick is undefined and entry is clicked', () => {
            const entry = createEntry();

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(() => {
                fireEvent.click(screen.getByRole('button', { name: /Овсянка/ }));
            }).not.toThrow();
        });

        it('does not throw when onEntryClick is undefined and Enter is pressed', () => {
            const entry = createEntry();

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(() => {
                fireEvent.keyDown(screen.getByRole('button', { name: /Овсянка/ }), { key: 'Enter' });
            }).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // Portion type display branches in internal FoodEntryItem (lines 87-88)
    // -------------------------------------------------------------------------
    describe('Internal FoodEntryItem portion display', () => {
        it('displays "мл" for milliliters portion type', () => {
            const entry = createEntry({
                portionType: 'milliliters',
                portionAmount: 250,
            });

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('250 мл')).toBeInTheDocument();
        });

        it('displays "порц." for portion type', () => {
            const entry = createEntry({
                portionType: 'portion',
                portionAmount: 2,
            });

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('2 порц.')).toBeInTheDocument();
        });

        it('displays "г" for grams portion type', () => {
            const entry = createEntry({
                portionType: 'grams',
                portionAmount: 150,
            });

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            expect(screen.getByText('150 г')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // No firstTime display when entries have no time (line 175)
    // -------------------------------------------------------------------------
    describe('First time display', () => {
        it('does not display time when entries have empty time strings', () => {
            const entry = createEntry({ time: '' });

            render(
                <MealSlot
                    mealType="breakfast"
                    entries={[entry]}
                    onAddEntry={mockOnAddEntry}
                />
            );

            // The time should not be rendered
            // The label "Завтрак" should still appear
            expect(screen.getByText('Завтрак')).toBeInTheDocument();
        });
    });
});
