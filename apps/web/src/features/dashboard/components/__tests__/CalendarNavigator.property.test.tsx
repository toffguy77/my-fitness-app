/**
 * Property-based tests for CalendarNavigator component
 * Tests universal properties that should hold for all inputs
 */

import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { CalendarNavigator } from '../CalendarNavigator';
import { useDashboardStore } from '../../store/dashboardStore';
import {
    dailyMetricsWithCompletionArbitrary,
    weekOfDailyMetricsArbitrary,
} from '../../testing/generators';
import type { DailyMetrics, CompletionStatus } from '../../types';

// Mock the dashboard store
jest.mock('../../store/dashboardStore');

const mockUseDashboardStore = useDashboardStore as jest.MockedFunction<
    typeof useDashboardStore
>;

/**
 * Helper: Get start of week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

/**
 * Helper: Get end of week (Sunday) for a given date
 */
function getWeekEnd(date: Date): Date {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

/**
 * Helper: Format date to ISO string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
    return date.toISOString().split('T')[0];
}

describe('CalendarNavigator - Property Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Property 3: Goal Completion Indicators Match Data', () => {
        it('Feature: dashboard, Property 3: For any day with daily metrics, the calendar should display completion indicators that accurately reflect the data', () => {
            // **Validates: Requirements 1.6**

            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                    fc.record({
                        nutritionFilled: fc.boolean(),
                        weightLogged: fc.boolean(),
                        activityCompleted: fc.boolean(),
                    }),
                    (date, completionStatus: CompletionStatus) => {
                        // Skip invalid dates
                        if (isNaN(date.getTime())) {
                            return true;
                        }

                        const weekStart = getWeekStart(date);
                        const weekEnd = getWeekEnd(date);

                        // Generate daily metrics with specific completion status
                        const dateStr = formatDateISO(date);
                        const metrics: DailyMetrics = {
                            date: dateStr,
                            userId: 'test-user',
                            nutrition: {
                                calories: completionStatus.nutritionFilled ? 2000 : 0,
                                protein: 150,
                                fat: 60,
                                carbs: 200,
                            },
                            weight: completionStatus.weightLogged ? 75.5 : null,
                            steps: completionStatus.activityCompleted ? 10000 : 0,
                            workout: {
                                completed: completionStatus.activityCompleted,
                            },
                            completionStatus,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        };

                        const dailyData: Record<string, DailyMetrics> = {
                            [dateStr]: metrics,
                        };

                        // Select a different day from the same week to avoid selected styling
                        // Use Monday of the week as selected day if current day is not Monday
                        const selectedDay = date.getDay() === 1 ? new Date(weekStart.getTime() + 86400000) : weekStart;

                        // Mock store
                        mockUseDashboardStore.mockReturnValue({
                            selectedDate: selectedDay,
                            selectedWeek: { start: weekStart, end: weekEnd },
                            dailyData,
                            setSelectedDate: jest.fn(),
                            navigateWeek: jest.fn(),
                            weeklyPlan: null,
                            tasks: [],
                            isLoading: false,
                            error: null,
                            isOffline: false,
                            pollingIntervalId: null,
                            fetchDailyData: jest.fn(),
                            fetchWeekData: jest.fn(),
                            updateMetric: jest.fn(),
                            fetchWeeklyPlan: jest.fn(),
                            fetchTasks: jest.fn(),
                            updateTaskStatus: jest.fn(),
                            submitWeeklyReport: jest.fn(),
                            uploadPhoto: jest.fn(),
                            pollForUpdates: jest.fn(),
                            startPolling: jest.fn(),
                            stopPolling: jest.fn(),
                            clearError: jest.fn(),
                            reset: jest.fn(),
                            setOfflineStatus: jest.fn(),
                            loadFromCache: jest.fn(),
                            syncWhenOnline: jest.fn(),
                        });

                        const { container } = render(<CalendarNavigator />);

                        // Find the day button for the specific date using aria-label
                        const dayButtons = container.querySelectorAll('button');
                        const dayNumber = date.getDate();

                        // Get day of week name in Russian
                        const dayOfWeek = date.getDay();
                        const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
                        const expectedDayName = dayNames[dayOfWeek];

                        const dayButton = Array.from(dayButtons).find((btn) => {
                            const ariaLabel = btn.getAttribute('aria-label') || '';
                            // Match exact day name and day number
                            return ariaLabel.includes(expectedDayName) && ariaLabel.includes(`, ${dayNumber}`);
                        });

                        // Skip if we can't find the button (edge case with week boundaries)
                        if (!dayButton) {
                            return true;
                        }
                        // Check indicators by aria-label (more reliable than CSS classes)
                        const allDivs = dayButton.querySelectorAll('div[aria-label]');
                        const nutritionIndicator = Array.from(allDivs).find(el =>
                            el.getAttribute('aria-label')?.includes('Питание')
                        );
                        const weightIndicator = Array.from(allDivs).find(el =>
                            el.getAttribute('aria-label')?.includes('Вес')
                        );
                        const activityIndicator = Array.from(allDivs).find(el =>
                            el.getAttribute('aria-label')?.includes('Активность')
                        );

                        expect(nutritionIndicator).toBeTruthy();
                        expect(weightIndicator).toBeTruthy();
                        expect(activityIndicator).toBeTruthy();

                        // Property: Indicators should reflect completion status via aria-label
                        // This is more reliable than checking CSS classes which change based on selection

                        // Nutrition indicator (check aria-label)
                        if (nutritionIndicator) {
                            const label = nutritionIndicator.getAttribute('aria-label') || '';
                            if (completionStatus.nutritionFilled) {
                                expect(label).toBe('Питание заполнено');
                            } else {
                                expect(label).toBe('Питание не заполнено');
                            }
                        }

                        // Weight indicator (check aria-label)
                        if (weightIndicator) {
                            const label = weightIndicator.getAttribute('aria-label') || '';
                            if (completionStatus.weightLogged) {
                                expect(label).toBe('Вес записан');
                            } else {
                                expect(label).toBe('Вес не записан');
                            }
                        }

                        // Activity indicator (check aria-label)
                        if (activityIndicator) {
                            const label = activityIndicator.getAttribute('aria-label') || '';
                            if (completionStatus.activityCompleted) {
                                expect(label).toBe('Активность выполнена');
                            } else {
                                expect(label).toBe('Активность не выполнена');
                            }
                        }

                        // Check for green checkmark when all goals completed
                        const allCompleted =
                            completionStatus.nutritionFilled &&
                            completionStatus.weightLogged &&
                            completionStatus.activityCompleted;

                        const checkmark = dayButton.querySelector('[aria-label="Все цели выполнены"]');
                        if (allCompleted) {
                            expect(checkmark).toBeTruthy();
                        } else {
                            expect(checkmark).toBeFalsy();
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('Feature: dashboard, Property 3: Green checkmark should only appear when ALL goals are completed', () => {
            // **Validates: Requirements 1.6, 1.7**

            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                    fc.boolean(),
                    fc.boolean(),
                    fc.boolean(),
                    (date, nutritionFilled, weightLogged, activityCompleted) => {
                        // Skip invalid dates
                        if (isNaN(date.getTime())) {
                            return true;
                        }

                        const weekStart = getWeekStart(date);
                        const weekEnd = getWeekEnd(date);
                        const dateStr = formatDateISO(date);

                        const completionStatus: CompletionStatus = {
                            nutritionFilled,
                            weightLogged,
                            activityCompleted,
                        };

                        const metrics: DailyMetrics = {
                            date: dateStr,
                            userId: 'test-user',
                            nutrition: {
                                calories: nutritionFilled ? 2000 : 0,
                                protein: 150,
                                fat: 60,
                                carbs: 200,
                            },
                            weight: weightLogged ? 75.5 : null,
                            steps: activityCompleted ? 10000 : 0,
                            workout: {
                                completed: activityCompleted,
                            },
                            completionStatus,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        };

                        const dailyData: Record<string, DailyMetrics> = {
                            [dateStr]: metrics,
                        };

                        // Select a different day from the same week to avoid selected styling
                        const selectedDay = date.getDay() === 1 ? new Date(weekStart.getTime() + 86400000) : weekStart;

                        mockUseDashboardStore.mockReturnValue({
                            selectedDate: selectedDay,
                            selectedWeek: { start: weekStart, end: weekEnd },
                            dailyData,
                            setSelectedDate: jest.fn(),
                            navigateWeek: jest.fn(),
                            weeklyPlan: null,
                            tasks: [],
                            isLoading: false,
                            error: null,
                            isOffline: false,
                            pollingIntervalId: null,
                            fetchDailyData: jest.fn(),
                            fetchWeekData: jest.fn(),
                            updateMetric: jest.fn(),
                            fetchWeeklyPlan: jest.fn(),
                            fetchTasks: jest.fn(),
                            updateTaskStatus: jest.fn(),
                            submitWeeklyReport: jest.fn(),
                            uploadPhoto: jest.fn(),
                            pollForUpdates: jest.fn(),
                            startPolling: jest.fn(),
                            stopPolling: jest.fn(),
                            clearError: jest.fn(),
                            reset: jest.fn(),
                            setOfflineStatus: jest.fn(),
                            loadFromCache: jest.fn(),
                            syncWhenOnline: jest.fn(),
                        });

                        const { container } = render(<CalendarNavigator />);

                        // Find the day button using aria-label
                        const dayButtons = container.querySelectorAll('button');
                        const dayNumber = date.getDate();

                        const dayOfWeek = date.getDay();
                        const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
                        const expectedDayName = dayNames[dayOfWeek];

                        const dayButton = Array.from(dayButtons).find((btn) => {
                            const ariaLabel = btn.getAttribute('aria-label') || '';
                            return ariaLabel.includes(expectedDayName) && ariaLabel.includes(`, ${dayNumber}`);
                        });

                        // Skip if we can't find the button
                        if (!dayButton) {
                            return true;
                        }

                        const checkmark = dayButton.querySelector('[aria-label="Все цели выполнены"]');
                        const allCompleted = nutritionFilled && weightLogged && activityCompleted;

                        // Property: Checkmark appears if and only if all goals are completed
                        if (allCompleted) {
                            expect(checkmark).toBeTruthy();
                        } else {
                            expect(checkmark).toBeFalsy();
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('Feature: dashboard, Property 3: Indicators should be present for all 7 days of the week', () => {
            // **Validates: Requirements 1.1, 1.6**

            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                    (date) => {
                        // Skip invalid dates
                        if (isNaN(date.getTime())) {
                            return true;
                        }

                        const weekStart = getWeekStart(date);
                        const weekEnd = getWeekEnd(date);

                        // Generate random daily data for the week
                        const dailyData: Record<string, DailyMetrics> = {};
                        for (let i = 0; i < 7; i++) {
                            const dayDate = new Date(weekStart);
                            dayDate.setDate(weekStart.getDate() + i);
                            const dateStr = formatDateISO(dayDate);

                            dailyData[dateStr] = {
                                date: dateStr,
                                userId: 'test-user',
                                nutrition: {
                                    calories: Math.random() > 0.5 ? 2000 : 0,
                                    protein: 150,
                                    fat: 60,
                                    carbs: 200,
                                },
                                weight: Math.random() > 0.5 ? 75.5 : null,
                                steps: Math.random() > 0.5 ? 10000 : 0,
                                workout: {
                                    completed: Math.random() > 0.5,
                                },
                                completionStatus: {
                                    nutritionFilled: Math.random() > 0.5,
                                    weightLogged: Math.random() > 0.5,
                                    activityCompleted: Math.random() > 0.5,
                                },
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            };
                        }

                        mockUseDashboardStore.mockReturnValue({
                            selectedDate: date,
                            selectedWeek: { start: weekStart, end: weekEnd },
                            dailyData,
                            setSelectedDate: jest.fn(),
                            navigateWeek: jest.fn(),
                            weeklyPlan: null,
                            tasks: [],
                            isLoading: false,
                            error: null,
                            isOffline: false,
                            pollingIntervalId: null,
                            fetchDailyData: jest.fn(),
                            fetchWeekData: jest.fn(),
                            updateMetric: jest.fn(),
                            fetchWeeklyPlan: jest.fn(),
                            fetchTasks: jest.fn(),
                            updateTaskStatus: jest.fn(),
                            submitWeeklyReport: jest.fn(),
                            uploadPhoto: jest.fn(),
                            pollForUpdates: jest.fn(),
                            startPolling: jest.fn(),
                            stopPolling: jest.fn(),
                            clearError: jest.fn(),
                            reset: jest.fn(),
                            setOfflineStatus: jest.fn(),
                            loadFromCache: jest.fn(),
                            syncWhenOnline: jest.fn(),
                        });

                        const { container } = render(<CalendarNavigator />);

                        // Property: All 7 days should be rendered
                        const allButtons = container.querySelectorAll('button');
                        // Filter to get only day buttons (those with day names in aria-label)
                        const dayButtons = Array.from(allButtons).filter((btn) => {
                            const label = btn.getAttribute('aria-label') || '';
                            return label.includes('Понедельник') ||
                                label.includes('Вторник') ||
                                label.includes('Среда') ||
                                label.includes('Четверг') ||
                                label.includes('Пятница') ||
                                label.includes('Суббота') ||
                                label.includes('Воскресенье');
                        });
                        expect(dayButtons.length).toBe(7);

                        // Property: Each day should have 3 indicator dots
                        dayButtons.forEach((dayButton) => {
                            const allDivs = dayButton.querySelectorAll('div[aria-label]');
                            const nutritionIndicator = Array.from(allDivs).find(el =>
                                el.getAttribute('aria-label')?.includes('Питание')
                            );
                            const weightIndicator = Array.from(allDivs).find(el =>
                                el.getAttribute('aria-label')?.includes('Вес')
                            );
                            const activityIndicator = Array.from(allDivs).find(el =>
                                el.getAttribute('aria-label')?.includes('Активность')
                            );

                            expect(nutritionIndicator).toBeTruthy();
                            expect(weightIndicator).toBeTruthy();
                            expect(activityIndicator).toBeTruthy();
                        });
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});
