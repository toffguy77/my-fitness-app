/**
 * CalendarNavigator Component
 *
 * Displays a week view (Mon-Sun) with day selection, navigation, and goal completion indicators.
 * Shows "Submit weekly report" button on Sunday.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.8
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized DayButton sub-component
 * - Memoized helper functions
 */

'use client';

import { useRef, memo, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';
import { useRovingTabIndex } from '../hooks/useKeyboardNavigation';

/**
 * Day names in Russian (short form)
 */
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Day names in Russian (full form) for accessibility
 */
const DAY_NAMES_FULL = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье',
];

/**
 * Helper: Format date to display format (DD)
 */
function formatDayNumber(date: Date): string {
    return date.getDate().toString();
}

/**
 * Helper: Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
}

/**
 * Helper: Get day of week (0 = Monday, 6 = Sunday)
 */
function getDayOfWeek(date: Date): number {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1; // Convert Sunday from 0 to 6
}

/**
 * Helper: Check if date is Sunday
 */
function isSunday(date: Date): boolean {
    return date.getDay() === 0;
}

/**
 * Helper: Format date to ISO string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Helper: Generate array of 7 days for the week
 */
function getWeekDays(weekStart: Date): Date[] {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        days.push(day);
    }
    return days;
}

/**
 * CalendarNavigator Props
 */
export interface CalendarNavigatorProps {
    className?: string;
    onSubmitReport?: () => void;
}

/**
 * DayButton Props
 */
interface DayButtonProps {
    date: Date;
    isToday: boolean;
    isSelected: boolean;
    allGoalsCompleted: boolean;
    completionStatus: {
        nutritionFilled: boolean;
        weightLogged: boolean;
        activityCompleted: boolean;
    };
    dayOfWeek: number;
    onClick: (date: Date) => void;
}

/**
 * DayButton Component
 * Memoized to prevent unnecessary re-renders
 */
const DayButton = memo(function DayButton({
    date,
    isToday,
    isSelected,
    allGoalsCompleted,
    completionStatus,
    dayOfWeek,
    onClick,
}: DayButtonProps) {
    const handleClick = useCallback(() => {
        onClick(date);
    }, [date, onClick]);

    return (
        <button
            onClick={handleClick}
            data-navigable="true"
            role="radio"
            aria-checked={isSelected}
            className={`
                relative flex flex-col items-center justify-center p-3 rounded-lg
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${isSelected
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-white hover:bg-gray-50 text-gray-700'
                }
                ${isToday && !isSelected ? 'ring-2 ring-blue-300' : ''}
            `}
            aria-label={`${DAY_NAMES_FULL[dayOfWeek]}, ${formatDayNumber(date)}`}
            aria-current={isToday ? 'date' : undefined}
        >
            {/* Day name */}
            <span className="text-xs font-medium mb-1">
                {DAY_NAMES[dayOfWeek]}
            </span>

            {/* Day number */}
            <span className="text-lg font-semibold">
                {formatDayNumber(date)}
            </span>

            {/* Goal completion indicators */}
            <div className="flex gap-1 mt-2" role="group" aria-label="Статус целей">
                {/* Nutrition indicator */}
                <div
                    className={`flex items-center justify-center w-4 h-4 rounded-full ${completionStatus.nutritionFilled
                        ? isSelected
                            ? 'bg-white'
                            : 'bg-green-500'
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
                            className={`w-2.5 h-2.5 ${isSelected ? 'text-green-500' : 'text-white'
                                }`}
                            aria-hidden="true"
                        />
                    )}
                </div>

                {/* Weight indicator */}
                <div
                    className={`flex items-center justify-center w-4 h-4 rounded-full ${completionStatus.weightLogged
                        ? isSelected
                            ? 'bg-white'
                            : 'bg-green-500'
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
                            className={`w-2.5 h-2.5 ${isSelected ? 'text-green-500' : 'text-white'
                                }`}
                            aria-hidden="true"
                        />
                    )}
                </div>

                {/* Activity indicator */}
                <div
                    className={`flex items-center justify-center w-4 h-4 rounded-full ${completionStatus.activityCompleted
                        ? isSelected
                            ? 'bg-white'
                            : 'bg-green-500'
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
                            className={`w-2.5 h-2.5 ${isSelected ? 'text-green-500' : 'text-white'
                                }`}
                            aria-hidden="true"
                        />
                    )}
                </div>
            </div>

            {/* All goals completed checkmark */}
            {allGoalsCompleted && (
                <div
                    className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${isSelected ? 'bg-white' : 'bg-green-500'
                        }`}
                    aria-label="Все цели выполнены"
                >
                    <Check
                        className={`w-3 h-3 ${isSelected ? 'text-green-500' : 'text-white'
                            }`}
                    />
                </div>
            )}
        </button>
    );
});

