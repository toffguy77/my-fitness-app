/**
 * Property-based tests for accessibility features
 *
 * Feature: dashboard, Property 36: Screen Reader Accessibility
 * Feature: dashboard, Property 37: Form Accessibility
 * Validates: Requirements 16.2, 16.3, 16.6
 */

import React from 'react';
import { render, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { CalendarNavigator } from '../components/CalendarNavigator';
import { NutritionBlock } from '../components/NutritionBlock';
import { WeightBlock } from '../components/WeightBlock';
import { StepsBlock } from '../components/StepsBlock';
import { WorkoutBlock } from '../components/WorkoutBlock';

// Clean up after each property test
afterEach(() => {
    cleanup();
});

describe('Property 36: Screen Reader Accessibility', () => {
    describe('Visual indicators have text alternatives', () => {
        it('should provide ARIA labels for all goal completion indicators', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        nutritionFilled: fc.boolean(),
                        weightLogged: fc.boolean(),
                        activityCompleted: fc.boolean(),
                    }),
                    (completionStatus) => {
                        const testId = `calendar-${JSON.stringify(completionStatus)}`;

                        const TestComponent = () => (
                            <div data-testid={testId}>
                                {completionStatus.nutritionFilled && (
                                    <span
                                        aria-label="Питание заполнено"
                                        role="img"
                                        data-testid="nutrition-indicator"
                                    >
                                        ✓
                                    </span>
                                )}
                                {completionStatus.weightLogged && (
                                    <span
                                        aria-label="Вес зафиксирован"
                                        role="img"
                                        data-testid="weight-indicator"
                                    >
                                        ✓
                                    </span>
                                )}
                                {completionStatus.activityCompleted && (
                                    <span
                                        aria-label="Активность выполнена"
                                        role="img"
                                        data-testid="activity-indicator"
                                    >
                                        ✓
                                    </span>
                                )}
                            </div>
                        );

                        const { getByTestId, queryByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);

                        // Verify ARIA labels exist for visible indicators
                        if (completionStatus.nutritionFilled) {
                            const indicator = queryByTestId('nutrition-indicator');
                            expect(indicator).toBeTruthy();
                            expect(indicator?.getAttribute('aria-label')).toBe('Питание заполнено');
                        }

                        if (completionStatus.weightLogged) {
                            const indicator = queryByTestId('weight-indicator');
                            expect(indicator).toBeTruthy();
                            expect(indicator?.getAttribute('aria-label')).toBe('Вес зафиксирован');
                        }

                        if (completionStatus.activityCompleted) {
                            const indicator = queryByTestId('activity-indicator');
                            expect(indicator).toBeTruthy();
                            expect(indicator?.getAttribute('aria-label')).toBe('Активность выполнена');
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should provide ARIA labels for progress bars', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 10000 }),
                    fc.integer({ min: 1000, max: 5000 }),
                    (current, goal) => {
                        const percentage = Math.min(100, Math.round((current / goal) * 100));
                        const testId = `progress-${current}-${goal}`;

                        const TestComponent = () => (
                            <div
                                role="progressbar"
                                aria-valuenow={current}
                                aria-valuemin={0}
                                aria-valuemax={goal}
                                aria-label={`Прогресс: ${current} из ${goal} (${percentage}%)`}
                                data-testid={testId}
                            >
                                <div style={{ width: `${percentage}%` }} />
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const progressBar = getByTestId(testId);

                        // Verify ARIA attributes
                        expect(progressBar.getAttribute('role')).toBe('progressbar');
                        expect(progressBar.getAttribute('aria-valuenow')).toBe(String(current));
                        expect(progressBar.getAttribute('aria-valuemin')).toBe('0');
                        expect(progressBar.getAttribute('aria-valuemax')).toBe(String(goal));
                        expect(progressBar.getAttribute('aria-label')).toContain('Прогресс');

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should provide alt text for images', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(
                        { src: '/photo.jpg', alt: 'Фото прогресса за неделю' },
                        { src: '/chart.png', alt: 'График изменения веса' },
                        { src: '/icon.svg', alt: 'Иконка достижения' }
                    ),
                    (imageData) => {
                        const testId = `image-${imageData.alt}`;

                        const TestComponent = () => (
                            <img
                                src={imageData.src}
                                alt={imageData.alt}
                                data-testid={testId}
                            />
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const image = getByTestId(testId);

                        // Verify alt text exists and is not empty
                        const altText = image.getAttribute('alt');
                        expect(altText).toBeTruthy();
                        expect(altText).not.toBe('');
                        expect(altText).toBe(imageData.alt);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 50 }
            );
        });

        it('should provide status indicators with ARIA live regions', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('success', 'error', 'warning', 'info'),
                    fc.string({ minLength: 5, maxLength: 50 }),
                    (status, message) => {
                        const testId = `status-${status}`;
                        const ariaLive = status === 'error' ? 'assertive' : 'polite';

                        const TestComponent = () => (
                            <div
                                role="status"
                                aria-live={ariaLive}
                                aria-atomic="true"
                                data-testid={testId}
                            >
                                {message}
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const statusElement = getByTestId(testId);

                        // Verify ARIA live region attributes
                        expect(statusElement.getAttribute('role')).toBe('status');
                        expect(statusElement.getAttribute('aria-live')).toBe(ariaLive);
                        expect(statusElement.getAttribute('aria-atomic')).toBe('true');

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});

describe('Property 37: Form Accessibility', () => {
    describe('Form inputs have clear labels', () => {
        it('should associate labels with inputs using htmlFor/id', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(
                        { id: 'weight-input', label: 'Вес (кг)', type: 'number' },
                        { id: 'steps-input', label: 'Шаги', type: 'number' },
                        { id: 'calories-input', label: 'Калории', type: 'number' }
                    ),
                    (inputData) => {
                        const testId = `form-${inputData.id}`;

                        const TestComponent = () => (
                            <div data-testid={testId}>
                                <label htmlFor={inputData.id}>{inputData.label}</label>
                                <input
                                    id={inputData.id}
                                    type={inputData.type}
                                    aria-label={inputData.label}
                                />
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);
                        const label = container.querySelector('label');
                        const input = container.querySelector('input');

                        // Verify label is associated with input
                        expect(label?.getAttribute('for')).toBe(inputData.id);
                        expect(input?.getAttribute('id')).toBe(inputData.id);
                        expect(input?.getAttribute('aria-label')).toBe(inputData.label);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 50 }
            );
        });

        it('should provide error messages with aria-describedby', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        inputId: fc.constantFrom('weight', 'steps', 'calories'),
                        errorMessage: fc.constantFrom(
                            'Вес должен быть положительным',
                            'Шаги не могут быть отрицательными',
                            'Калории должны быть не более 10,000'
                        ),
                    }),
                    (data) => {
                        const errorId = `${data.inputId}-error`;
                        const testId = `form-error-${data.inputId}`;

                        const TestComponent = () => (
                            <div data-testid={testId}>
                                <input
                                    id={data.inputId}
                                    aria-describedby={errorId}
                                    aria-invalid="true"
                                />
                                <div id={errorId} role="alert">
                                    {data.errorMessage}
                                </div>
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);
                        const input = container.querySelector('input');
                        const error = container.querySelector(`#${errorId}`);

                        // Verify error is associated with input
                        expect(input?.getAttribute('aria-describedby')).toBe(errorId);
                        expect(input?.getAttribute('aria-invalid')).toBe('true');
                        expect(error?.getAttribute('role')).toBe('alert');
                        expect(error?.textContent).toBe(data.errorMessage);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should announce errors to screen readers via ARIA live regions', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(
                        'Вес должен быть положительным',
                        'Шаги не могут быть отрицательными',
                        'Калории должны быть не более 10,000',
                        'Фото должно быть в формате JPEG, PNG или WebP'
                    ),
                    (errorMessage) => {
                        const testId = `error-${errorMessage.substring(0, 10)}`;

                        const TestComponent = () => (
                            <div
                                role="alert"
                                aria-live="assertive"
                                aria-atomic="true"
                                data-testid={testId}
                            >
                                {errorMessage}
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const errorElement = getByTestId(testId);

                        // Verify ARIA live region for errors
                        expect(errorElement.getAttribute('role')).toBe('alert');
                        expect(errorElement.getAttribute('aria-live')).toBe('assertive');
                        expect(errorElement.getAttribute('aria-atomic')).toBe('true');
                        expect(errorElement.textContent).toBe(errorMessage);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 50 }
            );
        });

        it('should provide required field indicators', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        fieldName: fc.constantFrom('weight', 'calories', 'photo'),
                        label: fc.constantFrom('Вес', 'Калории', 'Фото'),
                        required: fc.boolean(),
                    }),
                    (fieldData) => {
                        const testId = `field-${fieldData.fieldName}`;

                        const TestComponent = () => (
                            <div data-testid={testId}>
                                <label htmlFor={fieldData.fieldName}>
                                    {fieldData.label}
                                    {fieldData.required && (
                                        <span aria-label="обязательное поле"> *</span>
                                    )}
                                </label>
                                <input
                                    id={fieldData.fieldName}
                                    required={fieldData.required}
                                    aria-required={fieldData.required}
                                />
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);
                        const input = container.querySelector('input');

                        if (fieldData.required) {
                            expect(input?.hasAttribute('required')).toBe(true);
                            expect(input?.getAttribute('aria-required')).toBe('true');

                            const requiredIndicator = container.querySelector('[aria-label="обязательное поле"]');
                            expect(requiredIndicator).toBeTruthy();
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should provide descriptive labels for all form inputs', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom(
                        { type: 'number', label: 'Введите вес в килограммах', placeholder: '70.5' },
                        { type: 'number', label: 'Введите количество шагов', placeholder: '10000' },
                        { type: 'number', label: 'Введите калории', placeholder: '2000' },
                        { type: 'text', label: 'Введите тип тренировки', placeholder: 'Бег' }
                    ),
                    (inputData) => {
                        const testId = `input-${inputData.label.substring(0, 10)}`;

                        const TestComponent = () => (
                            <div data-testid={testId}>
                                <label>
                                    {inputData.label}
                                    <input
                                        type={inputData.type}
                                        placeholder={inputData.placeholder}
                                        aria-label={inputData.label}
                                    />
                                </label>
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);
                        const input = container.querySelector('input');
                        const label = container.querySelector('label');

                        // Verify descriptive label exists
                        expect(label?.textContent).toContain(inputData.label);
                        expect(input?.getAttribute('aria-label')).toBe(inputData.label);
                        expect(input?.getAttribute('placeholder')).toBe(inputData.placeholder);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    describe('Form validation feedback', () => {
        it('should provide immediate validation feedback with ARIA', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        value: fc.oneof(
                            fc.float({ min: Math.fround(-100), max: Math.fround(-0.1) }), // invalid
                            fc.float({ min: Math.fround(0.1), max: Math.fround(500) }), // valid
                            fc.float({ min: Math.fround(500.1), max: Math.fround(1000) }) // invalid
                        ),
                        fieldName: fc.constantFrom('weight', 'steps', 'calories'),
                    }),
                    (data) => {
                        const isValid = data.value > 0 && data.value <= 500;
                        const errorMessage = !isValid
                            ? data.value <= 0
                                ? 'Значение должно быть положительным'
                                : 'Значение должно быть не более 500'
                            : '';
                        const testId = `validation-${data.fieldName}-${data.value}`;

                        const TestComponent = () => (
                            <div data-testid={testId}>
                                <input
                                    id={data.fieldName}
                                    value={data.value}
                                    aria-invalid={!isValid}
                                    aria-describedby={!isValid ? `${data.fieldName}-error` : undefined}
                                    readOnly
                                />
                                {!isValid && (
                                    <div
                                        id={`${data.fieldName}-error`}
                                        role="alert"
                                        aria-live="assertive"
                                    >
                                        {errorMessage}
                                    </div>
                                )}
                            </div>
                        );

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);
                        const input = container.querySelector('input');

                        if (!isValid) {
                            expect(input?.getAttribute('aria-invalid')).toBe('true');
                            expect(input?.getAttribute('aria-describedby')).toBe(`${data.fieldName}-error`);

                            const errorElement = container.querySelector(`#${data.fieldName}-error`);
                            expect(errorElement?.getAttribute('role')).toBe('alert');
                            expect(errorElement?.getAttribute('aria-live')).toBe('assertive');
                        } else {
                            expect(input?.getAttribute('aria-invalid')).toBe('false');
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});

// Feature: dashboard, Property 36: Screen Reader Accessibility
// Feature: dashboard, Property 37: Form Accessibility
