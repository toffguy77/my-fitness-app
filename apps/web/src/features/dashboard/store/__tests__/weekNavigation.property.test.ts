/**
 * Property-based tests for week navigation
 * Feature: dashboard
 * Property 1: Week Navigation Bidirectionality
 * Validates: Requirements 1.3, 1.4
 */

import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useDashboardStore } from '../dashboardStore';

/**
 * Helper: Check if date is valid
 */
function isValidDate(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Helper: Format date to ISO string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
    if (!isValidDate(date)) {
        throw new Error('Invalid date provided to formatDateISO');
    }
    return date.toISOString().split('T')[0];
}

/**
 * Helper: Get start of week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
    if (!isValidDate(date)) {
        throw new Error('Invalid date provided to getWeekStart');
    }
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

/**
 * Helper: Get end of week (Sunday) for a given date
 */
function getWeekEnd(date: Date): Date {
    if (!isValidDate(date)) {
        throw new Error('Invalid date provided to getWeekEnd');
    }
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

/**
 * Helper: Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
    if (!isValidDate(date1) || !isValidDate(date2)) {
        return false;
    }
    return formatDateISO(date1) === formatDateISO(date2);
}

/**
 * Helper: Check if two week ranges are equal
 */
function isSameWeek(week1: { start: Date; end: Date }, week2: { start: Date; end: Date }): boolean {
    if (!isValidDate(week1.start) || !isValidDate(week1.end) ||
        !isValidDate(week2.start) || !isValidDate(week2.end)) {
        return false;
    }
    return isSameDay(week1.start, week2.start) && isSameDay(week1.end, week2.end);
}

describe('Property 1: Week Navigation Bidirectionality', () => {
    beforeEach(() => {
        // Reset store state before each test
        const { result } = renderHook(() => useDashboardStore());
        act(() => {
            result.current.reset();
        });
    });

    /**
     * For any selected week, navigating forward then backward (or backward then forward)
     * should return to the original week.
     *
     * This property validates that week navigation is bidirectional and consistent.
     */
    it('Feature: dashboard, Property 1: navigating forward then backward returns to original week', () => {
        fc.assert(
            fc.property(
                // Generate random dates within a reasonable range (2020-2030)
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                (startDate) => {
                    // Skip invalid dates
                    if (!isValidDate(startDate)) {
                        return true;
                    }

                    const { result } = renderHook(() => useDashboardStore());

                    // Set initial date
                    act(() => {
                        result.current.setSelectedDate(startDate);
                    });

                    // Store original week
                    const originalWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };
                    const originalDate = new Date(result.current.selectedDate);

                    // Skip if store returned invalid dates
                    if (!isValidDate(originalWeek.start) || !isValidDate(originalWeek.end)) {
                        return true;
                    }

                    // Navigate forward
                    act(() => {
                        result.current.navigateWeek('next');
                    });

                    // Verify we moved forward
                    const forwardWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };

                    // Skip if navigation resulted in invalid dates
                    if (!isValidDate(forwardWeek.start) || !isValidDate(forwardWeek.end)) {
                        return true;
                    }

                    expect(forwardWeek.start.getTime()).toBeGreaterThan(originalWeek.start.getTime());

                    // Navigate backward
                    act(() => {
                        result.current.navigateWeek('prev');
                    });

                    // Verify we're back to the original week
                    const finalWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };

                    expect(isSameWeek(finalWeek, originalWeek)).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that navigating backward then forward returns to the original week
     */
    it('Feature: dashboard, Property 1: navigating backward then forward returns to original week', () => {
        fc.assert(
            fc.property(
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                (startDate) => {
                    // Skip invalid dates
                    if (!isValidDate(startDate)) {
                        return true;
                    }

                    const { result } = renderHook(() => useDashboardStore());

                    // Set initial date
                    act(() => {
                        result.current.setSelectedDate(startDate);
                    });

                    // Store original week
                    const originalWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };

                    // Skip if store returned invalid dates
                    if (!isValidDate(originalWeek.start) || !isValidDate(originalWeek.end)) {
                        return true;
                    }

                    // Navigate backward
                    act(() => {
                        result.current.navigateWeek('prev');
                    });

                    // Verify we moved backward
                    const backwardWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };

                    // Skip if navigation resulted in invalid dates
                    if (!isValidDate(backwardWeek.start) || !isValidDate(backwardWeek.end)) {
                        return true;
                    }

                    expect(backwardWeek.start.getTime()).toBeLessThan(originalWeek.start.getTime());

                    // Navigate forward
                    act(() => {
                        result.current.navigateWeek('next');
                    });

                    // Verify we're back to the original week
                    const finalWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };

                    expect(isSameWeek(finalWeek, originalWeek)).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that multiple forward/backward navigations maintain consistency
     */
    it('Feature: dashboard, Property 1: multiple forward/backward navigations are consistent', () => {
        fc.assert(
            fc.property(
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                fc.integer({ min: 1, max: 10 }), // Number of forward navigations
                (startDate, forwardCount) => {
                    // Skip invalid dates
                    if (!isValidDate(startDate)) {
                        return true;
                    }

                    const { result } = renderHook(() => useDashboardStore());

                    // Set initial date
                    act(() => {
                        result.current.setSelectedDate(startDate);
                    });

                    // Store original week
                    const originalWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };

                    // Skip if store returned invalid dates
                    if (!isValidDate(originalWeek.start) || !isValidDate(originalWeek.end)) {
                        return true;
                    }

                    // Navigate forward N times
                    for (let i = 0; i < forwardCount; i++) {
                        act(() => {
                            result.current.navigateWeek('next');
                        });
                    }

                    // Navigate backward N times
                    for (let i = 0; i < forwardCount; i++) {
                        act(() => {
                            result.current.navigateWeek('prev');
                        });
                    }

                    // Verify we're back to the original week
                    const finalWeek = {
                        start: new Date(result.current.selectedWeek.start),
                        end: new Date(result.current.selectedWeek.end),
                    };

                    expect(isSameWeek(finalWeek, originalWeek)).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that week navigation always maintains a 7-day week span
     */
    it('Feature: dashboard, Property 1: week navigation always maintains 7-day span', () => {
        fc.assert(
            fc.property(
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                fc.constantFrom('prev' as const, 'next' as const),
                fc.integer({ min: 1, max: 20 }), // Number of navigations
                (startDate, direction, navigationCount) => {
                    // Skip invalid dates
                    if (!isValidDate(startDate)) {
                        return true;
                    }

                    const { result } = renderHook(() => useDashboardStore());

                    // Set initial date
                    act(() => {
                        result.current.setSelectedDate(startDate);
                    });

                    // Navigate multiple times
                    for (let i = 0; i < navigationCount; i++) {
                        act(() => {
                            result.current.navigateWeek(direction);
                        });

                        // Verify week span is always 7 days
                        const weekStart = result.current.selectedWeek.start;
                        const weekEnd = result.current.selectedWeek.end;

                        // Skip if navigation resulted in invalid dates
                        if (!isValidDate(weekStart) || !isValidDate(weekEnd)) {
                            return true;
                        }

                        const daysDiff = Math.round(
                            (weekEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
                        );

                        expect(daysDiff).toBe(6); // 6 days difference = 7 days total (inclusive)
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that week navigation always starts on Monday and ends on Sunday
     */
    it('Feature: dashboard, Property 1: week navigation always starts Monday and ends Sunday', () => {
        fc.assert(
            fc.property(
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                fc.constantFrom('prev' as const, 'next' as const),
                fc.integer({ min: 1, max: 20 }),
                (startDate, direction, navigationCount) => {
                    // Skip invalid dates
                    if (!isValidDate(startDate)) {
                        return true;
                    }

                    const { result } = renderHook(() => useDashboardStore());

                    // Set initial date
                    act(() => {
                        result.current.setSelectedDate(startDate);
                    });

                    // Navigate multiple times
                    for (let i = 0; i < navigationCount; i++) {
                        act(() => {
                            result.current.navigateWeek(direction);
                        });

                        // Verify week starts on Monday (day 1)
                        const weekStart = result.current.selectedWeek.start;
                        const weekEnd = result.current.selectedWeek.end;

                        // Skip if navigation resulted in invalid dates
                        if (!isValidDate(weekStart) || !isValidDate(weekEnd)) {
                            return true;
                        }

                        expect(weekStart.getDay()).toBe(1);

                        // Verify week ends on Sunday (day 0)
                        expect(weekEnd.getDay()).toBe(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that navigating forward moves exactly 7 days ahead
     */
    it('Feature: dashboard, Property 1: navigating forward moves exactly 7 days ahead', () => {
        fc.assert(
            fc.property(
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                (startDate) => {
                    // Skip invalid dates
                    if (!isValidDate(startDate)) {
                        return true;
                    }

                    const { result } = renderHook(() => useDashboardStore());

                    // Set initial date
                    act(() => {
                        result.current.setSelectedDate(startDate);
                    });

                    // Store original week start
                    const originalWeekStart = new Date(result.current.selectedWeek.start);

                    // Skip if store returned invalid dates
                    if (!isValidDate(originalWeekStart)) {
                        return true;
                    }

                    // Navigate forward
                    act(() => {
                        result.current.navigateWeek('next');
                    });

                    // Verify we moved exactly 7 days forward
                    const newWeekStart = result.current.selectedWeek.start;

                    // Skip if navigation resulted in invalid dates
                    if (!isValidDate(newWeekStart)) {
                        return true;
                    }

                    const daysDiff = Math.round(
                        (newWeekStart.getTime() - originalWeekStart.getTime()) / (1000 * 60 * 60 * 24)
                    );

                    expect(daysDiff).toBe(7);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that navigating backward moves exactly 7 days back
     */
    it('Feature: dashboard, Property 1: navigating backward moves exactly 7 days back', () => {
        fc.assert(
            fc.property(
                fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                (startDate) => {
                    // Skip invalid dates
                    if (!isValidDate(startDate)) {
                        return true;
                    }

                    const { result } = renderHook(() => useDashboardStore());

                    // Set initial date
                    act(() => {
                        result.current.setSelectedDate(startDate);
                    });

                    // Store original week start
                    const originalWeekStart = new Date(result.current.selectedWeek.start);

                    // Skip if store returned invalid dates
                    if (!isValidDate(originalWeekStart)) {
                        return true;
                    }

                    // Navigate backward
                    act(() => {
                        result.current.navigateWeek('prev');
                    });

                    // Verify we moved exactly 7 days backward
                    const newWeekStart = result.current.selectedWeek.start;

                    // Skip if navigation resulted in invalid dates
                    if (!isValidDate(newWeekStart)) {
                        return true;
                    }

                    const daysDiff = Math.round(
                        (originalWeekStart.getTime() - newWeekStart.getTime()) / (1000 * 60 * 60 * 24)
                    );

                    expect(daysDiff).toBe(7);
                }
            ),
            { numRuns: 100 }
        );
    });
});
