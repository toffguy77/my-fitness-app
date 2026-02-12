/**
 * KBZHUSummary Component Unit Tests
 *
 * Tests for КБЖУ display, progress bars, and color coding.
 *
 * @module food-tracker/components/__tests__/KBZHUSummary.test
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { KBZHUSummary } from '../KBZHUSummary';
import type { KBZHU } from '../../types';

// ============================================================================
// Test Helpers
// ============================================================================

const createKBZHU = (
    calories: number,
    protein: number,
    fat: number,
    carbs: number
): KBZHU => ({
    calories,
    protein,
    fat,
    carbs,
});

// ============================================================================
// Tests
// ============================================================================

describe('KBZHUSummary', () => {
    describe('Display with Various Values', () => {
        it('displays all four macro labels in Russian', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByText('Ккал')).toBeInTheDocument();
            expect(screen.getByText('Белки')).toBeInTheDocument();
            expect(screen.getByText('Жиры')).toBeInTheDocument();
            expect(screen.getByText('Углеводы')).toBeInTheDocument();
        });

        it('displays current/target format correctly', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByText('1500 / 2000')).toBeInTheDocument();
            expect(screen.getByText('100 / 150 г')).toBeInTheDocument();
            expect(screen.getByText('60 / 80 г')).toBeInTheDocument();
            expect(screen.getByText('180 / 250 г')).toBeInTheDocument();
        });

        it('rounds values to whole numbers for display', () => {
            const current = createKBZHU(1523.7, 99.5, 60.3, 179.8);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByText('1524 / 2000')).toBeInTheDocument();
            expect(screen.getByText('100 / 150 г')).toBeInTheDocument();
        });

        it('displays zero values correctly', () => {
            const current = createKBZHU(0, 0, 0, 0);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByText('0 / 2000')).toBeInTheDocument();
            expect(screen.getByText('0 / 150 г')).toBeInTheDocument();
        });

        it('displays header "Дневная норма"', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByText('Дневная норма')).toBeInTheDocument();
        });
    });

    describe('Missing Target Display', () => {
        it('displays "-" when target is null', () => {
            const current = createKBZHU(1500, 100, 60, 180);

            render(<KBZHUSummary current={current} target={null} />);

            expect(screen.getByText('1500 / -')).toBeInTheDocument();
            expect(screen.getByText('100 / - г')).toBeInTheDocument();
        });

        it('displays "-" for individual missing target values', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = { calories: 2000, protein: undefined, fat: 80, carbs: undefined };

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByText('1500 / 2000')).toBeInTheDocument();
            expect(screen.getByText('100 / - г')).toBeInTheDocument();
            expect(screen.getByText('60 / 80 г')).toBeInTheDocument();
            expect(screen.getByText('180 / - г')).toBeInTheDocument();
        });

        it('displays "-" when target value is 0', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(0, 150, 0, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByText('1500 / -')).toBeInTheDocument();
            expect(screen.getByText('60 / - г')).toBeInTheDocument();
        });
    });

    describe('Color Coding at Boundary Values', () => {
        it('shows green progress bar at 80% (boundary)', () => {
            const current = createKBZHU(1600, 120, 64, 200); // 80% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for green progress bars
            const greenBars = container.querySelectorAll('.bg-green-500');
            expect(greenBars.length).toBeGreaterThan(0);
        });

        it('shows green progress bar at 100% (boundary)', () => {
            const current = createKBZHU(2000, 150, 80, 250); // 100% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for green progress bars
            const greenBars = container.querySelectorAll('.bg-green-500');
            expect(greenBars.length).toBeGreaterThan(0);
        });

        it('shows yellow progress bar at 50% (boundary)', () => {
            const current = createKBZHU(1000, 75, 40, 125); // 50% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for yellow progress bars
            const yellowBars = container.querySelectorAll('.bg-yellow-500');
            expect(yellowBars.length).toBeGreaterThan(0);
        });

        it('shows yellow progress bar at 79% (boundary)', () => {
            const current = createKBZHU(1580, 118.5, 63.2, 197.5); // ~79% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for yellow progress bars
            const yellowBars = container.querySelectorAll('.bg-yellow-500');
            expect(yellowBars.length).toBeGreaterThan(0);
        });

        it('shows yellow progress bar at 101% (boundary)', () => {
            const current = createKBZHU(2020, 151.5, 80.8, 252.5); // ~101% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for yellow progress bars
            const yellowBars = container.querySelectorAll('.bg-yellow-500');
            expect(yellowBars.length).toBeGreaterThan(0);
        });

        it('shows yellow progress bar at 120% (boundary)', () => {
            const current = createKBZHU(2400, 180, 96, 300); // 120% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for yellow progress bars
            const yellowBars = container.querySelectorAll('.bg-yellow-500');
            expect(yellowBars.length).toBeGreaterThan(0);
        });

        it('shows red progress bar below 50%', () => {
            const current = createKBZHU(800, 60, 32, 100); // 40% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for red progress bars
            const redBars = container.querySelectorAll('.bg-red-500');
            expect(redBars.length).toBeGreaterThan(0);
        });

        it('shows red progress bar above 120%', () => {
            const current = createKBZHU(2500, 190, 100, 320); // >120% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for red progress bars
            const redBars = container.querySelectorAll('.bg-red-500');
            expect(redBars.length).toBeGreaterThan(0);
        });
    });

    describe('Exceeding Target Indicator', () => {
        it('shows exceeding indicator (↑) when current exceeds target', () => {
            const current = createKBZHU(2200, 160, 90, 280);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            // Should show exceeding indicators
            const exceedingIndicators = screen.getAllByText('↑');
            expect(exceedingIndicators.length).toBeGreaterThan(0);
        });

        it('does not show exceeding indicator when at or below target', () => {
            const current = createKBZHU(1800, 140, 70, 230);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.queryByText('↑')).not.toBeInTheDocument();
        });

        it('applies red text color when exceeding target', () => {
            const current = createKBZHU(2200, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Check for red text on exceeding values
            const redText = container.querySelectorAll('.text-red-600');
            expect(redText.length).toBeGreaterThan(0);
        });
    });

    describe('Progress Bar Behavior', () => {
        it('caps progress bar width at 100% even when exceeding', () => {
            const current = createKBZHU(3000, 200, 120, 400); // 150% of targets
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(<KBZHUSummary current={current} target={target} />);

            // Progress bars should have max width of 100%
            const progressBars = container.querySelectorAll('[role="progressbar"]');
            progressBars.forEach((bar) => {
                expect(bar).toHaveAttribute('aria-valuenow');
                const value = parseInt(bar.getAttribute('aria-valuenow') || '0', 10);
                expect(value).toBeLessThanOrEqual(100);
            });
        });

        it('shows 0% progress when no target is set', () => {
            const current = createKBZHU(1500, 100, 60, 180);

            const { container } = render(<KBZHUSummary current={current} target={null} />);

            const progressBars = container.querySelectorAll('[role="progressbar"]');
            progressBars.forEach((bar) => {
                expect(bar).toHaveAttribute('aria-valuenow', '0');
            });
        });
    });

    describe('Percentage Display', () => {
        it('displays percentage when target is set', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            // Should show percentage values (use getAllByText since some percentages may be the same)
            const percentages75 = screen.getAllByText('75%');
            expect(percentages75.length).toBeGreaterThan(0); // 1500/2000 and 60/80 both = 75%
            expect(screen.getByText('67%')).toBeInTheDocument(); // 100/150
            expect(screen.getByText('72%')).toBeInTheDocument(); // 180/250
        });

        it('does not display percentage when target is missing', () => {
            const current = createKBZHU(1500, 100, 60, 180);

            render(<KBZHUSummary current={current} target={null} />);

            // Should not show any percentage values
            expect(screen.queryByText('%')).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has proper section aria-label', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByRole('region', { name: 'Сводка КБЖУ за день' })).toBeInTheDocument();
        });

        it('has proper progressbar roles with aria attributes', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            const progressBars = screen.getAllByRole('progressbar');
            expect(progressBars).toHaveLength(4);

            progressBars.forEach((bar) => {
                expect(bar).toHaveAttribute('aria-valuemin', '0');
                expect(bar).toHaveAttribute('aria-valuemax', '100');
                expect(bar).toHaveAttribute('aria-valuenow');
                expect(bar).toHaveAttribute('aria-label');
            });
        });

        it('has descriptive aria-labels for each macro', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            render(<KBZHUSummary current={current} target={target} />);

            expect(screen.getByLabelText(/Ккал прогресс/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Белки прогресс/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Жиры прогресс/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Углеводы прогресс/)).toBeInTheDocument();
        });
    });

    describe('Custom className', () => {
        it('applies custom className to container', () => {
            const current = createKBZHU(1500, 100, 60, 180);
            const target = createKBZHU(2000, 150, 80, 250);

            const { container } = render(
                <KBZHUSummary
                    current={current}
                    target={target}
                    className="custom-class"
                />
            );

            expect(container.firstChild).toHaveClass('custom-class');
        });
    });
});
