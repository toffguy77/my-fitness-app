/**
 * DatePicker Component Unit Tests
 *
 * Tests for date selection, navigation, and Russian localization.
 *
 * @module food-tracker/components/__tests__/DatePicker.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '../DatePicker';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a date at midnight to avoid timezone issues
 */
function createDate(year: number, month: number, day: number): Date {
    return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Get today's date at midnight
 */
function getToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

// ============================================================================
// Tests
// ============================================================================

describe('DatePicker', () => {
    const mockOnDateChange = jest.fn();

    beforeEach(() => {
        mockOnDateChange.mockClear();
        // Mock current date to January 15, 2025 for consistent tests
        jest.useFakeTimers();
        jest.setSystemTime(createDate(2025, 0, 15));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Date Display', () => {
        it('displays "Сегодня" prefix when selected date is today', () => {
            const today = getToday();
            render(<DatePicker selectedDate={today} onDateChange={mockOnDateChange} />);

            expect(screen.getByText(/Сегодня/)).toBeInTheDocument();
        });

        it('displays date in Russian format with month name', () => {
            const date = createDate(2025, 0, 15); // January 15, 2025
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            expect(screen.getByText(/15 января/)).toBeInTheDocument();
        });

        it('displays correct Russian month names for all months', () => {
            const months = [
                { month: 0, expected: 'января' },
                { month: 1, expected: 'февраля' },
                { month: 2, expected: 'марта' },
                { month: 3, expected: 'апреля' },
                { month: 4, expected: 'мая' },
                { month: 5, expected: 'июня' },
                { month: 6, expected: 'июля' },
                { month: 7, expected: 'августа' },
                { month: 8, expected: 'сентября' },
                { month: 9, expected: 'октября' },
                { month: 10, expected: 'ноября' },
                { month: 11, expected: 'декабря' },
            ];

            months.forEach(({ month, expected }) => {
                const { unmount } = render(
                    <DatePicker
                        selectedDate={createDate(2024, month, 10)}
                        onDateChange={mockOnDateChange}
                    />
                );
                expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
                unmount();
            });
        });

        it('does not show "Сегодня" prefix for past dates', () => {
            const pastDate = createDate(2025, 0, 10); // January 10, 2025
            render(<DatePicker selectedDate={pastDate} onDateChange={mockOnDateChange} />);

            expect(screen.queryByText(/Сегодня/)).not.toBeInTheDocument();
            expect(screen.getByText(/10 января/)).toBeInTheDocument();
        });
    });

    describe('Navigation Arrows', () => {
        it('navigates to previous day when left arrow is clicked', () => {
            const date = createDate(2025, 0, 15);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            const prevButton = screen.getByLabelText('Предыдущий день');
            fireEvent.click(prevButton);

            expect(mockOnDateChange).toHaveBeenCalledTimes(1);
            const newDate = mockOnDateChange.mock.calls[0][0];
            expect(newDate.getDate()).toBe(14);
            expect(newDate.getMonth()).toBe(0);
        });

        it('navigates to next day when right arrow is clicked', () => {
            const date = createDate(2025, 0, 10);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            const nextButton = screen.getByLabelText('Следующий день');
            fireEvent.click(nextButton);

            expect(mockOnDateChange).toHaveBeenCalledTimes(1);
            const newDate = mockOnDateChange.mock.calls[0][0];
            expect(newDate.getDate()).toBe(11);
        });

        it('handles month boundary when navigating backwards', () => {
            const date = createDate(2025, 1, 1); // February 1
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            const prevButton = screen.getByLabelText('Предыдущий день');
            fireEvent.click(prevButton);

            const newDate = mockOnDateChange.mock.calls[0][0];
            expect(newDate.getDate()).toBe(31);
            expect(newDate.getMonth()).toBe(0); // January
        });
    });

    describe('Future Date Prevention', () => {
        it('disables next button when selected date is today and preventFutureDates is true', () => {
            const today = getToday();
            render(
                <DatePicker
                    selectedDate={today}
                    onDateChange={mockOnDateChange}
                    preventFutureDates={true}
                />
            );

            const nextButton = screen.getByLabelText('Следующий день');
            expect(nextButton).toBeDisabled();
        });

        it('does not call onDateChange when clicking disabled next button', () => {
            const today = getToday();
            render(
                <DatePicker
                    selectedDate={today}
                    onDateChange={mockOnDateChange}
                    preventFutureDates={true}
                />
            );

            const nextButton = screen.getByLabelText('Следующий день');
            fireEvent.click(nextButton);

            expect(mockOnDateChange).not.toHaveBeenCalled();
        });

        it('allows navigation to future dates when preventFutureDates is false', () => {
            const today = getToday();
            render(
                <DatePicker
                    selectedDate={today}
                    onDateChange={mockOnDateChange}
                    preventFutureDates={false}
                />
            );

            const nextButton = screen.getByLabelText('Следующий день');
            expect(nextButton).not.toBeDisabled();

            fireEvent.click(nextButton);
            expect(mockOnDateChange).toHaveBeenCalledTimes(1);
        });
    });

    describe('Calendar Dropdown', () => {
        it('opens calendar when date display is clicked', () => {
            const date = createDate(2025, 0, 15);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Calendar should show day names in Russian
            expect(screen.getByText('Пн')).toBeInTheDocument();
            expect(screen.getByText('Вт')).toBeInTheDocument();
            expect(screen.getByText('Ср')).toBeInTheDocument();
        });

        it('closes calendar when a date is selected', () => {
            const date = createDate(2025, 0, 15);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Select a date
            const dayButton = screen.getByLabelText('10 января');
            fireEvent.click(dayButton);

            // Calendar should close
            expect(screen.queryByText('Пн')).not.toBeInTheDocument();
        });

        it('shows "Сегодня" button when selected date is not today', () => {
            const pastDate = createDate(2025, 0, 10);
            render(<DatePicker selectedDate={pastDate} onDateChange={mockOnDateChange} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            expect(screen.getByRole('button', { name: 'Сегодня' })).toBeInTheDocument();
        });

        it('navigates to today when "Сегодня" button is clicked', () => {
            const pastDate = createDate(2025, 0, 10);
            render(<DatePicker selectedDate={pastDate} onDateChange={mockOnDateChange} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Click "Сегодня" button
            const todayButton = screen.getByRole('button', { name: 'Сегодня' });
            fireEvent.click(todayButton);

            expect(mockOnDateChange).toHaveBeenCalledTimes(1);
            const newDate = mockOnDateChange.mock.calls[0][0];
            expect(newDate.getDate()).toBe(15); // Today is January 15
        });

        it('disables future dates in calendar when preventFutureDates is true', () => {
            const date = createDate(2025, 0, 10);
            render(
                <DatePicker
                    selectedDate={date}
                    onDateChange={mockOnDateChange}
                    preventFutureDates={true}
                />
            );

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Future date (January 20) should be disabled
            const futureDay = screen.getByLabelText('20 января');
            expect(futureDay).toBeDisabled();
        });

        it('navigates calendar months with arrow buttons', () => {
            const date = createDate(2025, 0, 15);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Navigate to previous month
            const prevMonthButton = screen.getByLabelText('Предыдущий месяц');
            fireEvent.click(prevMonthButton);

            // Should show December
            expect(screen.getByText(/Декабря 2024/i)).toBeInTheDocument();
        });

        it('navigates to previous year when going backward from January', () => {
            const date = createDate(2025, 0, 15); // January 2025
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Navigate to previous month
            const prevMonthButton = screen.getByLabelText('Предыдущий месяц');
            fireEvent.click(prevMonthButton);

            // Should show December 2024
            expect(screen.getByText(/Декабря 2024/i)).toBeInTheDocument();
        });

        it('navigates to next year when going forward from December', () => {
            const date = createDate(2024, 11, 15); // December 2024
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Navigate to next month
            const nextMonthButton = screen.getByLabelText('Следующий месяц');
            fireEvent.click(nextMonthButton);

            // Should show January 2025
            expect(screen.getByText(/Января 2025/i)).toBeInTheDocument();
        });

        it('navigates forward within same year', () => {
            const date = createDate(2025, 0, 15); // January 2025
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} preventFutureDates={false} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Navigate to next month
            const nextMonthButton = screen.getByLabelText('Следующий месяц');
            fireEvent.click(nextMonthButton);

            // Should show February 2025
            expect(screen.getByText(/Февраля 2025/i)).toBeInTheDocument();
        });

        it('does not select future dates when preventFutureDates is true', () => {
            const date = createDate(2025, 0, 10);
            render(
                <DatePicker
                    selectedDate={date}
                    onDateChange={mockOnDateChange}
                    preventFutureDates={true}
                />
            );

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // Try to click a future date (January 20)
            const futureDay = screen.getByLabelText('20 января');
            fireEvent.click(futureDay);

            // onDateChange should not be called
            expect(mockOnDateChange).not.toHaveBeenCalled();
        });

        it('does not show "Сегодня" button when selected date is today', () => {
            const today = getToday();
            render(<DatePicker selectedDate={today} onDateChange={mockOnDateChange} />);

            // Open calendar
            const calendarButton = screen.getByLabelText('Открыть календарь');
            fireEvent.click(calendarButton);

            // "Сегодня" button should not be present
            expect(screen.queryByRole('button', { name: 'Сегодня' })).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has proper ARIA labels for navigation buttons', () => {
            const date = createDate(2025, 0, 15);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            expect(screen.getByLabelText('Предыдущий день')).toBeInTheDocument();
            expect(screen.getByLabelText('Следующий день')).toBeInTheDocument();
            expect(screen.getByLabelText('Открыть календарь')).toBeInTheDocument();
        });

        it('has aria-expanded attribute on calendar button', () => {
            const date = createDate(2025, 0, 15);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            const calendarButton = screen.getByLabelText('Открыть календарь');
            expect(calendarButton).toHaveAttribute('aria-expanded', 'false');

            fireEvent.click(calendarButton);
            expect(calendarButton).toHaveAttribute('aria-expanded', 'true');
        });

        it('has focus-visible styles for keyboard navigation', () => {
            const date = createDate(2025, 0, 15);
            render(<DatePicker selectedDate={date} onDateChange={mockOnDateChange} />);

            const prevButton = screen.getByLabelText('Предыдущий день');
            expect(prevButton.className).toContain('focus:');
        });
    });
});
