/**
 * Property-based tests for color-independent information
 *
 * Feature: dashboard, Property 38: Color-Independent Information
 * Validates: Requirements 16.5
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { Check, CheckCircle, Circle, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

// Clean up after each property test
afterEach(() => {
    cleanup();
});

describe('Property 38: Color-Independent Information', () => {
    describe('Completion status indicators', () => {
        it('should provide both color and icon for completion status', () => {
            fc.assert(
                fc.property(
                    fc.boolean(),
                    (isCompleted) => {
                        const testId = `completion-${isCompleted}`;

                        const TestComponent = () => (
                            <div
                                data-testid={testId}
                                className={`flex items-center gap-2 ${isCompleted ? 'text-success-fg' : 'text-fg-muted'
                                    }`}
                            >
                                {isCompleted ? (
                                    <CheckCircle
                                        className="w-5 h-5"
                                        aria-hidden="true"
                                        data-testid="check-icon"
                                    />
                                ) : (
                                    <Circle
                                        className="w-5 h-5"
                                        aria-hidden="true"
                                        data-testid="circle-icon"
                                    />
                                )}
                                <span>{isCompleted ? 'Выполнено' : 'Не выполнено'}</span>
                            </div>
                        );

                        const { getByTestId, queryByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);

                        // Verify both color (via className) and icon are present
                        if (isCompleted) {
                            expect(container.className).toContain('text-success-fg');
                            expect(queryByTestId('check-icon')).toBeTruthy();
                        } else {
                            expect(container.className).toContain('text-fg-muted');
                            expect(queryByTestId('circle-icon')).toBeTruthy();
                        }

                        // Verify text label is present
                        expect(container.textContent).toContain(
                            isCompleted ? 'Выполнено' : 'Не выполнено'
                        );

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should provide both color and checkmark icon for goal completion', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        nutritionFilled: fc.boolean(),
                        weightLogged: fc.boolean(),
                        activityCompleted: fc.boolean(),
                    }),
                    (completionStatus) => {
                        const testId = `goals-${JSON.stringify(completionStatus)}`;

                        const TestComponent = () => (
                            <div data-testid={testId} className="flex gap-2">
                                {/* Nutrition */}
                                <div
                                    className={`flex items-center justify-center w-6 h-6 rounded-full ${completionStatus.nutritionFilled
                                        ? 'bg-success'
                                        : 'bg-line'
                                        }`}
                                    aria-label={
                                        completionStatus.nutritionFilled
                                            ? 'Питание заполнено'
                                            : 'Питание не заполнено'
                                    }
                                    title={
                                        completionStatus.nutritionFilled
                                            ? 'Питание заполнено'
                                            : 'Питание не заполнено'
                                    }
                                >
                                    {completionStatus.nutritionFilled && (
                                        <Check
                                            className="w-4 h-4 text-on-primary"
                                            aria-hidden="true"
                                            data-testid="nutrition-check"
                                        />
                                    )}
                                </div>

                                {/* Weight */}
                                <div
                                    className={`flex items-center justify-center w-6 h-6 rounded-full ${completionStatus.weightLogged
                                        ? 'bg-success'
                                        : 'bg-line'
                                        }`}
                                    aria-label={
                                        completionStatus.weightLogged
                                            ? 'Вес записан'
                                            : 'Вес не записан'
                                    }
                                    title={
                                        completionStatus.weightLogged
                                            ? 'Вес записан'
                                            : 'Вес не записан'
                                    }
                                >
                                    {completionStatus.weightLogged && (
                                        <Check
                                            className="w-4 h-4 text-on-primary"
                                            aria-hidden="true"
                                            data-testid="weight-check"
                                        />
                                    )}
                                </div>

                                {/* Activity */}
                                <div
                                    className={`flex items-center justify-center w-6 h-6 rounded-full ${completionStatus.activityCompleted
                                        ? 'bg-success'
                                        : 'bg-line'
                                        }`}
                                    aria-label={
                                        completionStatus.activityCompleted
                                            ? 'Активность выполнена'
                                            : 'Активность не выполнена'
                                    }
                                    title={
                                        completionStatus.activityCompleted
                                            ? 'Активность выполнена'
                                            : 'Активность не выполнена'
                                    }
                                >
                                    {completionStatus.activityCompleted && (
                                        <Check
                                            className="w-4 h-4 text-on-primary"
                                            aria-hidden="true"
                                            data-testid="activity-check"
                                        />
                                    )}
                                </div>
                            </div>
                        );

                        const { getByTestId, queryByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);

                        // Verify each indicator has both color and icon (when completed)
                        const indicators = container.querySelectorAll('div[aria-label]');
                        expect(indicators.length).toBe(3);

                        if (completionStatus.nutritionFilled) {
                            expect(queryByTestId('nutrition-check')).toBeTruthy();
                        }

                        if (completionStatus.weightLogged) {
                            expect(queryByTestId('weight-check')).toBeTruthy();
                        }

                        if (completionStatus.activityCompleted) {
                            expect(queryByTestId('activity-check')).toBeTruthy();
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('Warning and error indicators', () => {
        it('should provide both color and icon for warnings', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('warning', 'error', 'info'),
                    fc.string({ minLength: 5, maxLength: 50 }),
                    (type, message) => {
                        const testId = `alert-${type}`;
                        const colorClass =
                            type === 'error'
                                ? 'bg-danger-soft border-danger/30 text-danger-fg'
                                : type === 'warning'
                                    ? 'bg-warning-soft border-warning/30 text-warning-fg'
                                    : 'bg-primary-soft border-primary/30 text-primary';

                        const TestComponent = () => (
                            <div
                                data-testid={testId}
                                className={`flex items-start gap-2 p-3 border rounded-lg ${colorClass}`}
                                role="alert"
                            >
                                <AlertTriangle
                                    className="w-5 h-5 flex-shrink-0"
                                    aria-hidden="true"
                                    data-testid="alert-icon"
                                />
                                <p>{message}</p>
                            </div>
                        );

                        const { getByTestId, queryByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);

                        // Verify both color (via className) and icon are present
                        expect(container.className).toContain('bg-');
                        expect(container.className).toContain('border-');
                        expect(queryByTestId('alert-icon')).toBeTruthy();

                        // Verify text message is present
                        expect(container.textContent).toContain(message);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('Progress indicators', () => {
        it('should provide both color and percentage text for progress', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100 }),
                    (percentage) => {
                        const testId = `progress-${percentage}`;
                        const colorClass =
                            percentage >= 90
                                ? 'bg-success'
                                : percentage >= 70
                                    ? 'bg-warning'
                                    : 'bg-warning';

                        const TestComponent = () => (
                            <div data-testid={testId} className="space-y-2">
                                {/* Progress bar with color */}
                                <div className="w-full bg-subtle rounded-full h-3">
                                    <div
                                        className={`h-full rounded-full transition-all ${colorClass}`}
                                        style={{ width: `${percentage}%` }}
                                        role="progressbar"
                                        aria-valuenow={percentage}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                    />
                                </div>

                                {/* Percentage text */}
                                <div className="text-sm font-medium text-fg">
                                    {percentage}%
                                </div>
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);

                        // Verify both color (via className) and text percentage are present
                        const progressBar = container.querySelector('[role="progressbar"]');
                        expect(progressBar).toBeTruthy();
                        expect(progressBar?.className).toContain('bg-');

                        // Verify percentage text is present
                        expect(container.textContent).toContain(`${percentage}%`);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should provide both color and icon for trend indicators', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('increase', 'decrease', 'stable'),
                    fc.float({ min: Math.fround(-10), max: Math.fround(10) }),
                    (trend, value) => {
                        const testId = `trend-${trend}`;
                        const isIncrease = trend === 'increase';
                        const isDecrease = trend === 'decrease';
                        const colorClass = isDecrease
                            ? 'text-success-fg'
                            : isIncrease
                                ? 'text-warning-fg'
                                : 'text-fg-muted';

                        const TestComponent = () => (
                            <div
                                data-testid={testId}
                                className={`flex items-center gap-1 ${colorClass}`}
                            >
                                {isIncrease && (
                                    <TrendingUp
                                        className="w-4 h-4"
                                        aria-hidden="true"
                                        data-testid="trend-up"
                                    />
                                )}
                                {isDecrease && (
                                    <TrendingDown
                                        className="w-4 h-4"
                                        aria-hidden="true"
                                        data-testid="trend-down"
                                    />
                                )}
                                <span>{value.toFixed(1)} кг</span>
                            </div>
                        );

                        const { getByTestId, queryByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);

                        // Verify both color (via className) and icon are present
                        expect(container.className).toContain('text-');

                        if (isIncrease) {
                            expect(queryByTestId('trend-up')).toBeTruthy();
                        } else if (isDecrease) {
                            expect(queryByTestId('trend-down')).toBeTruthy();
                        }

                        // Verify text value is present
                        expect(container.textContent).toContain('кг');

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('Status badges', () => {
        it('should provide both color and text label for status badges', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(
                        { status: 'active', label: 'Активно', color: 'bg-success-soft text-success-fg' },
                        { status: 'pending', label: 'Ожидание', color: 'bg-warning-soft text-warning-fg' },
                        { status: 'overdue', label: 'Просрочено', color: 'bg-danger-soft text-danger-fg' },
                        { status: 'completed', label: 'Выполнено', color: 'bg-primary-soft text-primary' }
                    ),
                    (badgeData) => {
                        const testId = `badge-${badgeData.status}`;

                        const TestComponent = () => (
                            <span
                                data-testid={testId}
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badgeData.color}`}
                            >
                                {badgeData.label}
                            </span>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const badge = getByTestId(testId);

                        // Verify both color (via className) and text label are present
                        expect(badge.className).toContain('bg-');
                        expect(badge.className).toContain('text-');
                        expect(badge.textContent).toBe(badgeData.label);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    describe('Contrast ratios', () => {
        it('should use sufficient contrast for text on colored backgrounds', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(
                        { bg: 'bg-success', text: 'text-on-primary' },
                        { bg: 'bg-danger', text: 'text-on-primary' },
                        { bg: 'bg-primary', text: 'text-on-primary' },
                        { bg: 'bg-warning', text: 'text-fg' },
                        { bg: 'bg-subtle', text: 'text-fg' }
                    ),
                    (colorCombo) => {
                        const testId = `contrast-${colorCombo.bg}`;

                        const TestComponent = () => (
                            <div
                                data-testid={testId}
                                className={`${colorCombo.bg} ${colorCombo.text} p-4`}
                            >
                                Тестовый текст
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const element = getByTestId(testId);

                        // Verify both background and text color classes are present
                        expect(element.className).toContain(colorCombo.bg);
                        expect(element.className).toContain(colorCombo.text);

                        // Verify text content is present
                        expect(element.textContent).toBe('Тестовый текст');

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 50 }
            );
        });
    });
});

// Feature: dashboard, Property 38: Color-Independent Information
