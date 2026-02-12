/**
 * WaterTracker Property-Based Tests
 *
 * Property tests for water tracking functionality.
 *
 * **Property 12: Water Intake Increment**
 * For any add action, intake increases by exactly one glass.
 * **Validates: Requirements 21.2**
 *
 * **Property 13: Water Display Format**
 * Display format is always "X / Y стаканов"
 * **Validates: Requirements 21.3**
 *
 * @module food-tracker/components/__tests__/WaterTracker.property.test
 */

import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import { WaterTracker } from '../WaterTracker';
import type { WaterLog } from '../../types';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate valid date string (YYYY-MM-DD format)
 */
const dateGenerator = (): fc.Arbitrary<string> =>
    fc.tuple(
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 })
    ).map(([y, m, d]) =>
        `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
    );

/**
 * Generate valid water log
 */
const waterLogGenerator = (): fc.Arbitrary<WaterLog> =>
    fc.record({
        date: dateGenerator(),
        glasses: fc.integer({ min: 0, max: 20 }),
        goal: fc.integer({ min: 1, max: 20 }),
        glassSize: fc.constantFrom(200, 250, 300, 350),
    });

/**
 * Generate water log with specific glasses count
 */
const waterLogWithGlassesGenerator = (glasses: number): fc.Arbitrary<WaterLog> =>
    fc.record({
        date: dateGenerator(),
        glasses: fc.constant(glasses),
        goal: fc.integer({ min: 1, max: 20 }),
        glassSize: fc.constantFrom(200, 250, 300, 350),
    });

// ============================================================================
// Property Tests
// ============================================================================

describe('WaterTracker Property Tests', () => {
    afterEach(() => {
        cleanup();
    });

    /**
     * Property 12: Water Intake Increment
     *
     * For any add action, intake increases by exactly one glass.
     * **Validates: Requirements 21.2**
     */
    describe('Property 12: Water Intake Increment', () => {
        it('add glass button triggers onAddGlass callback exactly once per click', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (waterLog) => {
                    cleanup();
                    const onAddGlass = jest.fn();
                    render(<WaterTracker waterLog={waterLog} onAddGlass={onAddGlass} />);

                    const addButton = screen.getByRole('button', { name: /добавить стакан/i });
                    fireEvent.click(addButton);

                    // Callback should be called exactly once
                    expect(onAddGlass).toHaveBeenCalledTimes(1);

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('multiple clicks trigger callback multiple times', () => {
            fc.assert(
                fc.property(
                    waterLogGenerator(),
                    fc.integer({ min: 1, max: 5 }),
                    (waterLog, clickCount) => {
                        cleanup();
                        const onAddGlass = jest.fn();
                        render(<WaterTracker waterLog={waterLog} onAddGlass={onAddGlass} />);

                        const addButton = screen.getByRole('button', { name: /добавить стакан/i });

                        for (let i = 0; i < clickCount; i++) {
                            fireEvent.click(addButton);
                        }

                        // Callback should be called exactly clickCount times
                        expect(onAddGlass).toHaveBeenCalledTimes(clickCount);

                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });

        it('does not trigger callback when loading', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (waterLog) => {
                    cleanup();
                    const onAddGlass = jest.fn();
                    render(<WaterTracker waterLog={waterLog} onAddGlass={onAddGlass} isLoading={true} />);

                    const addButton = screen.getByRole('button', { name: /добавить стакан/i });
                    fireEvent.click(addButton);

                    // Callback should not be called when loading
                    expect(onAddGlass).not.toHaveBeenCalled();

                    return true;
                }),
                { numRuns: 30 }
            );
        });
    });

    /**
     * Property 13: Water Display Format
     *
     * Display format is always "X / Y стаканов"
     * **Validates: Requirements 21.3**
     */
    describe('Property 13: Water Display Format', () => {
        it('always displays water in "X / Y стаканов" format', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (waterLog) => {
                    cleanup();
                    render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

                    const expectedText = `${waterLog.glasses} / ${waterLog.goal} стаканов`;
                    expect(screen.getByText(expectedText)).toBeInTheDocument();

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('displays default values when waterLog is null', () => {
            cleanup();
            render(<WaterTracker waterLog={null} onAddGlass={jest.fn()} />);

            // Default: 0 glasses, 8 goal
            expect(screen.getByText('0 / 8 стаканов')).toBeInTheDocument();
        });

        it('displays glass size in ml format', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (waterLog) => {
                    cleanup();
                    render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

                    const expectedSizeText = `${waterLog.glassSize} мл`;
                    expect(screen.getByText(expectedSizeText)).toBeInTheDocument();

                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('has accessible aria-label with glasses count', () => {
            fc.assert(
                fc.property(waterLogGenerator(), (waterLog) => {
                    cleanup();
                    render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

                    const displayElement = screen.getByLabelText(
                        `Выпито ${waterLog.glasses} из ${waterLog.goal} стаканов`
                    );
                    expect(displayElement).toBeInTheDocument();

                    return true;
                }),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Additional property: Goal completion indicator
     */
    describe('Property: Goal Completion Indicator', () => {
        it('shows completion indicator when glasses >= goal', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 10 }),
                    fc.integer({ min: 0, max: 5 }),
                    dateGenerator(),
                    fc.constantFrom(200, 250, 300),
                    (goal, extra, date, glassSize) => {
                        cleanup();
                        const waterLog: WaterLog = {
                            date,
                            glasses: goal + extra, // glasses >= goal
                            goal,
                            glassSize,
                        };
                        render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

                        expect(screen.getByText('Цель достигнута')).toBeInTheDocument();

                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });

        it('does not show completion indicator when glasses < goal', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 10 }),
                    dateGenerator(),
                    fc.constantFrom(200, 250, 300),
                    (goal, date, glassSize) => {
                        cleanup();
                        const waterLog: WaterLog = {
                            date,
                            glasses: goal - 1, // glasses < goal
                            goal,
                            glassSize,
                        };
                        render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

                        expect(screen.queryByText('Цель достигнута')).not.toBeInTheDocument();

                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });
    });

    /**
     * Additional property: Progress bar percentage
     */
    describe('Property: Progress Bar Percentage', () => {
        it('progress bar percentage is capped at 100%', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 10 }),
                    fc.integer({ min: 0, max: 10 }),
                    dateGenerator(),
                    (goal, extra, date) => {
                        cleanup();
                        const waterLog: WaterLog = {
                            date,
                            glasses: goal + extra, // Can exceed goal
                            goal,
                            glassSize: 250,
                        };
                        render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

                        const progressBar = screen.getByRole('progressbar');
                        const valueNow = parseInt(progressBar.getAttribute('aria-valuenow') || '0');

                        // Percentage should be capped at 100
                        expect(valueNow).toBeLessThanOrEqual(100);
                        expect(valueNow).toBeGreaterThanOrEqual(0);

                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });

        it('progress bar percentage is calculated correctly when under goal', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 10 }),
                    fc.integer({ min: 0, max: 9 }),
                    dateGenerator(),
                    (goal, glasses, date) => {
                        cleanup();
                        // Ensure glasses < goal
                        const actualGlasses = Math.min(glasses, goal - 1);
                        const waterLog: WaterLog = {
                            date,
                            glasses: actualGlasses,
                            goal,
                            glassSize: 250,
                        };
                        render(<WaterTracker waterLog={waterLog} onAddGlass={jest.fn()} />);

                        const progressBar = screen.getByRole('progressbar');
                        const valueNow = parseInt(progressBar.getAttribute('aria-valuenow') || '0');
                        const expectedPercentage = Math.round((actualGlasses / goal) * 100);

                        expect(valueNow).toBe(expectedPercentage);

                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });
    });
});
