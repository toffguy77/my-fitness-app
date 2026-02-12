'use client';

/**
 * DatePicker Component
 *
 * Date selection component for food tracker with Russian localization.
 * Displays date in format "Сегодня, [day] [month]" with navigation arrows.
 *
 * @module food-tracker/components/DatePicker
 */

import { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface DatePickerProps {
    /** Currently selected date */
    selectedDate: Date;
    /** Callback when date changes */
    onDateChange: (date: Date) => void;
    /** Whether to prevent navigation to future dates */
    preventFutureDates?: boolean;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Russian month names in genitive case (for "1 января" format)
 */
const RUSSIAN_MONTHS_GENITIVE = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
] as const;

/**
 * Russian day names for calendar
 */
const RUSSIAN_DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
}

/**
 * Check if date is today
 */
function isToday(date: Date): boolean {
    return isSameDay(date, new Date());
}

/**
 * Check if date is in the future
 */
function isFutureDate(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate > today;
}

/**
 * Format date in Russian format
 * Returns "Сегодня, 15 января" or "15 января"
 */
function formatDateRussian(date: Date, showToday: boolean = true): string {
    const day = date.getDate();
    const month = RUSSIAN_MONTHS_GENITIVE[date.getMonth()];

    if (showToday && isToday(date)) {
        return `Сегодня, ${day} ${month}`;
    }

    return `${day} ${month}`;
}

/**
 * Get days in month
 */
function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * Get first day of month (0 = Sunday, 1 = Monday, etc.)
 * Adjusted for Monday-first week
 */
function getFirstDayOfMonth(year: number, month: number): number {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Convert to Monday-first (0 = Monday)
}

// ============================================================================
// Component
// ============================================================================

