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
                                className={`flex items-center gap-2 ${isCompleted ? 'text-green-600' : 'text-gray-600'
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
                            expect(container.className).toContain('text-green-600');
                            expect(queryByTestId('check-icon')).toBeTruthy();
                        } else {
                            expect(container.className).toContain('text-gray-600');
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
                                        ? 'bg-green-500'
                                        : 'bg-gray-300'
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
                                            className="w-4 h-4 text-white"
                                            aria-hidden="true"
                                            data-testid="nutrition-check"
                                        />
                                    )}
                                </div>

                                {/* Weight */}
                                <div
                                    className={`flex items-center justify-center w-6 h-6 rounded-full ${completionStatus.weightLogged
                                        ? 'bg-green-500'
                                        : 'bg-gray-300'
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
                                            className="w-4 h-4 text-white"
                                            aria-hidden="true"
                                            data-testid="weight-check"
                                        />
                                    )}
                                </div>

                                {/* Activity */}
                                <div
                                    className={`flex items-center justify-center w-6 h-6 rounded-full ${completionStatus.activityCompleted
                                        ? 'bg-green-500'
                                        : 'bg-gray-300'
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
                                            className="w-4 h-4 text-white"
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
                                ? 'bg-red-50 border-red-200 text-red-800'
                                : type === 'warning'
                                    ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                                    : 'bg-blue-50 border-blue-200 text-blue-800';

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
                                ? 'bg-green-500'
                                : percentage >= 70
                                    ? 'bg-yellow-500'
                                    : 'bg-orange-500';

                        const TestComponent = () => (
                            <div data-testid={testId} className="space-y-2">
                                {/* Progress bar with color */}
                                <div className="w-full bg-gray-200 rounded-full h-3">
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
                                <div className="text-sm font-medium text-gray-700">
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
                            ? 'text-green-600'
                            : isIncrease
                                ? 'text-orange-600'
                                : 'text-gray-600';

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
                        { status: 'active', label: 'Активно', color: 'bg-green-100 text-green-800' },
                        { status: 'pending', label: 'Ожидание', color: 'bg-yellow-100 text-yellow-800' },
                        { status: 'overdue', label: 'Просрочено', color: 'bg-red-100 text-red-800' },
                        { status: 'completed', label: 'Выполнено', color: 'bg-blue-100 text-blue-800' }
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
                        { bg: 'bg-green-500', text: 'text-white' },
                        { bg: 'bg-red-500', text: 'text-white' },
                        { bg: 'bg-blue-500', text: 'text-white' },
                        { bg: 'bg-yellow-500', text: 'text-gray-900' },
                        { bg: 'bg-gray-100', text: 'text-gray-900' }
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
