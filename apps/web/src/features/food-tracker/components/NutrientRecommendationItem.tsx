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

// ============================================================================
// Types
// ============================================================================

export interface NutrientRecommendationItemProps {
    /** Nutrient recommendation data */
    recommendation: NutrientRecommendation;
    /** Current intake amount */
    currentIntake: number;
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
    onClick,
    className = '',
}: NutrientRecommendationItemProps): React.ReactElement {
    const { name, dailyTarget, unit, isWeekly } = recommendation;

    // Calculate progress
    const percentage = useMemo(
        () => getPercentage(currentIntake, dailyTarget),
        [currentIntake, dailyTarget]
    );

    // Get progress bar color
    const progressColor = useMemo(
        () => getProgressColor(percentage),
        [percentage]
    );

    // Cap progress bar at 100% for display
    const displayPercentage = Math.min(percentage, 100);

    // Format progress text
    const progressText = `${formatNumber(currentIntake)} / ${formatNumber(dailyTarget)} ${unit}`;

    // Accessibility label
    const ariaLabel = `${name}: ${formatNumber(currentIntake)} из ${formatNumber(dailyTarget)} ${unit}, ${Math.round(percentage)}% от нормы`;

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
                            <span className="ml-1 text-[10px] text-gray-500 sm:text-xs">(неделя)</span>
                        )}
                    </span>
                    <span
                        className="text-[10px] text-gray-500 ml-2 whitespace-nowrap sm:text-sm"
                        aria-hidden="true"
                    >
                        {progressText}
                    </span>
                </div>

                {/* Progress bar */}
                <div
                    className="h-1 bg-gray-200 rounded-full overflow-hidden sm:h-1.5"
                    role="progressbar"
                    aria-valuenow={Math.round(percentage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${name} прогресс: ${Math.round(percentage)}%`}
                >
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${getProgressColorClass(progressColor)}`}
                        style={{ width: `${displayPercentage}%` }}
                    />
                </div>
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
