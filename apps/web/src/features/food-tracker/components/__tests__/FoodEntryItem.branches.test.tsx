/**
 * FoodEntryItem Branch Coverage Tests
 *
 * Targets uncovered branches: click/keyboard callbacks, edit/delete handlers,
 * hover state, portion type display, and conditional action rendering.
 *
 * @module food-tracker/components/__tests__/FoodEntryItem.branches.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FoodEntryItem } from '../FoodEntryItem';
import type { FoodEntry } from '../../types';

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

describe('FoodEntryItem Branch Coverage', () => {
    // -------------------------------------------------------------------------
    // Click handler branch (line 71)
    // -------------------------------------------------------------------------
    describe('Click handler', () => {
        it('calls onClick with entry when clicked', async () => {
            const user = userEvent.setup();
            const onClick = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onClick={onClick} />);

            await user.click(screen.getByRole('button'));

            expect(onClick).toHaveBeenCalledWith(entry);
        });

        it('does not throw when onClick is not provided', async () => {
            const user = userEvent.setup();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} />);

            // Click without onClick handler should not throw
            await user.click(screen.getByRole('button'));
        });
    });

    // -------------------------------------------------------------------------
    // Keyboard handler branches (lines 77-79)
    // -------------------------------------------------------------------------
    describe('Keyboard handler', () => {
        it('calls onClick on Enter key', () => {
            const onClick = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onClick={onClick} />);

            fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

            expect(onClick).toHaveBeenCalledWith(entry);
        });

        it('calls onClick on Space key', () => {
            const onClick = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onClick={onClick} />);

            fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });

            expect(onClick).toHaveBeenCalledWith(entry);
        });

        it('does not call onClick on other keys', () => {
            const onClick = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onClick={onClick} />);

            fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });

            expect(onClick).not.toHaveBeenCalled();
        });

        it('does not throw on Enter when onClick is not provided', () => {
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} />);

            expect(() => {
                fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
            }).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // Edit handler branch (lines 88-89)
    // -------------------------------------------------------------------------
    describe('Edit handler', () => {
        it('calls onEdit when edit button is clicked', async () => {
            const user = userEvent.setup();
            const onEdit = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onEdit={onEdit} />);

            const itemButton = screen.getByLabelText(
                `${entry.foodName}, 200 г, 300 ккал`
            );
            fireEvent.mouseEnter(itemButton);

            await user.click(screen.getByLabelText(`Редактировать ${entry.foodName}`));

            expect(onEdit).toHaveBeenCalledWith(entry);
        });

        it('stops propagation on edit click', async () => {
            const user = userEvent.setup();
            const onEdit = jest.fn();
            const onClick = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onClick={onClick} onEdit={onEdit} />);

            const itemButton = screen.getByLabelText(
                `${entry.foodName}, 200 г, 300 ккал`
            );
            fireEvent.mouseEnter(itemButton);

            await user.click(screen.getByLabelText(`Редактировать ${entry.foodName}`));

            expect(onEdit).toHaveBeenCalled();
            // onClick should NOT be called because stopPropagation
            expect(onClick).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // Delete handler branch (lines 97-98)
    // -------------------------------------------------------------------------
    describe('Delete handler', () => {
        it('calls onDelete when delete button is clicked', async () => {
            const user = userEvent.setup();
            const onDelete = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onDelete={onDelete} />);

            const itemButton = screen.getByLabelText(
                `${entry.foodName}, 200 г, 300 ккал`
            );
            fireEvent.mouseEnter(itemButton);

            await user.click(screen.getByLabelText(`Удалить ${entry.foodName}`));

            expect(onDelete).toHaveBeenCalledWith(entry);
        });

        it('stops propagation on delete click', async () => {
            const user = userEvent.setup();
            const onDelete = jest.fn();
            const onClick = jest.fn();
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onClick={onClick} onDelete={onDelete} />);

            const itemButton = screen.getByLabelText(
                `${entry.foodName}, 200 г, 300 ккал`
            );
            fireEvent.mouseEnter(itemButton);

            await user.click(screen.getByLabelText(`Удалить ${entry.foodName}`));

            expect(onDelete).toHaveBeenCalled();
            expect(onClick).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // Hover state visibility (lines 123-124)
    // -------------------------------------------------------------------------
    describe('Hover state', () => {
        it('shows action buttons on mouse enter', () => {
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onEdit={jest.fn()} onDelete={jest.fn()} />);

            const itemButton = screen.getByLabelText(
                `${entry.foodName}, 200 г, 300 ккал`
            );
            fireEvent.mouseEnter(itemButton);

            const editBtn = screen.getByLabelText(`Редактировать ${entry.foodName}`);
            expect(editBtn.closest('div')).toHaveClass('opacity-100');
        });

        it('hides action buttons on mouse leave', () => {
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onEdit={jest.fn()} onDelete={jest.fn()} />);

            const itemButton = screen.getByLabelText(
                `${entry.foodName}, 200 г, 300 ккал`
            );
            fireEvent.mouseEnter(itemButton);
            fireEvent.mouseLeave(itemButton);

            const editBtn = screen.getByLabelText(`Редактировать ${entry.foodName}`);
            expect(editBtn.closest('div')).toHaveClass('opacity-0');
        });
    });

    // -------------------------------------------------------------------------
    // Conditional action buttons rendering (line 141)
    // -------------------------------------------------------------------------
    describe('Conditional action rendering', () => {
        it('does not render action buttons when neither onEdit nor onDelete is provided', () => {
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} />);

            expect(screen.queryByLabelText(/Редактировать/)).not.toBeInTheDocument();
            expect(screen.queryByLabelText(/Удалить/)).not.toBeInTheDocument();
        });

        it('renders only edit button when only onEdit is provided', () => {
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onEdit={jest.fn()} />);

            expect(screen.getByLabelText(`Редактировать ${entry.foodName}`)).toBeInTheDocument();
            expect(screen.queryByLabelText(`Удалить ${entry.foodName}`)).not.toBeInTheDocument();
        });

        it('renders only delete button when only onDelete is provided', () => {
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onDelete={jest.fn()} />);

            expect(screen.queryByLabelText(`Редактировать ${entry.foodName}`)).not.toBeInTheDocument();
            expect(screen.getByLabelText(`Удалить ${entry.foodName}`)).toBeInTheDocument();
        });

        it('renders both buttons when both onEdit and onDelete are provided', () => {
            const entry = createEntry();

            render(<FoodEntryItem entry={entry} onEdit={jest.fn()} onDelete={jest.fn()} />);

            expect(screen.getByLabelText(`Редактировать ${entry.foodName}`)).toBeInTheDocument();
            expect(screen.getByLabelText(`Удалить ${entry.foodName}`)).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Portion type display branches (lines 43-52)
    // -------------------------------------------------------------------------
    describe('Portion type display', () => {
        it('displays "г" for grams', () => {
            const entry = createEntry({ portionType: 'grams', portionAmount: 150 });
            render(<FoodEntryItem entry={entry} />);
            expect(screen.getByText('150 г')).toBeInTheDocument();
        });

        it('displays "мл" for milliliters', () => {
            const entry = createEntry({ portionType: 'milliliters', portionAmount: 250 });
            render(<FoodEntryItem entry={entry} />);
            expect(screen.getByText('250 мл')).toBeInTheDocument();
        });

        it('displays "порц." for portion', () => {
            const entry = createEntry({ portionType: 'portion', portionAmount: 2 });
            render(<FoodEntryItem entry={entry} />);
            expect(screen.getByText('2 порц.')).toBeInTheDocument();
        });

        it('defaults to "г" for unknown portion type', () => {
            const entry = createEntry({ portionType: 'unknown' as any, portionAmount: 100 });
            render(<FoodEntryItem entry={entry} />);
            expect(screen.getByText('100 г')).toBeInTheDocument();
        });
    });

    // -------------------------------------------------------------------------
    // Custom className (line 125)
    // -------------------------------------------------------------------------
    describe('Custom className', () => {
        it('applies custom className', () => {
            const entry = createEntry();
            const { container } = render(
                <FoodEntryItem entry={entry} className="my-custom-class" />
            );

            expect(container.firstChild).toHaveClass('my-custom-class');
        });
    });
});
