/**
 * VirtualizedFoodList Unit Tests
 *
 * Tests for the virtualized food list component.
 *
 * @module food-tracker/components/__tests__/VirtualizedFoodList.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VirtualizedFoodList } from '../VirtualizedFoodList';
import type { FoodItem } from '../../types';

// Mock react-window to pass rowProps through to row components
jest.mock('react-window', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    List: ({ rowComponent: RowComponent, rowCount, rowHeight, rowProps, defaultHeight }: any) => {
        const rows = [];
        for (let index = 0; index < Math.min(rowCount, 5); index++) {
            const style = {
                position: 'absolute' as const,
                top: index * (rowHeight || 72),
                height: rowHeight || 72,
                width: '100%',
            };
            rows.push(
                <RowComponent key={index} index={index} style={style} {...(rowProps || {})} />
            );
        }
        return (
            <div data-testid="react-window-list" style={{ height: defaultHeight || 400 }}>
                {rows}
            </div>
        );
    },
}));

// ============================================================================
// Helpers
// ============================================================================

function createFoodItem(overrides: Partial<FoodItem> = {}): FoodItem {
    return {
        id: `food-${Math.random().toString(36).slice(2)}`,
        name: 'Куриная грудка',
        category: 'meat',
        servingSize: 100,
        servingUnit: 'г',
        nutritionPer100: {
            calories: 165,
            protein: 31,
            fat: 3.6,
            carbs: 0,
        },
        source: 'database',
        verified: true,
        ...overrides,
    };
}

function createFoodItems(count: number): FoodItem[] {
    return Array.from({ length: count }, (_, i) =>
        createFoodItem({
            id: `food-${i}`,
            name: `Продукт ${i + 1}`,
            nutritionPer100: {
                calories: 100 + i * 10,
                protein: 10 + i,
                fat: 5 + i,
                carbs: 20 + i,
            },
        })
    );
}

// ============================================================================
// Tests
// ============================================================================

describe('VirtualizedFoodList', () => {
    describe('Small List Rendering (< 50 items)', () => {
        it('renders all food items in a regular list', () => {
            const foods = createFoodItems(5);
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            const listbox = screen.getByRole('listbox');
            expect(listbox).toBeInTheDocument();
            expect(listbox.tagName).toBe('UL');
        });

        it('renders food item names', () => {
            const foods = [
                createFoodItem({ name: 'Куриная грудка' }),
                createFoodItem({ name: 'Рис бурый' }),
            ];
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            expect(screen.getByText('Куриная грудка')).toBeInTheDocument();
            expect(screen.getByText('Рис бурый')).toBeInTheDocument();
        });

        it('renders calories for each item', () => {
            const foods = [
                createFoodItem({
                    nutritionPer100: { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
                }),
            ];
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            expect(screen.getByText('165 ккал')).toBeInTheDocument();
        });

        it('renders serving info for each item', () => {
            const foods = [
                createFoodItem({ servingSize: 100, servingUnit: 'г' }),
            ];
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            expect(screen.getByText('100 г')).toBeInTheDocument();
        });

        it('renders "на 100г" label for each item', () => {
            const foods = createFoodItems(2);
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            const labels = screen.getAllByText('на 100г');
            expect(labels).toHaveLength(2);
        });

        it('renders listbox with Russian aria-label', () => {
            const foods = createFoodItems(3);
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            expect(screen.getByRole('listbox', { name: 'Список продуктов' })).toBeInTheDocument();
        });

        it('renders items with role="option"', () => {
            const foods = createFoodItems(3);
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            const options = screen.getAllByRole('option');
            expect(options).toHaveLength(3);
        });

        it('applies custom className', () => {
            const foods = createFoodItems(2);
            render(
                <VirtualizedFoodList
                    foods={foods}
                    onSelect={jest.fn()}
                    className="custom-list-class"
                />
            );

            const listbox = screen.getByRole('listbox');
            expect(listbox).toHaveClass('custom-list-class');
        });
    });

    describe('Empty State', () => {
        it('renders empty listbox when no foods provided', () => {
            render(<VirtualizedFoodList foods={[]} onSelect={jest.fn()} />);

            const listbox = screen.getByRole('listbox');
            expect(listbox).toBeInTheDocument();
            expect(screen.queryAllByRole('option')).toHaveLength(0);
        });
    });

    describe('Item Selection', () => {
        it('calls onSelect when item is clicked', async () => {
            const user = userEvent.setup();
            const onSelect = jest.fn();
            const foods = [createFoodItem({ name: 'Куриная грудка' })];
            render(<VirtualizedFoodList foods={foods} onSelect={onSelect} />);

            await user.click(screen.getByRole('option'));

            expect(onSelect).toHaveBeenCalledTimes(1);
            expect(onSelect).toHaveBeenCalledWith(foods[0]);
        });

        it('calls onSelect when Enter key is pressed on item', () => {
            const onSelect = jest.fn();
            const foods = [createFoodItem({ name: 'Куриная грудка' })];
            render(<VirtualizedFoodList foods={foods} onSelect={onSelect} />);

            const option = screen.getByRole('option');
            fireEvent.keyDown(option, { key: 'Enter' });

            expect(onSelect).toHaveBeenCalledTimes(1);
            expect(onSelect).toHaveBeenCalledWith(foods[0]);
        });

        it('calls onSelect when Space key is pressed on item', () => {
            const onSelect = jest.fn();
            const foods = [createFoodItem({ name: 'Куриная грудка' })];
            render(<VirtualizedFoodList foods={foods} onSelect={onSelect} />);

            const option = screen.getByRole('option');
            fireEvent.keyDown(option, { key: ' ' });

            expect(onSelect).toHaveBeenCalledTimes(1);
        });

        it('does not call onSelect for other keys', () => {
            const onSelect = jest.fn();
            const foods = [createFoodItem()];
            render(<VirtualizedFoodList foods={foods} onSelect={onSelect} />);

            const option = screen.getByRole('option');
            fireEvent.keyDown(option, { key: 'Tab' });

            expect(onSelect).not.toHaveBeenCalled();
        });
    });

    describe('Accessibility', () => {
        it('renders items with descriptive aria-label', () => {
            const foods = [
                createFoodItem({
                    name: 'Куриная грудка',
                    servingSize: 100,
                    servingUnit: 'г',
                    nutritionPer100: { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
                }),
            ];
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            const option = screen.getByRole('option');
            expect(option).toHaveAttribute(
                'aria-label',
                'Куриная грудка, 100 г, 165 ккал'
            );
        });

        it('makes items focusable with tabIndex', () => {
            const foods = [createFoodItem()];
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            const option = screen.getByRole('option');
            expect(option).toHaveAttribute('tabIndex', '0');
        });
    });

    describe('Large List Rendering (>= 50 items)', () => {
        it('uses virtualized list for 50+ items', () => {
            const foods = createFoodItems(60);
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            expect(screen.getByTestId('react-window-list')).toBeInTheDocument();
        });

        it('renders listbox container with aria-label for large list', () => {
            const foods = createFoodItems(60);
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            expect(screen.getByRole('listbox', { name: 'Список продуктов' })).toBeInTheDocument();
        });

        it('renders food items in virtualized mode', () => {
            const foods = createFoodItems(60);
            render(<VirtualizedFoodList foods={foods} onSelect={jest.fn()} />);

            // Mock renders first 5 items
            expect(screen.getByText('Продукт 1')).toBeInTheDocument();
        });

        it('calls onSelect when clicking virtualized item', async () => {
            const user = userEvent.setup();
            const onSelect = jest.fn();
            const foods = createFoodItems(60);
            render(<VirtualizedFoodList foods={foods} onSelect={onSelect} />);

            const options = screen.getAllByRole('option');
            await user.click(options[0]);

            expect(onSelect).toHaveBeenCalledWith(foods[0]);
        });
    });
});
