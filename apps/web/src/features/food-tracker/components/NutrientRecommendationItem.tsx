/**
 * NutrientRecommendationItem Component
 *
 * Displays a single nutrient recommendation with name, progress bar,
 * and current/target values in format "current / target unit".
 *
 * @module food-tracker/components/NutrientRecommendationItem
 */

'use client';

import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { NutrientRecommendation, ProgressColor } from '../types';
import { getProgressColor, getPercentage } from '../utils/kbzhuCalculator';
import { t } from '@/shared/i18n';

import { unitLabel } from '../utils/unitLabel'
// ============================================================================
// Types
// ============================================================================

export interface NutrientRecommendationItemProps {
    /** Nutrient recommendation data */
    recommendation: NutrientRecommendation;
    /**
     * Потребление, если оно известно.
     *
     * Продукт считает потребление только для КБЖУ. Для витаминов и минералов
     * его нет, и ноль здесь нарисовал бы «0 из 100 мг» — человек прочитал бы
     * это как «вы не добрали», хотя никто ничего не измерял.
     */
    currentIntake?: number;
    /**
     * По скольким записям дня посчитано потребление.
     *
     * Содержание микронутриентов известно не у всех продуктов справочника, и
     * величина — нижняя граница. Без этой подписи её прочитают как итог дня.
     */
    intakeCoverage?: { counted: number; total: number };
    /** Callback when item clicked */
    onClick: () => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get CSS class for progress bar color
 */
function getProgressColorClass(color: ProgressColor): string {
    switch (color) {
        case 'green':
            return 'bg-green-500';
        case 'yellow':
            return 'bg-yellow-500';
        case 'red':
            return 'bg-red-500';
        default:
            return 'bg-gray-400';
    }
}

/**
 * Format number for display (remove unnecessary decimals)
 */
function formatNumber(value: number): string {
    if (Number.isInteger(value)) {
        return value.toString();
    }
    // Round to 1 decimal place
    const rounded = Math.round(value * 10) / 10;
    return rounded.toString();
}

// ============================================================================
// Component
// ============================================================================

export function NutrientRecommendationItem({
    recommendation,
    currentIntake,
    intakeCoverage,
    onClick,
    className = '',
}: NutrientRecommendationItemProps): React.ReactElement {
    const { name, dailyTarget, unit, isWeekly, normNeedsProfile } = recommendation;

    // Прогресс можно показать только когда известны оба числа. Иначе полоса
    // росла бы из догадки или из неизвестного.
    const hasProgress = currentIntake !== undefined && dailyTarget !== undefined;

    const percentage = useMemo(
        () => (hasProgress ? getPercentage(currentIntake, dailyTarget) : 0),
        [hasProgress, currentIntake, dailyTarget]
    );

    // null — мерить нечего, и полоса не рисуется вовсе.
    const progressColor = useMemo<ProgressColor | null>(
        () => (hasProgress ? getProgressColor(currentIntake, dailyTarget) : null),
        [hasProgress, currentIntake, dailyTarget]
    );

    const displayPercentage = Math.min(percentage, 100);

    /**
     * Что показать справа от названия — четыре положения:
     *
     *   потребление и норма известны → «45 / 100 мг» с полосой;
     *   известно только потребление  → «45 мг»: норму выбрать нельзя, но
     *                                  съеденное мы знаем, и терять его нельзя;
     *   известна только норма        → «100 мг» без полосы;
     *   не известно ничего           → сказано, чего не хватает.
     */
    const valueText = hasProgress
        ? `${formatNumber(currentIntake)} / ${formatNumber(dailyTarget)} ${unitLabel(unit)}`
        : currentIntake !== undefined
            ? `${formatNumber(currentIntake)} ${unitLabel(unit)}`
            : dailyTarget !== undefined
                ? `${formatNumber(dailyTarget)} ${unitLabel(unit)}`
                : normNeedsProfile
                    ? t('foodTracker.nutrientItem.normNeedsProfile')
                    : t('foodTracker.nutrientItem.normUnknown');

    const ariaLabel = hasProgress
        ? [
            t('foodTracker.nutrientItem.aria', {
                name,
                current: formatNumber(currentIntake),
                target: formatNumber(dailyTarget),
                unit: unitLabel(unit),
                percentage: Math.round(percentage),
            }),
            intakeCoverage && intakeCoverage.counted < intakeCoverage.total
                ? t('foodTracker.nutrientItem.coverageAria', {
                    counted: String(intakeCoverage.counted),
                    total: String(intakeCoverage.total),
                })
                : '',
        ].filter(Boolean).join('. ')
        : [
            `${name}. ${valueText}`,
            currentIntake !== undefined && intakeCoverage && intakeCoverage.counted < intakeCoverage.total
                ? t('foodTracker.nutrientItem.coverageAria', {
                    counted: String(intakeCoverage.counted),
                    total: String(intakeCoverage.total),
                })
                : '',
        ].filter(Boolean).join('. ');

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-2 w-full p-1.5 hover:bg-gray-50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-3 sm:p-2 touch-manipulation ${className}`}
            role="listitem"
            aria-label={ariaLabel}
        >
            {/* Nutrient name and progress */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                    <span className="text-xs font-medium text-gray-900 truncate sm:text-sm">
                        {name}
                        {isWeekly && (
                            <span className="ml-1 text-[10px] text-gray-500 sm:text-xs">{t('foodTracker.nutrientItem.weekly')}</span>
                        )}
                    </span>
                    <span
                        className="text-[10px] text-gray-500 ml-2 whitespace-nowrap sm:text-sm"
                        aria-hidden="true"
                    >
                        {valueText}
                        {/* Неполное покрытие видно рядом с числом, а не в подсказке:
                            число без него читается как итог дня. */}
                        {currentIntake !== undefined && intakeCoverage && intakeCoverage.counted < intakeCoverage.total && (
                            <span className="ml-1 text-gray-400">
                                {t('foodTracker.nutrientItem.coverage', {
                                    counted: String(intakeCoverage.counted),
                                    total: String(intakeCoverage.total),
                                })}
                            </span>
                        )}
                    </span>
                </div>

                {/* Полоса прогресса — только когда есть что мерить. */}
                {hasProgress && progressColor && (
                    <div
                        className="h-1 bg-gray-200 rounded-full overflow-hidden sm:h-1.5"
                        role="progressbar"
                        aria-valuenow={Math.round(percentage)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t('foodTracker.nutrientItem.progressAria', { name, percentage: Math.round(percentage) })}
                    >
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${getProgressColorClass(progressColor)}`}
                            style={{ width: `${displayPercentage}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Chevron indicator */}
            <ChevronRight
                className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 sm:w-4 sm:h-4"
                aria-hidden="true"
            />
        </button>
    );
}

export default NutrientRecommendationItem;
