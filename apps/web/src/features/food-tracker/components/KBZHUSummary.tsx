'use client';

/**
 * KBZHUSummary Component
 *
 * Displays daily КБЖУ (calories, protein, fat, carbs) summary with progress bars.
 * Shows current intake vs target goals with color-coded progress indicators.
 *
 * @module food-tracker/components/KBZHUSummary
 */

import { useMemo } from 'react';
import type { KBZHU, ProgressColor } from '../types';
import { getPercentage, getProgressColor } from '../utils/kbzhuCalculator';

// ============================================================================
// Types
// ============================================================================

export interface KBZHUSummaryProps {
    /** Current daily intake values */
    current: KBZHU;
    /** Target goal values (null values show as "-") */
    target: Partial<KBZHU> | null;
    /** Additional CSS classes */
    className?: string;
}

interface MacroItemProps {
    /** Russian label for the macro */
    label: string;
    /** Current intake value */
    current: number;
    /** Target goal value (undefined shows as "-") */
    target: number | undefined;
    /** Unit to display (г, ккал) */
    unit: string;
    /** Color for the progress bar */
    color: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Macro configuration with Russian labels
 */
const MACRO_CONFIG = [
    { key: 'calories' as const, label: 'Ккал', unit: '', colorClass: 'bg-orange-500' },
    { key: 'protein' as const, label: 'Белки', unit: 'г', colorClass: 'bg-blue-500' },
    { key: 'fat' as const, label: 'Жиры', unit: 'г', colorClass: 'bg-yellow-500' },
    { key: 'carbs' as const, label: 'Углеводы', unit: 'г', colorClass: 'bg-green-500' },
] as const;

/**
 * Progress color to Tailwind class mapping
 */
const PROGRESS_COLOR_CLASSES: Record<ProgressColor, string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
};

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Individual macro display item with progress bar
 */
function MacroItem({ label, current, target, unit, color }: MacroItemProps) {
    const hasTarget = target !== undefined && target > 0;
    const percentage = hasTarget ? getPercentage(current, target) : 0;
    const progressColor = hasTarget ? getProgressColor(current, target) : 'green';
    const isExceeding = percentage > 100;

    // Format display values
    const currentDisplay = Math.round(current);
    const targetDisplay = hasTarget ? Math.round(target) : '-';
    const displayText = `${currentDisplay} / ${targetDisplay}${unit ? ` ${unit}` : ''}`;

    return (
        <div className="flex flex-col gap-1 sm:gap-1.5">
            {/* Label and values */}
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700 sm:text-sm">{label}</span>
                <span
                    className={`text-xs font-semibold sm:text-sm ${isExceeding ? 'text-red-600' : 'text-gray-900'}`}
                    aria-label={`${label}: ${currentDisplay} из ${targetDisplay}${unit ? ` ${unit}` : ''}`}
                >
                    {displayText}
                    {isExceeding && (
                        <span className="ml-1 text-red-500" aria-label="Превышение нормы">
                            ↑
                        </span>
                    )}
                </span>
            </div>

            {/* Progress bar */}
            <div
                className="h-1.5 bg-gray-200 rounded-full overflow-hidden sm:h-2"
                role="progressbar"
                aria-valuenow={hasTarget ? Math.min(percentage, 100) : 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${label} прогресс: ${percentage}%`}
            >
                {hasTarget ? (
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${PROGRESS_COLOR_CLASSES[progressColor]}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                ) : (
                    <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: '0%' }}
                    />
                )}
            </div>

            {/* Percentage display */}
            {hasTarget && (
                <span
                    className={`text-[10px] sm:text-xs ${isExceeding ? 'text-red-500' : 'text-gray-500'}`}
                    aria-hidden="true"
                >
                    {percentage}%
                </span>
            )}
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export function KBZHUSummary({
    current,
    target,
    className = '',
}: KBZHUSummaryProps) {
    // Memoize macro items to avoid recalculation
    const macroItems = useMemo(() => {
        return MACRO_CONFIG.map(({ key, label, unit, colorClass }) => ({
            key,
            label,
            current: current[key],
            target: target?.[key],
            unit,
            colorClass,
        }));
    }, [current, target]);

    return (
        <section
            className={`bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 ${className}`}
            aria-label="Сводка КБЖУ за день"
        >
            {/* Header */}
            <h2 className="text-sm font-semibold text-gray-900 mb-3 sm:text-base sm:mb-4">
                Дневная норма
            </h2>

            {/* Macro grid - responsive: 2 cols on mobile, 4 cols on tablet+ */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {macroItems.map(({ key, label, current: currentValue, target: targetValue, unit, colorClass }) => (
                    <MacroItem
                        key={key}
                        label={label}
                        current={currentValue}
                        target={targetValue}
                        unit={unit}
                        color={colorClass}
                    />
                ))}
            </div>
        </section>
    );
}

export default KBZHUSummary;
