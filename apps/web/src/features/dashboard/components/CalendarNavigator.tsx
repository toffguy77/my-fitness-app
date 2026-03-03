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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDashboardStore } from '../store/dashboardStore';
import { useRovingTabIndex } from '../hooks/useKeyboardNavigation';
import { formatLocalDate } from '@/shared/utils/format';

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
    return formatLocalDate(date);
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
    completedCount: number;
    dayOfWeek: number;
    onClick: (date: Date) => void;
}

/**
 * ProgressRing Props
 */
interface ProgressRingProps {
    completedCount: number;
    isSelected: boolean;
}

const RING_SIZE = 36;
const RING_RADIUS = 15;
const RING_STROKE = 2.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ARC_COUNT = 3;
const GAP_DEGREES = 4;
const GAP_LENGTH = (GAP_DEGREES / 360) * RING_CIRCUMFERENCE;
const ARC_LENGTH = (RING_CIRCUMFERENCE - ARC_COUNT * GAP_LENGTH) / ARC_COUNT;

/**
 * ProgressRing Component
 * Renders an SVG ring with 3 arc segments indicating goal completion.
 */
const ProgressRing = memo(function ProgressRing({
    completedCount,
    isSelected,
}: ProgressRingProps) {
    const filledColor = isSelected ? 'white' : '#22c55e';
    const emptyColor = isSelected ? 'rgba(255,255,255,0.3)' : '#e5e7eb';

    return (
        <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            aria-hidden="true"
        >
            {Array.from({ length: ARC_COUNT }, (_, i) => (
                <circle
                    key={i}
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={i < completedCount ? filledColor : emptyColor}
                    strokeWidth={RING_STROKE}
                    strokeDasharray={`${ARC_LENGTH} ${RING_CIRCUMFERENCE - ARC_LENGTH}`}
                    strokeDashoffset={-(i * (ARC_LENGTH + GAP_LENGTH))}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                />
            ))}
        </svg>
    );
});

/**
 * DayButton Component
 * Memoized to prevent unnecessary re-renders
 */
const DayButton = memo(function DayButton({
    date,
    isToday,
    isSelected,
    completedCount,
    dayOfWeek,
    onClick,
}: DayButtonProps) {
    const handleClick = useCallback(() => {
        onClick(date);
    }, [date, onClick]);

    let completionSummary: string;
    if (completedCount === 0) {
        completionSummary = 'нет выполненных целей';
    } else if (completedCount === 3) {
        completionSummary = 'все цели выполнены';
    } else {
        completionSummary = `выполнено ${completedCount} из 3 целей`;
    }

    return (
        <button
            onClick={handleClick}
            data-navigable="true"
            role="radio"
            aria-checked={isSelected}
            className={`
                relative flex flex-col items-center justify-center p-2 rounded-lg
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${isSelected
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-white hover:bg-gray-50 text-gray-700'
                }
                ${isToday && !isSelected ? 'ring-2 ring-blue-300' : ''}
            `}
            aria-label={`${DAY_NAMES_FULL[dayOfWeek]}, ${formatDayNumber(date)}, ${completionSummary}`}
            aria-current={isToday ? 'date' : undefined}
        >
            <span className="text-xs font-medium mb-1">
                {DAY_NAMES[dayOfWeek]}
            </span>

            <div className="relative flex items-center justify-center">
                <ProgressRing completedCount={completedCount} isSelected={isSelected} />
                <span className="absolute text-sm font-semibold">
                    {formatDayNumber(date)}
                </span>
            </div>
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
     * Get number of completed goals for a day (0-3)
     */
    const getCompletedCount = useCallback((date: Date): number => {
        const dateStr = formatDateISO(date);
        const metrics = dailyData[dateStr];

        if (!metrics || !metrics.completionStatus) return 0;

        const { nutritionFilled, weightLogged, activityCompleted } = metrics.completionStatus;
        return Number(nutritionFilled) + Number(weightLogged) + Number(activityCompleted);
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
                    const completedCount = getCompletedCount(date);
                    const dayOfWeek = getDayOfWeek(date);

                    return (
                        <DayButton
                            key={date.toISOString()}
                            date={date}
                            isToday={isTodayDate}
                            isSelected={isSelected}
                            completedCount={completedCount}
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
