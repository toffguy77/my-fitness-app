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
import type { KBZHU } from '../types';
import { getPercentage } from '../utils/kbzhuCalculator';
import { MACRO_COLORS } from '@/shared/constants/macros';
import { t } from '@/shared/i18n';

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
    /** Source of the target values */
    source?: 'calculated' | 'curator_override' | null;
    /** Extra calories from workout */
    workoutBonus?: number | null;
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
// Калории — не нутриент, и опознавать их цветом нечем: это сумма остальных.
// Поэтому у них нейтральная заливка. Раньше здесь стоял `bg-orange-500`, и он
// читался как оценка, хотя ничего не оценивал.
const CALORIES_COLOR = '#6b7280'; // gray-500

const MACRO_CONFIG = [
    { key: 'calories' as const, label: t('macros.calories'), unit: '', color: CALORIES_COLOR },
    { key: 'protein' as const, label: t('macros.protein'), unit: t('units.gram'), color: MACRO_COLORS.protein },
    { key: 'fat' as const, label: t('macros.fat'), unit: t('units.gram'), color: MACRO_COLORS.fat },
    { key: 'carbs' as const, label: t('macros.carbs'), unit: t('units.gram'), color: MACRO_COLORS.carbs },
] as const;

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Individual macro display item with progress bar
 */
function MacroItem({ label, current, target, unit, color }: MacroItemProps) {
    const hasTarget = target !== undefined && target > 0;
    const percentage = hasTarget ? getPercentage(current, target) : 0;
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
                    aria-label={t('foodTracker.summary.valueAria', { label, current: currentDisplay, target: targetDisplay, unit: unit ? ` ${unit}` : '' })}
                >
                    {displayText}
                    {isExceeding && (
                        <span className="ml-1 text-red-500" aria-label={t('foodTracker.summary.over')}>
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
                aria-label={t('foodTracker.summary.progressAria', { label, percentage })}
            >
                {/* Заливка — цвет своего нутриента, а не светофор по доле от
                    нормы. Превышение сообщается красным числом и стрелкой выше:
                    перекрашивать ради этого полосу значит отобрать у цвета его
                    единственную работу — опознание. */}
                <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                        width: hasTarget ? `${Math.min(percentage, 100)}%` : '0%',
                        backgroundColor: color,
                    }}
                />
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
    source,
    workoutBonus,
}: KBZHUSummaryProps) {
    // Memoize macro items to avoid recalculation
    const macroItems = useMemo(() => {
        return MACRO_CONFIG.map(({ key, label, unit, color }) => ({
            key,
            label,
            current: current[key],
            target: target?.[key],
            unit,
            color,
        }));
    }, [current, target]);

    return (
        <section
            className={`bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 ${className}`}
            aria-label={t('foodTracker.summary.aria')}
        >
            {/* Header */}
            <h2 className="text-sm font-semibold text-gray-900 mb-3 sm:text-base sm:mb-4">
                {t('foodTracker.summary.dailyTarget')}
            </h2>

            {/* Macro grid - responsive: 2 cols on mobile, 4 cols on tablet+ */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {macroItems.map(({ key, label, current: currentValue, target: targetValue, unit, color }) => (
                    <MacroItem
                        key={key}
                        label={label}
                        current={currentValue}
                        target={targetValue}
                        unit={unit}
                        color={color}
                    />
                ))}
            </div>

            {/* Source label */}
            {source && (
                <p className="mt-2 text-xs text-gray-400">
                    {source === 'calculated' ? t('foodTracker.summary.calculated') : t('foodTracker.summary.curatorPlan')}
                    {workoutBonus ? t('foodTracker.summary.workoutBonus', { calories: Math.round(workoutBonus) }) : ''}
                </p>
            )}
        </section>
    );
}

export default KBZHUSummary;
