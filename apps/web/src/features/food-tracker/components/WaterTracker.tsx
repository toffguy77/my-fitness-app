'use client';

/**
 * WaterTracker Component
 *
 * Compact water intake tracking with animated droplet fill indicator.
 * Shows water progress as a filling droplet SVG alongside intake text.
 *
 * @module food-tracker/components/WaterTracker
 */

import { useId, useMemo, useCallback } from 'react';
import { Plus, Check } from 'lucide-react';
import type { WaterLog } from '../types';
import { t } from '@/shared/i18n';
import { color } from '@burcev/design-tokens';
import { Button } from '@/shared/components/ui/Button';

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
// Sub-components
// ============================================================================

/**
 * Animated water droplet SVG with fill level
 * Uses unique IDs to prevent SVG conflicts when multiple instances exist
 */
function WaterDroplet({
    percentage,
    uniqueId,
}: {
    percentage: number;
    uniqueId: string;
}) {
    const fillHeight = Math.min(percentage, 100);
    const clipId = `water-clip-${uniqueId}`;
    const gradientId = `water-grad-${uniqueId}`;

    // Fill rectangle: droplet body spans roughly y=14 to y=50 (36px range)
    const bodyHeight = 36;
    const bodyTop = 14;
    const fillPixels = (fillHeight / 100) * bodyHeight;
    const fillY = bodyTop + bodyHeight - fillPixels;

    return (
        <svg
            width={48}
            height={56}
            viewBox="0 0 40 52"
            className="flex-shrink-0"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color.water} />
                    <stop offset="100%" stopColor={color.water} />
                </linearGradient>
                <clipPath id={clipId}>
                    <path d="M20 3 C20 3 5 20 5 32 C5 40.3 11.7 47 20 47 C28.3 47 35 40.3 35 32 C35 20 20 3 20 3Z" />
                </clipPath>
            </defs>
            {/* Droplet outline */}
            <path
                d="M20 3 C20 3 5 20 5 32 C5 40.3 11.7 47 20 47 C28.3 47 35 40.3 35 32 C35 20 20 3 20 3Z"
                fill="none"
                stroke={color.water}
                strokeWidth="1.5"
                className="transition-colors duration-300"
            />
            {/* Water fill (clipped to droplet shape) */}
            <g clipPath={`url(#${clipId})`}>
                <rect
                    x="0"
                    y={fillY}
                    width="40"
                    height={fillPixels + 2}
                    fill={`url(#${gradientId})`}
                    className="transition-all duration-500"
                />
                {/* Subtle wave on the surface */}
                {fillHeight > 5 && fillHeight < 98 && (
                    <path
                        d={`M0 ${fillY} Q10 ${fillY - 1.5} 20 ${fillY} T40 ${fillY}`}
                        fill={`url(#${gradientId})`}
                        opacity="0.5"
                    />
                )}
            </g>
        </svg>
    );
}

// ============================================================================
// Component
// ============================================================================

export function WaterTracker({
    waterLog,
    onAddGlass,
    isLoading = false,
    className = '',
}: WaterTrackerProps) {
    const uniqueId = useId();

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
        return t('foodTracker.water.count', { glasses, goal });
    }, [glasses, goal]);

    // Format glass size text
    const glassSizeText = useMemo(() => {
        return t('foodTracker.water.glassSize', { size: glassSize });
    }, [glassSize]);

    // Handle add glass click
    const handleAddGlass = useCallback(() => {
        if (!isLoading) {
            onAddGlass();
        }
    }, [onAddGlass, isLoading]);

    return (
        <section
            className={`rounded-card border border-line bg-surface p-5 ${className}`}
            aria-label={t('foodTracker.water.aria')}
        >
            {/* Header */}
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="type-title-3 text-fg">{t('foodTracker.water.title')}</h3>
                <span className="type-caption text-fg-subtle tabular-nums">{glassSizeText}</span>
            </div>

            {/* Droplet + info layout */}
            <div
                className="flex items-center gap-3"
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('foodTracker.water.progressAria', { percentage })}
            >
                {/* Droplet indicator */}
                <WaterDroplet
                    percentage={percentage}
                    uniqueId={uniqueId}
                />

                {/* Info + action */}
                <div className="min-w-0 flex-1">
                    {/* Water count */}
                    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span
                            // Число не перекрашивается при выполнении цели: об этом
                            // говорит подпись рядом, цвет только опознаёт воду.
                            className="type-num-l text-fg tabular-nums"
                            aria-label={t('foodTracker.water.countAria', { glasses, goal })}
                        >
                            {displayText}
                        </span>
                        {isGoalReached && (
                            <div className="flex items-center gap-1 text-success-fg">
                                <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                                <span className="text-[13px] font-medium">{t('foodTracker.water.goalReached')}</span>
                            </div>
                        )}
                    </div>

                    {/* Add button */}
                    {/* Второстепенное действие экрана — контуром: терракота
                        остаётся панели быстрого ввода еды. */}
                    <Button
                        type="button"
                        variant="secondary"
                        block
                        onClick={handleAddGlass}
                        disabled={isLoading}
                        className="touch-manipulation"
                        aria-label={t('foodTracker.water.addGlassAria')}
                    >
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        <span>{t('foodTracker.water.addGlass')}</span>
                    </Button>
                </div>
            </div>
        </section>
    );
}

export default WaterTracker;