/**
 * CalendarNavigator Component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const CalendarNavigator = memo(function CalendarNavigator({
    className = '',
    onSubmitReport,
}: CalendarNavigatorProps) {
    const {
        selectedDate,
        selectedWeek,
        dailyData,
        setSelectedDate,
        navigateWeek,
    } = useDashboardStore();

    const today = useMemo(() => new Date(), []);
    const weekDays = useMemo(() => getWeekDays(selectedWeek.start), [selectedWeek.start]);
    const isCurrentWeek = useMemo(() => isSameDay(selectedWeek.start, getWeekStart(today)), [selectedWeek.start, today]);
    const showSubmitButton = isCurrentWeek && isSunday(today);

    // Keyboard navigation for calendar days
    const daysContainerRef = useRef<HTMLDivElement>(null);
    const selectedDayIndex = useMemo(() =>
        weekDays.findIndex(day => isSameDay(day, selectedDate)),
        [weekDays, selectedDate]
    );

    useRovingTabIndex(daysContainerRef as React.RefObject<HTMLElement>, {
        orientation: 'horizontal',
        loop: true,
        initialIndex: selectedDayIndex >= 0 ? selectedDayIndex : 0,
    });

    /**
     * Handle day selection - memoized
     */
    const handleDayClick = useCallback((date: Date) => {
        setSelectedDate(date);
    }, [setSelectedDate]);

    /**
     * Handle previous week navigation - memoized
     */
    const handlePrevWeek = useCallback(() => {
        navigateWeek('prev');
    }, [navigateWeek]);

    /**
     * Handle next week navigation - memoized
     */
    const handleNextWeek = useCallback(() => {
        navigateWeek('next');
    }, [navigateWeek]);

    /**
     * Handle submit report button click - memoized
     */
    const handleSubmitReport = useCallback(() => {
        if (onSubmitReport) {
            onSubmitReport();
        }
    }, [onSubmitReport]);

    /**
     * Check if all goals are completed for a day
     */
    const isAllGoalsCompleted = useCallback((date: Date): boolean => {
        const dateStr = formatDateISO(date);
        const metrics = dailyData[dateStr];

        if (!metrics || !metrics.completionStatus) return false;

        const { completionStatus } = metrics;
        return (
            completionStatus.nutritionFilled &&
            completionStatus.weightLogged &&
            completionStatus.activityCompleted
        );
    }, [dailyData]);

    /**
     * Get completion status for a day
     */
    const getCompletionStatus = useCallback((date: Date) => {
        const dateStr = formatDateISO(date);
        const metrics = dailyData[dateStr];

        if (!metrics || !metrics.completionStatus) {
            return {
                nutritionFilled: false,
                weightLogged: false,
                activityCompleted: false,
            };
        }

        return metrics.completionStatus;
    }, [dailyData]);

    // Memoize week range display
    const weekRangeDisplay = useMemo(() =>
        formatWeekRange(selectedWeek.start, selectedWeek.end),
        [selectedWeek.start, selectedWeek.end]
    );

    return (
        <div className={`calendar-navigator ${className}`}>
            {/* Week Navigation Header */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={handlePrevWeek}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Предыдущая неделя"
                >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>

                <div className="text-sm font-medium text-gray-700">
                    {weekRangeDisplay}
                </div>

                <button
                    onClick={handleNextWeek}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Следующая неделя"
                >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
            </div>

            {/* Days Grid */}
            <div
                ref={daysContainerRef}
                className="grid grid-cols-7 gap-2"
                role="radiogroup"
                aria-label="Выбор дня недели"
            >
                {weekDays.map((date) => {
                    const isTodayDate = isSameDay(date, today);
                    const isSelected = isSameDay(date, selectedDate);
                    const allGoalsCompleted = isAllGoalsCompleted(date);
                    const completionStatus = getCompletionStatus(date);
                    const dayOfWeek = getDayOfWeek(date);

                    return (
                        <DayButton
                            key={date.toISOString()}
                            date={date}
                            isToday={isTodayDate}
                            isSelected={isSelected}
                            allGoalsCompleted={allGoalsCompleted}
                            completionStatus={completionStatus}
                            dayOfWeek={dayOfWeek}
                            onClick={handleDayClick}
                        />
                    );
                })}
            </div>

            {/* Submit Weekly Report Button */}
            {showSubmitButton && (
                <div className="mt-4">
                    <button
                        onClick={handleSubmitReport}
                        className="w-full py-3 px-4 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 animate-pulse"
                        aria-label="Отправить недельный отчет"
                    >
                        Отправить недельный отчет
                    </button>
                </div>
            )}
        </div>
    );
});

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
 * Helper: Format week range for display
 */
function formatWeekRange(start: Date, end: Date): string {
    const startDay = start.getDate();
    const endDay = end.getDate();
    const startMonth = start.toLocaleString('ru-RU', { month: 'short' });
    const endMonth = end.toLocaleString('ru-RU', { month: 'short' });

    if (start.getMonth() === end.getMonth()) {
        return `${startDay}–${endDay} ${startMonth}`;
    }

    return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}
