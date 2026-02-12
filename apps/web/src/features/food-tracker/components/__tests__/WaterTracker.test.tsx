/**
 * WaterTracker Unit Tests
 *
 * Tests for water tracking component display and interactions.
 *
 * @module food-tracker/components/__tests__/WaterTracker.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaterTracker } from '../WaterTracker';
import type { WaterLog } from '../../types';

// ============================================================================
// Test Data
// ============================================================================

const createWaterLog = (overrides: Partial<WaterLog> = {}): WaterLog => ({
    date: '2024-01-15',
    glasses: 3,
    goal: 8,
    glassSize: 250,
    ...overrides,
});

// ============================================================================
// Display Tests
// ============================================================================

describe('WaterTracker', () => {
    describe('Display Format', () => {
        it('displays water intake in Russian format "X / Y стаканов"', () => {
            const waterLog = createWaterLog({ glasses: 5, goal: 10 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.getByText('5 / 10 стаканов')).toBeInTheDocument();
        });

        it('displays glass size in ml format', () => {
            const waterLog = createWaterLog({ glassSize: 300 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.getByText('300 мл')).toBeInTheDocument();
        });

        it('displays default values when waterLog is null', () => {
            render(<WaterTracker waterLog={null} onAddGlass={jest.fn()} />);

            expect(screen.getByText('0 / 8 стаканов')).toBeInTheDocument();
            expect(screen.getByText('250 мл')).toBeInTheDocument();
        });

        it('displays section header "Вода"', () => {
            render(<WaterTracker waterLog={createWaterLog()} onAddGlass={jest.fn()} />);

            expect(screen.getByText('Вода')).toBeInTheDocument();
        });

        it('displays add button with Russian text "Добавить стакан"', () => {
            render(<WaterTracker waterLog={createWaterLog()} onAddGlass={jest.fn()} />);

            expect(screen.getByText('Добавить стакан')).toBeInTheDocument();
        });
    });

    describe('Goal Completion Indicator', () => {
        it('shows "Цель достигнута" when glasses equals goal', () => {
            const waterLog = createWaterLog({ glasses: 8, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.getByText('Цель достигнута')).toBeInTheDocument();
        });

        it('shows "Цель достигнута" when glasses exceeds goal', () => {
            const waterLog = createWaterLog({ glasses: 10, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.getByText('Цель достигнута')).toBeInTheDocument();
        });

        it('does not show completion indicator when glasses is below goal', () => {
            const waterLog = createWaterLog({ glasses: 7, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.queryByText('Цель достигнута')).not.toBeInTheDocument();
        });

        it('does not show completion indicator when glasses is 0', () => {
            const waterLog = createWaterLog({ glasses: 0, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.queryByText('Цель достигнута')).not.toBeInTheDocument();
        });
    });

    describe('Progress Bar', () => {
        it('renders progress bar with correct aria attributes', () => {
            const waterLog = createWaterLog({ glasses: 4, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-valuenow', '50');
            expect(progressBar).toHaveAttribute('aria-valuemin', '0');
            expect(progressBar).toHaveAttribute('aria-valuemax', '100');
        });

        it('caps progress at 100% when exceeding goal', () => {
            const waterLog = createWaterLog({ glasses: 12, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-valuenow', '100');
        });

        it('shows 0% progress when no glasses consumed', () => {
            const waterLog = createWaterLog({ glasses: 0, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-valuenow', '0');
        });

        it('has accessible label for progress bar', () => {
            const waterLog = createWaterLog({ glasses: 4, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-label', 'Прогресс воды: 50%');
        });
    });

    describe('Add Glass Functionality', () => {
        it('calls onAddGlass when add button is clicked', () => {
            const onAddGlass = jest.fn();
            render(<WaterTracker waterLog={createWaterLog()} onAddGlass={onAddGlass} />);

            const addButton = screen.getByRole('button', { name: /добавить стакан/i });
            fireEvent.click(addButton);

            expect(onAddGlass).toHaveBeenCalledTimes(1);
        });

        it('does not call onAddGlass when loading', () => {
            const onAddGlass = jest.fn();
            render(
                <WaterTracker
                    waterLog={createWaterLog()}
                    onAddGlass={onAddGlass}
                    isLoading={true}
                />
            );

            const addButton = screen.getByRole('button', { name: /добавить стакан/i });
            fireEvent.click(addButton);

            expect(onAddGlass).not.toHaveBeenCalled();
        });

        it('disables add button when loading', () => {
            render(
                <WaterTracker
                    waterLog={createWaterLog()}
                    onAddGlass={jest.fn()}
                    isLoading={true}
                />
            );

            const addButton = screen.getByRole('button', { name: /добавить стакан/i });
            expect(addButton).toBeDisabled();
        });

        it('enables add button when not loading', () => {
            render(
                <WaterTracker
                    waterLog={createWaterLog()}
                    onAddGlass={jest.fn()}
                    isLoading={false}
                />
            );

            const addButton = screen.getByRole('button', { name: /добавить стакан/i });
            expect(addButton).not.toBeDisabled();
        });
    });

    describe('Accessibility', () => {
        it('has accessible section label', () => {
            render(<WaterTracker waterLog={createWaterLog()} onAddGlass={jest.fn()} />);

            expect(screen.getByRole('region', { name: /отслеживание воды/i })).toBeInTheDocument();
        });

        it('has accessible aria-label for water display', () => {
            const waterLog = createWaterLog({ glasses: 5, goal: 10 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.getByLabelText('Выпито 5 из 10 стаканов')).toBeInTheDocument();
        });

        it('has accessible aria-label for add button', () => {
            render(<WaterTracker waterLog={createWaterLog()} onAddGlass={jest.fn()} />);

            expect(screen.getByRole('button', { name: 'Добавить стакан воды' })).toBeInTheDocument();
        });

        it('add button has focus-visible styles', () => {
            render(<WaterTracker waterLog={createWaterLog()} onAddGlass={jest.fn()} />);

            const addButton = screen.getByRole('button', { name: /добавить стакан/i });
            expect(addButton).toHaveClass('focus-visible:ring-2');
        });
    });

    describe('Styling', () => {
        it('applies custom className', () => {
            const { container } = render(
                <WaterTracker
                    waterLog={createWaterLog()}
                    onAddGlass={jest.fn()}
                    className="custom-class"
                />
            );

            expect(container.firstChild).toHaveClass('custom-class');
        });

        it('applies green color to text when goal is reached', () => {
            const waterLog = createWaterLog({ glasses: 8, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            const displayText = screen.getByText('8 / 8 стаканов');
            expect(displayText).toHaveClass('text-green-600');
        });

        it('applies default color to text when goal is not reached', () => {
            const waterLog = createWaterLog({ glasses: 5, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            const displayText = screen.getByText('5 / 8 стаканов');
            expect(displayText).toHaveClass('text-gray-900');
        });

        it('applies loading styles to button when loading', () => {
            render(
                <WaterTracker
                    waterLog={createWaterLog()}
                    onAddGlass={jest.fn()}
                    isLoading={true}
                />
            );

            const addButton = screen.getByRole('button', { name: /добавить стакан/i });
            expect(addButton).toHaveClass('cursor-not-allowed');
            expect(addButton).toHaveClass('bg-gray-100');
        });
    });

    describe('Edge Cases', () => {
        it('handles zero goal gracefully', () => {
            const waterLog = createWaterLog({ glasses: 5, goal: 0 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            // Should display without crashing
            expect(screen.getByText('5 / 0 стаканов')).toBeInTheDocument();

            // Progress should be 0 to avoid division by zero
            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-valuenow', '0');
        });

        it('handles very large glass counts', () => {
            const waterLog = createWaterLog({ glasses: 100, goal: 8 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.getByText('100 / 8 стаканов')).toBeInTheDocument();
            expect(screen.getByText('Цель достигнута')).toBeInTheDocument();
        });

        it('handles different glass sizes', () => {
            const waterLog = createWaterLog({ glassSize: 500 });
            render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

            expect(screen.getByText('500 мл')).toBeInTheDocument();
        });
    });
});
