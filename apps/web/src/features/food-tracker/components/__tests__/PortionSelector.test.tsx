/**
 * PortionSelector Unit Tests
 *
 * Tests for the PortionSelector component functionality.
 *
 * @module food-tracker/components/__tests__/PortionSelector.test
 */

import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortionSelector } from '../PortionSelector';
import type { FoodItem, PortionType, KBZHU } from '../../types';

// ============================================================================
// Test Data
// ============================================================================

const createMockFood = (overrides: Partial<FoodItem> = {}): FoodItem => ({
    id: 'food-1',
    name: 'Яблоко',
    category: 'Фрукты',
    servingSize: 150,
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

// ============================================================================
// Tests
// ============================================================================

describe('PortionSelector', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Element.prototype.scrollIntoView = jest.fn();
    });

    afterEach(() => {
        cleanup();
    });

    describe('Initial Rendering', () => {
        it('renders portion type toggle with Russian labels', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            expect(screen.getByRole('tab', { name: /граммы/i })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: /миллилитры/i })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: /порция/i })).toBeInTheDocument();
        });

        it('renders numeric input', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            expect(screen.getByRole('spinbutton', { name: /количество порции/i })).toBeInTheDocument();
        });

        it('renders slider', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            expect(screen.getByRole('slider', { name: /ползунок порции/i })).toBeInTheDocument();
        });

        it('renders quick portion buttons', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            // Default is grams, should show gram quick portions
            expect(screen.getByRole('button', { name: /^50 г$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^100 г$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^150 г$/i })).toBeInTheDocument();
        });

        it('renders КБЖУ display with Russian labels', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            expect(screen.getByText('Пищевая ценность')).toBeInTheDocument();
            expect(screen.getByText('Ккал')).toBeInTheDocument();
            expect(screen.getByText('Белки')).toBeInTheDocument();
            expect(screen.getByText('Жиры')).toBeInTheDocument();
            expect(screen.getByText('Углеводы')).toBeInTheDocument();
        });

        it('uses initial portion type and amount', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    initialPortionType="milliliters"
                    initialAmount={250}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            expect(input).toHaveValue(250);
            expect(screen.getByRole('tab', { name: /миллилитры/i })).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('Portion Type Switching', () => {
        it('switches to milliliters when clicked', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const mlTab = screen.getByRole('tab', { name: /миллилитры/i });
            await user.click(mlTab);

            expect(mlTab).toHaveAttribute('aria-selected', 'true');
            // Should show ml quick portions
            expect(screen.getByRole('button', { name: /100 мл/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /250 мл/i })).toBeInTheDocument();
        });

        it('switches to portion when clicked', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const portionTab = screen.getByRole('tab', { name: /порция/i });
            await user.click(portionTab);

            expect(portionTab).toHaveAttribute('aria-selected', 'true');
            // Should show portion quick buttons
            expect(screen.getByRole('button', { name: /0.5 шт/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /1 шт/i })).toBeInTheDocument();
        });

        it('resets amount when switching portion type', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    initialAmount={200}
                    onPortionChange={jest.fn()}
                />
            );

            const portionTab = screen.getByRole('tab', { name: /порция/i });
            await user.click(portionTab);

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            // Should reset to default for portion type (1)
            expect(input).toHaveValue(1);
        });
    });

    describe('КБЖУ Calculation Display', () => {
        it('displays calculated КБЖУ for default 100g', () => {
            const mockFood = createMockFood({
                nutritionPer100: {
                    calories: 100,
                    protein: 10,
                    fat: 5,
                    carbs: 20,
                },
            });

            render(
                <PortionSelector
                    food={mockFood}
                    initialAmount={100}
                    onPortionChange={jest.fn()}
                />
            );

            // For 100g, values should match nutritionPer100
            expect(screen.getByText('100')).toBeInTheDocument(); // calories
        });

        it('updates КБЖУ when portion changes', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood({
                nutritionPer100: {
                    calories: 100,
                    protein: 10,
                    fat: 5,
                    carbs: 20,
                },
            });

            render(
                <PortionSelector
                    food={mockFood}
                    initialAmount={100}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '200');

            // For 200g, calories should be 200
            await waitFor(() => {
                expect(screen.getByText('200')).toBeInTheDocument();
            });
        });

        it('calculates КБЖУ correctly for portion type', async () => {
            const user = userEvent.setup();
            const mockFood = createMockFood({
                servingSize: 100, // 100g per portion
                nutritionPer100: {
                    calories: 100,
                    protein: 10,
                    fat: 5,
                    carbs: 20,
                },
            });

            render(
                <PortionSelector
                    food={mockFood}
                    onPortionChange={jest.fn()}
                />
            );

            // Switch to portion type
            const portionTab = screen.getByRole('tab', { name: /порция/i });
            await user.click(portionTab);

            // Default is 1 portion = 100g = 100 calories
            await waitFor(() => {
                expect(screen.getByText('100')).toBeInTheDocument();
            });
        });
    });

    describe('Validation Errors', () => {
        it('shows error for negative value in Russian', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '-10');

            await waitFor(() => {
                const error = screen.getByRole('alert');
                expect(error).toBeInTheDocument();
                // Should be in Russian
                expect(/[а-яА-ЯёЁ]/.test(error.textContent || '')).toBe(true);
            });
        });

        it('shows error for zero value in Russian', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '0');

            await waitFor(() => {
                const error = screen.getByRole('alert');
                expect(error).toBeInTheDocument();
                expect(/[а-яА-ЯёЁ]/.test(error.textContent || '')).toBe(true);
            });
        });

        it('shows error for empty input in Russian', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);

            await waitFor(() => {
                const error = screen.getByRole('alert');
                expect(error).toBeInTheDocument();
                expect(/[а-яА-ЯёЁ]/.test(error.textContent || '')).toBe(true);
            });
        });

        it('shows error for exceeding maximum in Russian', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '3000');

            await waitFor(() => {
                const error = screen.getByRole('alert');
                expect(error).toBeInTheDocument();
                expect(error.textContent).toContain('2000');
            });
        });

        it('clears error when valid value entered', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });

            // Enter invalid value
            await user.clear(input);
            await user.type(input, '-10');

            await waitFor(() => {
                expect(screen.getByRole('alert')).toBeInTheDocument();
            });

            // Enter valid value
            await user.clear(input);
            await user.type(input, '100');

            await waitFor(() => {
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            });
        });

        it('resets to valid value on blur when input is empty', async () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    initialAmount={150}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });

            // Clear input - this sets inputValue to ''
            fireEvent.change(input, { target: { value: '' } });

            // Wait for state update, then blur
            await waitFor(() => {
                expect(screen.getByRole('alert')).toBeInTheDocument();
            });

            fireEvent.blur(input);

            // Should reset to previous valid value and clear error
            await waitFor(() => {
                expect(input).toHaveValue(150);
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            });
        });

        it('resets to valid value on blur when input is NaN', async () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    initialAmount={200}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });

            // Set non-numeric value directly
            fireEvent.change(input, { target: { value: 'abc' } });

            // Wait for state update, then blur
            await waitFor(() => {
                expect(screen.getByRole('alert')).toBeInTheDocument();
            });

            fireEvent.blur(input);

            // Should reset to previous valid value and clear error
            await waitFor(() => {
                expect(input).toHaveValue(200);
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            });
        });
    });

    describe('Slider Interaction', () => {
        it('updates input when slider changes', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    initialAmount={100}
                    onPortionChange={jest.fn()}
                />
            );

            const slider = screen.getByRole('slider', { name: /ползунок порции/i });
            fireEvent.change(slider, { target: { value: '150' } });

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            expect(input).toHaveValue(150);
        });

        it('has correct min and max for grams', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const slider = screen.getByRole('slider', { name: /ползунок порции/i });
            expect(slider).toHaveAttribute('min', '1');
            expect(slider).toHaveAttribute('max', '2000');
        });

        it('has correct min and max for portions', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const portionTab = screen.getByRole('tab', { name: /порция/i });
            await user.click(portionTab);

            const slider = screen.getByRole('slider', { name: /ползунок порции/i });
            expect(slider).toHaveAttribute('min', '1');
            expect(slider).toHaveAttribute('max', '10');
        });
    });

    describe('Quick Portion Buttons', () => {
        it('updates amount when quick button clicked', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    initialAmount={100}
                    onPortionChange={jest.fn()}
                />
            );

            const quickButton = screen.getByRole('button', { name: /150 г/i });
            await user.click(quickButton);

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            expect(input).toHaveValue(150);
        });

        it('highlights selected quick button', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    initialAmount={100}
                    onPortionChange={jest.fn()}
                />
            );

            const quickButton = screen.getByRole('button', { name: /100 г/i });
            expect(quickButton).toHaveAttribute('aria-pressed', 'true');

            const otherButton = screen.getByRole('button', { name: /150 г/i });
            expect(otherButton).toHaveAttribute('aria-pressed', 'false');
        });
    });

    describe('Callback Behavior', () => {
        it('calls onPortionChange with correct values', async () => {
            const user = userEvent.setup();
            const onPortionChange = jest.fn();
            const mockFood = createMockFood({
                nutritionPer100: {
                    calories: 100,
                    protein: 10,
                    fat: 5,
                    carbs: 20,
                },
            });

            render(
                <PortionSelector
                    food={mockFood}
                    initialAmount={100}
                    onPortionChange={onPortionChange}
                />
            );

            // Initial call
            await waitFor(() => {
                expect(onPortionChange).toHaveBeenCalledWith(
                    'grams',
                    100,
                    expect.objectContaining({
                        calories: 100,
                        protein: 10,
                        fat: 5,
                        carbs: 20,
                    })
                );
            });

            // Change amount
            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '200');

            await waitFor(() => {
                expect(onPortionChange).toHaveBeenCalledWith(
                    'grams',
                    200,
                    expect.objectContaining({
                        calories: 200,
                    })
                );
            });
        });

        it('does not call onPortionChange when error exists', async () => {
            const user = userEvent.setup();
            const onPortionChange = jest.fn();

            render(
                <PortionSelector
                    food={createMockFood()}
                    initialAmount={100}
                    onPortionChange={onPortionChange}
                />
            );

            // Clear initial calls
            onPortionChange.mockClear();

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '-10');

            // Should not call with invalid value
            await waitFor(() => {
                expect(onPortionChange).not.toHaveBeenCalledWith(
                    expect.anything(),
                    -10,
                    expect.anything()
                );
            });
        });
    });

    describe('Disabled State', () => {
        it('disables all inputs when disabled prop is true', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                    disabled
                />
            );

            expect(screen.getByRole('spinbutton', { name: /количество порции/i })).toBeDisabled();
            expect(screen.getByRole('slider', { name: /ползунок порции/i })).toBeDisabled();

            const tabs = screen.getAllByRole('tab');
            tabs.forEach(tab => {
                expect(tab).toBeDisabled();
            });

            const quickButtons = screen.getAllByRole('button');
            quickButtons.forEach(button => {
                expect(button).toBeDisabled();
            });
        });
    });

    describe('Accessibility', () => {
        it('has accessible portion type tabs', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const tablist = screen.getByRole('tablist', { name: /тип порции/i });
            expect(tablist).toBeInTheDocument();
        });

        it('has accessible input with label', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            expect(screen.getByRole('spinbutton', { name: /количество порции/i })).toBeInTheDocument();
        });

        it('has accessible slider with label', () => {
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            expect(screen.getByRole('slider', { name: /ползунок порции/i })).toBeInTheDocument();
        });

        it('marks input as invalid when error exists', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '-10');

            await waitFor(() => {
                expect(input).toHaveAttribute('aria-invalid', 'true');
            });
        });

        it('associates error message with input', async () => {
            const user = userEvent.setup();
            render(
                <PortionSelector
                    food={createMockFood()}
                    onPortionChange={jest.fn()}
                />
            );

            const input = screen.getByRole('spinbutton', { name: /количество порции/i });
            await user.clear(input);
            await user.type(input, '-10');

            await waitFor(() => {
                expect(input).toHaveAttribute('aria-describedby', 'portion-error');
                expect(screen.getByRole('alert')).toHaveAttribute('id', 'portion-error');
            });
        });
    });
});
