'use client';

/**
 * WaterTracker Component
 *
 * Displays water intake tracking with current/goal display and quick add button.
 * Shows progress indicator and completion state.
 *
 * @module food-tracker/components/WaterTracker
 */

import { useMemo, useCallback } from 'react';
import { Droplets, Plus, Check } from 'lucide-react';
import type { WaterLog } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface WaterTrackerProps {
    /** Current water log data */
    waterLog: WaterLog | null;
    /** Callback when add glass button is clicked */
    onAddGlass: () => void;
    /** Whether the add action is loading */
    isLoading?: boolean;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_GOAL = 8; // 8 glasses
const DEFAULT_GLASS_SIZE = 250; // 250ml

// ============================================================================
// Component
// ============================================================================

export function WaterTracker({
    waterLog,
    onAddGlass,
    isLoading = false,
    className = '',
}: WaterTrackerProps) {
    // Get current values with defaults
    const glasses = waterLog?.glasses ?? 0;
    const goal = waterLog?.goal ?? DEFAULT_GOAL;
    const glassSize = waterLog?.glassSize ?? DEFAULT_GLASS_SIZE;

    // Calculate progress
    const percentage = useMemo(() => {
        if (goal <= 0) return 0;
        return Math.min(Math.round((glasses / goal) * 100), 100);
    }, [glasses, goal]);

    // Check if goal is reached
    const isGoalReached = glasses >= goal;

    // Format display text
    const displayText = useMemo(() => {
        return `${glasses} / ${goal} стаканов`;
    }, [glasses, goal]);

    // Format glass size text
    const glassSizeText = useMemo(() => {
        return `${glassSize} мл`;
    }, [glassSize]);

    // Handle add glass click
    const handleAddGlass = useCallback(() => {
        if (!isLoading) {
            onAddGlass();
        }
    }, [onAddGlass, isLoading]);

    return (
        <section
            className={`bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 ${className}`}
            aria-label="Отслеживание воды"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <Droplets className="w-4 h-4 text-blue-500 sm:w-5 sm:h-5" aria-hidden="true" />
                    <h3 className="text-xs font-semibold text-gray-900 sm:text-sm">Вода</h3>
                </div>
                <span className="text-[10px] text-gray-500 sm:text-xs">{glassSizeText}</span>
            </div>

            {/* Progress Display */}
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <span
                    className={`text-base font-bold sm:text-lg ${isGoalReached ? 'text-green-600' : 'text-gray-900'}`}
                    aria-label={`Выпито ${glasses} из ${goal} стаканов`}
                >
                    {displayText}
                </span>
                {isGoalReached && (
                    <div className="flex items-center gap-1 text-green-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                        <span className="text-[10px] font-medium sm:text-xs">Цель достигнута</span>
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            <div
                className="h-2 bg-gray-200 rounded-full overflow-hidden mb-3 sm:h-3 sm:mb-4"
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Прогресс воды: ${percentage}%`}
            >
                <div
                    className={`h-full rounded-full transition-all duration-300 ${isGoalReached ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Add Button */}
            <button
                type="button"
                onClick={handleAddGlass}
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 text-xs sm:gap-2 sm:py-2.5 sm:text-sm touch-manipulation ${isLoading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-[0.98]'
                    }`}
                aria-label="Добавить стакан воды"
            >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                <span>Добавить стакан</span>
            </button>
        </section>
    );
}

export default WaterTracker;
