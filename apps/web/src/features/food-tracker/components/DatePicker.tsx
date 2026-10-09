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
import { t } from '@/shared/i18n';
import { Button } from '@/shared/components/ui/Button';

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
    t('months.genitive.january'),
    t('months.genitive.february'),
    t('months.genitive.march'),
    t('months.genitive.april'),
    t('months.genitive.may'),
    t('months.genitive.june'),
    t('months.genitive.july'),
    t('months.genitive.august'),
    t('months.genitive.september'),
    t('months.genitive.october'),
    t('months.genitive.november'),
    t('months.genitive.december'),
] as const;

/**
 * Russian day names for calendar
 */
const RUSSIAN_DAYS_SHORT = [
    t('weekdays.short.mon'),
    t('weekdays.short.tue'),
    t('weekdays.short.wed'),
    t('weekdays.short.thu'),
    t('weekdays.short.fri'),
    t('weekdays.short.sat'),
    t('weekdays.short.sun'),
] as const;

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
        return t('foodTracker.datePicker.todayWithDate', { day, month });
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
            <div className="flex items-center justify-between gap-2">
                {/* Previous Day Button */}
                <button
                    type="button"
                    onClick={goToPreviousDay}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:bg-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                    aria-label={t('foodTracker.datePicker.previousDay')}
                >
                    <ChevronLeft className="h-5 w-5 text-fg" strokeWidth={1.8} aria-hidden="true" />
                </button>

                {/* Date Display */}
                <button
                    type="button"
                    onClick={toggleCalendar}
                    className="flex h-11 items-center gap-2 rounded-full px-4 hover:bg-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                    aria-label={t('foodTracker.datePicker.openCalendar')}
                    aria-expanded={isCalendarOpen}
                >
                    <Calendar className="h-5 w-5 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                    <span className="text-base font-semibold text-fg first-letter:uppercase">{displayDate}</span>
                </button>

                {/* Next Day Button */}
                <button
                    type="button"
                    onClick={goToNextDay}
                    disabled={isNextDisabled}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border border-line transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation ${isNextDisabled
                        ? 'text-fg-subtle opacity-40 cursor-not-allowed'
                        : 'hover:bg-surface text-fg'
                        }`}
                    aria-label={t('foodTracker.datePicker.nextDay')}
                >
                    <ChevronRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </button>
            </div>

            {/* Calendar Dropdown */}
            {isCalendarOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-card border border-line bg-surface p-4 shadow-overlay">
                    {/* Calendar Header */}
                    <div className="mb-3 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => navigateCalendarMonth('prev')}
                            className="-m-1 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                            aria-label={t('foodTracker.datePicker.previousMonth')}
                        >
                            <ChevronLeft className="h-5 w-5 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                        </button>
                        <span className="type-headline text-fg tabular-nums">
                            {RUSSIAN_MONTHS_GENITIVE[calendarMonth].charAt(0).toUpperCase() +
                                RUSSIAN_MONTHS_GENITIVE[calendarMonth].slice(1)}{' '}
                            {calendarYear}
                        </span>
                        <button
                            type="button"
                            onClick={() => navigateCalendarMonth('next')}
                            className="-m-1 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                            aria-label={t('foodTracker.datePicker.nextMonth')}
                        >
                            <ChevronRight className="h-5 w-5 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                        </button>
                    </div>

                    {/* Day Names */}
                    <div className="mb-1 grid grid-cols-7 gap-1">
                        {RUSSIAN_DAYS_SHORT.map((day) => (
                            <div
                                key={day}
                                className="py-1 text-center text-xs font-medium text-fg-subtle"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Days */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="h-11" />;
                            }

                            const dayDate = new Date(calendarYear, calendarMonth, day);
                            const isSelected = isSameDay(dayDate, selectedDate);
                            const isTodayDate = isToday(dayDate);
                            // Сегодня — пунктирное кольцо, как в недельных точках:
                            // отметка места, не оценка и не бренд.
                            const isFuture = preventFutureDates && isFutureDate(dayDate);

                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => selectDate(day)}
                                    disabled={isFuture}
                                    className={`flex h-11 w-full items-center justify-center rounded-full text-sm tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation ${isSelected
                                        ? 'bg-fg font-semibold text-fg-inverse'
                                        : isTodayDate
                                            ? 'border border-dashed border-line-strong font-semibold text-fg'
                                            : isFuture
                                                ? 'text-fg-subtle cursor-not-allowed'
                                                : 'hover:bg-subtle text-fg'
                                        }`}
                                    aria-label={`${day} ${RUSSIAN_MONTHS_GENITIVE[calendarMonth]}`}
                                    // Кнопка не поддерживает aria-selected: для выбранной
                                    // даты в сетке это aria-current.
                                    aria-current={isSelected ? 'date' : undefined}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>

                    {/* Today Button */}
                    {!isToday(selectedDate) && (
                        <Button
                            type="button"
                            variant="secondary"
                            block
                            onClick={goToToday}
                            className="mt-3 touch-manipulation"
                        >
                            {t('foodTracker.datePicker.today')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

export default DatePicker;