export function DatePicker({
    selectedDate,
    onDateChange,
    preventFutureDates = true,
    className = '',
}: DatePickerProps) {
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(selectedDate.getMonth());
    const [calendarYear, setCalendarYear] = useState(selectedDate.getFullYear());

    // Navigate to previous day
    const goToPreviousDay = useCallback(() => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() - 1);
        onDateChange(newDate);
    }, [selectedDate, onDateChange]);

    // Navigate to next day
    const goToNextDay = useCallback(() => {
        const newDate = new Date(selectedDate);
        newDate.setDate(newDate.getDate() + 1);

        if (preventFutureDates && isFutureDate(newDate)) {
            return; // Don't navigate to future dates
        }

        onDateChange(newDate);
    }, [selectedDate, onDateChange, preventFutureDates]);

    // Go to today
    const goToToday = useCallback(() => {
        const today = new Date();
        onDateChange(today);
        setCalendarMonth(today.getMonth());
        setCalendarYear(today.getFullYear());
        setIsCalendarOpen(false);
    }, [onDateChange]);

    // Select date from calendar
    const selectDate = useCallback(
        (day: number) => {
            const newDate = new Date(calendarYear, calendarMonth, day);

            if (preventFutureDates && isFutureDate(newDate)) {
                return; // Don't select future dates
            }

            onDateChange(newDate);
            setIsCalendarOpen(false);
        },
        [calendarYear, calendarMonth, onDateChange, preventFutureDates]
    );

    // Navigate calendar month
    const navigateCalendarMonth = useCallback((direction: 'prev' | 'next') => {
        if (direction === 'prev') {
            if (calendarMonth === 0) {
                setCalendarMonth(11);
                setCalendarYear((y) => y - 1);
            } else {
                setCalendarMonth((m) => m - 1);
            }
        } else {
            if (calendarMonth === 11) {
                setCalendarMonth(0);
                setCalendarYear((y) => y + 1);
            } else {
                setCalendarMonth((m) => m + 1);
            }
        }
    }, [calendarMonth]);

    // Toggle calendar
    const toggleCalendar = useCallback(() => {
        if (!isCalendarOpen) {
            // Reset calendar to selected date when opening
            setCalendarMonth(selectedDate.getMonth());
            setCalendarYear(selectedDate.getFullYear());
        }
        setIsCalendarOpen((open) => !open);
    }, [isCalendarOpen, selectedDate]);

    // Check if next day button should be disabled
    const isNextDisabled = useMemo(() => {
        if (!preventFutureDates) return false;
        const nextDate = new Date(selectedDate);
        nextDate.setDate(nextDate.getDate() + 1);
        return isFutureDate(nextDate);
    }, [selectedDate, preventFutureDates]);

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
        const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
        const days: (number | null)[] = [];

        // Add empty cells for days before first day of month
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }

        // Add days of month
        for (let day = 1; day <= daysInMonth; day++) {
            days.push(day);
        }

        return days;
    }, [calendarYear, calendarMonth]);

    // Format display date
    const displayDate = formatDateRussian(selectedDate);

    return (
        <div className={`relative ${className}`}>
            {/* Date Display and Navigation */}
            <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-200 p-1.5 sm:p-2">
                {/* Previous Day Button */}
                <button
                    type="button"
                    onClick={goToPreviousDay}
                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-2 touch-manipulation"
                    aria-label="Предыдущий день"
                >
                    <ChevronLeft className="w-4 h-4 text-gray-600 sm:w-5 sm:h-5" />
                </button>

                {/* Date Display */}
                <button
                    type="button"
                    onClick={toggleCalendar}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-2 sm:px-4 sm:py-2 touch-manipulation"
                    aria-label="Открыть календарь"
                    aria-expanded={isCalendarOpen}
                >
                    <Calendar className="w-4 h-4 text-gray-500 sm:w-5 sm:h-5" aria-hidden="true" />
                    <span className="text-sm font-medium text-gray-900 sm:text-base">{displayDate}</span>
                </button>

                {/* Next Day Button */}
                <button
                    type="button"
                    onClick={goToNextDay}
                    disabled={isNextDisabled}
                    className={`p-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-2 touch-manipulation ${isNextDisabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'hover:bg-gray-100 text-gray-600'
                        }`}
                    aria-label="Следующий день"
                >
                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
            </div>

            {/* Calendar Dropdown */}
            {isCalendarOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50 sm:p-4">
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <button
                            type="button"
                            onClick={() => navigateCalendarMonth('prev')}
                            className="p-1 rounded hover:bg-gray-100 transition-colors touch-manipulation"
                            aria-label="Предыдущий месяц"
                        >
                            <ChevronLeft className="w-4 h-4 text-gray-600 sm:w-5 sm:h-5" />
                        </button>
                        <span className="text-xs font-medium text-gray-900 sm:text-sm">
                            {RUSSIAN_MONTHS_GENITIVE[calendarMonth].charAt(0).toUpperCase() +
                                RUSSIAN_MONTHS_GENITIVE[calendarMonth].slice(1)}{' '}
                            {calendarYear}
                        </span>
                        <button
                            type="button"
                            onClick={() => navigateCalendarMonth('next')}
                            className="p-1 rounded hover:bg-gray-100 transition-colors touch-manipulation"
                            aria-label="Следующий месяц"
                        >
                            <ChevronRight className="w-4 h-4 text-gray-600 sm:w-5 sm:h-5" />
                        </button>
                    </div>

                    {/* Day Names */}
                    <div className="grid grid-cols-7 gap-0.5 mb-1.5 sm:gap-1 sm:mb-2">
                        {RUSSIAN_DAYS_SHORT.map((day) => (
                            <div
                                key={day}
                                className="text-center text-[10px] font-medium text-gray-500 py-0.5 sm:text-xs sm:py-1"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                        {calendarDays.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="p-1.5 sm:p-2" />;
                            }

                            const dayDate = new Date(calendarYear, calendarMonth, day);
                            const isSelected = isSameDay(dayDate, selectedDate);
                            const isTodayDate = isToday(dayDate);
                            const isFuture = preventFutureDates && isFutureDate(dayDate);

                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => selectDate(day)}
                                    disabled={isFuture}
                                    className={`p-1.5 text-xs rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-2 sm:text-sm touch-manipulation ${isSelected
                                        ? 'bg-blue-500 text-white'
                                        : isTodayDate
                                            ? 'bg-blue-100 text-blue-700'
                                            : isFuture
                                                ? 'text-gray-300 cursor-not-allowed'
                                                : 'hover:bg-gray-100 text-gray-700'
                                        }`}
                                    aria-label={`${day} ${RUSSIAN_MONTHS_GENITIVE[calendarMonth]}`}
                                    aria-selected={isSelected}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>

                    {/* Today Button */}
                    {!isToday(selectedDate) && (
                        <button
                            type="button"
                            onClick={goToToday}
                            className="w-full mt-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:mt-4 sm:py-2 sm:text-sm touch-manipulation"
                        >
                            Сегодня
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default DatePicker;
