/**
 * CalendarNavigator Component Tests
 *
 * Tests for calendar navigation, day selection, goal indicators, and submit button
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarNavigator } from '../CalendarNavigator';
import { useDashboardStore } from '../../store/dashboardStore';
import type { DailyMetrics } from '../../types';

// Mock the dashboard store
jest.mock('../../store/dashboardStore');

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    ChevronLeft: () => <div data-testid="chevron-left" />,
    ChevronRight: () => <div data-testid="chevron-right" />,
    Check: () => <div data-testid="check-icon" />,
}));

describe('CalendarNavigator', () => {
    const mockSetSelectedDate = jest.fn();
    const mockNavigateWeek = jest.fn();

    // Helper to create mock daily metrics
    const createMockMetrics = (overrides?: Partial<DailyMetrics>): DailyMetrics => ({
        date: '2024-01-15',
        userId: '1',
        nutrition: {
            calories: 0,
            protein: 0,
            fat: 0,
            carbs: 0,
        },
        weight: null,
        steps: 0,
        workout: { completed: false },
        completionStatus: {
            nutritionFilled: false,
            weightLogged: false,
            activityCompleted: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    });

    // Helper to get week start (Monday)
    const getWeekStart = (date: Date): Date => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    // Helper to get week end (Sunday)
    const getWeekEnd = (date: Date): Date => {
        const start = getWeekStart(date);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return end;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mock implementation
        const today = new Date('2024-01-15T12:00:00Z'); // Monday
        const weekStart = getWeekStart(today);
        const weekEnd = getWeekEnd(today);

        (useDashboardStore as unknown as jest.Mock).mockReturnValue({
            selectedDate: today,
            selectedWeek: {
                start: weekStart,
                end: weekEnd,
            },
            dailyData: {},
            setSelectedDate: mockSetSelectedDate,
            navigateWeek: mockNavigateWeek,
        });
    });

    describe('Rendering', () => {
        it('renders calendar with 7 days', () => {
            render(<CalendarNavigator />);

            // Check that all 7 day names are rendered
            expect(screen.getByText('Пн')).toBeInTheDocument();
            expect(screen.getByText('Вт')).toBeInTheDocument();
            expect(screen.getByText('Ср')).toBeInTheDocument();
            expect(screen.getByText('Чт')).toBeInTheDocument();
            expect(screen.getByText('Пт')).toBeInTheDocument();
            expect(screen.getByText('Сб')).toBeInTheDocument();
            expect(screen.getByText('Вс')).toBeInTheDocument();
        });

        it('renders navigation buttons', () => {
            render(<CalendarNavigator />);

            expect(screen.getByLabelText('Предыдущая неделя')).toBeInTheDocument();
            expect(screen.getByLabelText('Следующая неделя')).toBeInTheDocument();
        });

        it('renders week range', () => {
            render(<CalendarNavigator />);

            // Week range should be displayed (format: "15–21 янв")
            const weekRange = screen.getByText(/15–21/);
            expect(weekRange).toBeInTheDocument();
        });

        it('applies custom className', () => {
            const { container } = render(<CalendarNavigator className="custom-class" />);

            const navigator = container.querySelector('.calendar-navigator');
            expect(navigator).toHaveClass('custom-class');
        });
    });

    describe('Day Selection', () => {
        it('highlights selected day', () => {
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: today,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            // Find the button for day 15 (Monday)
            const dayButton = screen.getByLabelText(/Понедельник, 15/);
            expect(dayButton).toHaveClass('bg-blue-500', 'text-white');
            expect(dayButton).toHaveAttribute('aria-checked', 'true');
        });

        it('calls setSelectedDate when day is clicked', () => {
            render(<CalendarNavigator />);

            // Click on Tuesday (16th)
            const tuesdayButton = screen.getByLabelText(/Вторник, 16/);
            fireEvent.click(tuesdayButton);

            expect(mockSetSelectedDate).toHaveBeenCalledTimes(1);
            expect(mockSetSelectedDate).toHaveBeenCalledWith(expect.any(Date));

            // Verify the date is correct (Tuesday, Jan 16)
            const calledDate = mockSetSelectedDate.mock.calls[0][0];
            expect(calledDate.getDate()).toBe(16);
        });
    });

    describe('Week Navigation', () => {
        it('calls navigateWeek with "prev" when previous button clicked', () => {
            render(<CalendarNavigator />);

            const prevButton = screen.getByLabelText('Предыдущая неделя');
            fireEvent.click(prevButton);

            expect(mockNavigateWeek).toHaveBeenCalledWith('prev');
        });

        it('calls navigateWeek with "next" when next button clicked', () => {
            render(<CalendarNavigator />);

            const nextButton = screen.getByLabelText('Следующая неделя');
            fireEvent.click(nextButton);

            expect(mockNavigateWeek).toHaveBeenCalledWith('next');
        });

        it('updates week range when navigating', () => {
            // First render with initial week (Jan 15-21)
            const { rerender } = render(<CalendarNavigator />);

            // Verify initial week range
            expect(screen.getByText(/15–21/)).toBeInTheDocument();

            // Now update the mock to simulate navigation to next week
            const newWeekStart = new Date('2024-01-22T00:00:00');
            const newWeekEnd = new Date('2024-01-28T00:00:00');

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: newWeekStart,
                selectedWeek: {
                    start: newWeekStart,
                    end: newWeekEnd,
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            // Force re-render with new key to trigger hook re-evaluation
            rerender(<CalendarNavigator key="new-week" />);

            // Week range should update (format: "22–28 янв.")
            expect(screen.getByText(/22–28/)).toBeInTheDocument();
        });
    });

    describe('Goal Completion Indicators', () => {
        it('shows empty indicators when no data', () => {
            render(<CalendarNavigator />);

            // All indicators should be gray (not completed)
            const mondayButton = screen.getByLabelText(/Понедельник, 15/);
            const indicators = mondayButton.querySelectorAll('.rounded-full');

            // Should have 3 indicators (nutrition, weight, activity)
            expect(indicators).toHaveLength(3);

            // All should be gray (bg-gray-300)
            indicators.forEach((indicator) => {
                expect(indicator).toHaveClass('bg-gray-300');
            });
        });

        it('shows green indicators when goals completed', () => {
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            const completedMetrics = createMockMetrics({
                date: '2024-01-15',
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: true,
                    activityCompleted: true,
                },
            });

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: today,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {
                    '2024-01-15': completedMetrics,
                },
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            const mondayButton = screen.getByLabelText(/Понедельник, 15/);
            const indicators = mondayButton.querySelectorAll('.w-1\\.5.h-1\\.5.rounded-full');

            // All indicators should be green (bg-green-500) or white (if selected)
            indicators.forEach((indicator) => {
                expect(
                    indicator.classList.contains('bg-green-500') ||
                    indicator.classList.contains('bg-white')
                ).toBe(true);
            });
        });

        it('shows checkmark when all goals completed', () => {
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            const completedMetrics = createMockMetrics({
                date: '2024-01-15',
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: true,
                    activityCompleted: true,
                },
            });

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: new Date('2024-01-16T12:00:00Z'), // Different day selected
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {
                    '2024-01-15': completedMetrics,
                },
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            // Check icons should be present (3 for individual goals + 1 for all goals completed)
            const checkIcons = screen.getAllByTestId('check-icon');
            expect(checkIcons.length).toBeGreaterThanOrEqual(1);

            // Verify aria-label for all goals completed
            const checkmark = screen.getByLabelText('Все цели выполнены');
            expect(checkmark).toBeInTheDocument();
        });

        it('shows partial completion correctly', () => {
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            const partialMetrics = createMockMetrics({
                date: '2024-01-15',
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: false,
                    activityCompleted: true,
                },
            });

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: new Date('2024-01-16T12:00:00Z'),
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {
                    '2024-01-15': partialMetrics,
                },
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            // Should NOT show checkmark (not all goals completed)
            expect(screen.queryByLabelText('Все цели выполнены')).not.toBeInTheDocument();
        });
    });

    describe('Submit Weekly Report Button', () => {
        it('does not show submit button on non-Sunday', () => {
            // Monday
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: today,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            expect(screen.queryByLabelText('Отправить недельный отчет')).not.toBeInTheDocument();
        });

        it('does not show submit button for past weeks', () => {
            // Viewing previous week
            const today = new Date('2024-01-21T12:00:00Z');
            const previousWeekStart = new Date('2024-01-08T12:00:00Z');

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: previousWeekStart,
                selectedWeek: {
                    start: previousWeekStart,
                    end: getWeekEnd(previousWeekStart),
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            expect(screen.queryByLabelText('Отправить недельный отчет')).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has proper ARIA labels for day buttons', () => {
            render(<CalendarNavigator />);

            // Check full day names in aria-labels
            expect(screen.getByLabelText(/Понедельник/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Вторник/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Среда/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Четверг/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Пятница/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Суббота/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Воскресенье/)).toBeInTheDocument();
        });

        it('has proper ARIA labels for navigation buttons', () => {
            render(<CalendarNavigator />);

            expect(screen.getByLabelText('Предыдущая неделя')).toBeInTheDocument();
            expect(screen.getByLabelText('Следующая неделя')).toBeInTheDocument();
        });

        it('has proper ARIA labels for goal indicators', () => {
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            const metrics = createMockMetrics({
                date: '2024-01-15',
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: false,
                    activityCompleted: true,
                },
            });

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: today,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {
                    '2024-01-15': metrics,
                },
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            // Use getAllByLabelText since there are multiple days with indicators
            const nutritionFilled = screen.getAllByLabelText('Питание заполнено');
            expect(nutritionFilled.length).toBeGreaterThan(0);

            const weightNotLogged = screen.getAllByLabelText('Вес не записан');
            expect(weightNotLogged.length).toBeGreaterThan(0);

            const activityCompleted = screen.getAllByLabelText('Активность выполнена');
            expect(activityCompleted.length).toBeGreaterThan(0);
        });

        it('has focus indicators on interactive elements', () => {
            render(<CalendarNavigator />);

            const prevButton = screen.getByLabelText('Предыдущая неделя');
            expect(prevButton).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500');

            const dayButton = screen.getByLabelText(/Понедельник, 15/);
            expect(dayButton).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500');
        });

        it('sets aria-pressed on selected day', () => {
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: today,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            const mondayButton = screen.getByLabelText(/Понедельник, 15/);
            expect(mondayButton).toHaveAttribute('aria-checked', 'true');

            const tuesdayButton = screen.getByLabelText(/Вторник, 16/);
            expect(tuesdayButton).toHaveAttribute('aria-checked', 'false');
        });
    });

    describe('Edge Cases', () => {
        it('handles month transitions correctly', () => {
            // Week spanning two months (Jan 29 - Feb 4)
            const weekStart = new Date('2024-01-29T12:00:00Z');

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: weekStart,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(weekStart),
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            // Week range should show both months (format may vary: "янв." or "янв")
            const weekRange = screen.getByText(/29 янв\.? – 4 февр?\.?/);
            expect(weekRange).toBeInTheDocument();
        });

        it('handles year transitions correctly', () => {
            // Week spanning two years (Dec 30 - Jan 5)
            const weekStart = new Date('2024-12-30T12:00:00Z');

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: weekStart,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(weekStart),
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            // Should render without errors
            expect(screen.getByText('Пн')).toBeInTheDocument();
        });

        it('handles empty dailyData gracefully', () => {
            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: new Date('2024-01-15T12:00:00Z'),
                selectedWeek: {
                    start: new Date('2024-01-15T12:00:00Z'),
                    end: new Date('2024-01-21T12:00:00Z'),
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            // Should render without errors
            expect(screen.getByText('Пн')).toBeInTheDocument();

            // All indicators should be gray
            const mondayButton = screen.getByLabelText(/Понедельник, 15/);
            const indicators = mondayButton.querySelectorAll('.w-1\\.5.h-1\\.5.rounded-full');
            indicators.forEach((indicator) => {
                expect(indicator).toHaveClass('bg-gray-300');
            });
        });

        it('handles missing completionStatus gracefully', () => {
            const today = new Date('2024-01-15T12:00:00Z');
            const weekStart = getWeekStart(today);

            // Metrics without completionStatus
            const incompleteMetrics = {
                date: '2024-01-15',
                userId: 1,
                nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                weight: null,
                steps: 0,
                workout: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as any;

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: today,
                selectedWeek: {
                    start: weekStart,
                    end: getWeekEnd(today),
                },
                dailyData: {
                    '2024-01-15': incompleteMetrics,
                },
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            // Should not crash
            expect(() => render(<CalendarNavigator />)).not.toThrow();
        });
    });

    describe('Attention Indicators (Requirement 15.9)', () => {
        it('shows pulsing animation on submit button on Sunday', () => {
            // Use fake timers to control the current date
            jest.useFakeTimers();
            const sunday = new Date('2024-01-21T12:00:00Z');
            jest.setSystemTime(sunday);

            const weekStart = new Date('2024-01-15T00:00:00Z');
            const weekEnd = new Date('2024-01-21T00:00:00Z');

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: sunday,
                selectedWeek: {
                    start: weekStart,
                    end: weekEnd,
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            const submitButton = screen.getByLabelText('Отправить недельный отчет');
            expect(submitButton).toHaveClass('animate-pulse');

            jest.useRealTimers();
        });

        it('submit button calls onSubmitReport when clicked', () => {
            const mockOnSubmitReport = jest.fn();

            // Use fake timers to control the current date
            jest.useFakeTimers();
            const sunday = new Date('2024-01-21T12:00:00Z');
            jest.setSystemTime(sunday);

            const weekStart = new Date('2024-01-15T00:00:00Z');
            const weekEnd = new Date('2024-01-21T00:00:00Z');

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: sunday,
                selectedWeek: {
                    start: weekStart,
                    end: weekEnd,
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator onSubmitReport={mockOnSubmitReport} />);

            const submitButton = screen.getByLabelText('Отправить недельный отчет');
            fireEvent.click(submitButton);

            expect(mockOnSubmitReport).toHaveBeenCalledTimes(1);

            jest.useRealTimers();
        });

        it('has proper ARIA label for submit button', () => {
            // Use fake timers to control the current date
            jest.useFakeTimers();
            const sunday = new Date('2024-01-21T12:00:00Z');
            jest.setSystemTime(sunday);

            const weekStart = new Date('2024-01-15T00:00:00Z');
            const weekEnd = new Date('2024-01-21T00:00:00Z');

            (useDashboardStore as unknown as jest.Mock).mockReturnValue({
                selectedDate: sunday,
                selectedWeek: {
                    start: weekStart,
                    end: weekEnd,
                },
                dailyData: {},
                setSelectedDate: mockSetSelectedDate,
                navigateWeek: mockNavigateWeek,
            });

            render(<CalendarNavigator />);

            const submitButton = screen.getByLabelText('Отправить недельный отчет');
            expect(submitButton).toBeInTheDocument();

            jest.useRealTimers();
        });
    })
})
