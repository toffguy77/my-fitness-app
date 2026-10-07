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
import { ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';
import { useDashboardStore } from '../store/dashboardStore';
import { useRovingTabIndex } from '../hooks/useKeyboardNavigation';
import { formatLocalDate } from '@/shared/utils/format';
import { t } from '@/shared/i18n'
import { color } from '@burcev/design-tokens';

/**
 * Day names in Russian (short form)
 */
const DAY_NAMES = [
    t('weekdays.short.mon'),
    t('weekdays.short.tue'),
    t('weekdays.short.wed'),
    t('weekdays.short.thu'),
    t('weekdays.short.fri'),
    t('weekdays.short.sat'),
    t('weekdays.short.sun'),
];

/**
 * Day names in Russian (full form) for accessibility
 */
const DAY_NAMES_FULL = [
    t('dashboard.calendar.monday'),
    t('dashboard.calendar.tuesday'),
    t('dashboard.calendar.wednesday'),
    t('dashboard.calendar.thursday'),
    t('dashboard.calendar.friday'),
    t('dashboard.calendar.saturday'),
    t('dashboard.calendar.sunday'),
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
    const filledColor = isSelected ? color['fg-inverse'] : color.success;
    const emptyColor = isSelected ? 'color-mix(in srgb, var(--ds-color-fg-inverse) 30%, transparent)' : color.track;

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
        completionSummary = t('dashboard.calendar.noneDone');
    } else if (completedCount === 3) {
        completionSummary = t('dashboard.calendar.allDone');
    } else {
        completionSummary = t('dashboard.calendar.someDone', { count: completedCount });
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            data-navigable="true"
            role="radio"
            aria-checked={isSelected}
            // Выбранный день — инверсия чернилами (не терракота), сегодня —
            // тонкое кольцо бренда, как в календаре дневника.
            className={cn(
                'relative flex min-h-11 flex-col items-center justify-center rounded-tile py-1.5 touch-manipulation',
                'transition-colors duration-200 ease-standard',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                isSelected
                    ? 'bg-fg text-fg-inverse'
                    : 'text-fg hover:bg-subtle',
                isToday && !isSelected && 'ring-1 ring-inset ring-primary',
            )}
            aria-label={`${DAY_NAMES_FULL[dayOfWeek]}, ${formatDayNumber(date)}, ${completionSummary}`}
            aria-current={isToday ? 'date' : undefined}
        >
            <span className={cn('mb-1 type-micro', isSelected ? 'text-fg-inverse' : 'text-fg-subtle')}>
                {DAY_NAMES[dayOfWeek]}
            </span>

            <div className="relative flex items-center justify-center">
                <ProgressRing completedCount={completedCount} isSelected={isSelected} />
                <span className="absolute text-sm font-semibold tabular-nums">
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
            <div className="mb-3 flex items-center justify-between gap-2">
                <IconButton
                    variant="ghost"
                    onClick={handlePrevWeek}
                    aria-label={t('dashboard.calendar.previousWeek')}
                >
                    <ChevronLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>

                <div className="text-base font-semibold text-fg tabular-nums">
                    {weekRangeDisplay}
                </div>

                <IconButton
                    variant="ghost"
                    onClick={handleNextWeek}
                    aria-label={t('dashboard.calendar.nextWeek')}
                >
                    <ChevronRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
            </div>

            {/* Days Grid */}
            <div
                ref={daysContainerRef}
                className="grid grid-cols-7 gap-1 sm:gap-2"
                role="radiogroup"
                aria-label={t('dashboard.calendar.pickDayAria')}
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
                    {/* Терракота на дашборде одна — у записи еды; отчёт — контуром */}
                    <Button
                        variant="secondary"
                        size="lg"
                        block
                        onClick={handleSubmitReport}
                        aria-label={t('dashboard.calendar.sendReportAria')}
                    >
                        <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        {t('dashboard.calendar.sendReport')}
                    </Button>
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
