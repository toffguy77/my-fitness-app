/**
 * DailyTrackingGrid container component
 *
 * Arranges daily tracking blocks in responsive grid layout,
 * connects blocks to store, and handles real-time updates.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized child components
 */

import { useEffect, memo, useCallback } from 'react'
import { cn } from '@/shared/utils/cn'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { useDashboardStore } from '../store/dashboardStore'
import { formatLocalDate } from '@/shared/utils/format'
import { NutritionBlock } from './NutritionBlock'
import { StepsBlock } from './StepsBlock'
import { WorkoutBlock } from './WorkoutBlock'
import { WaterBlock } from './WaterBlock'
import { t } from '@/shared/i18n'

/**
 * Props for DailyTrackingGrid component
 */
export interface DailyTrackingGridProps {
    date: Date
    className?: string
}

/**
 * DailyTrackingGrid container component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const DailyTrackingGrid = memo(function DailyTrackingGrid({ date, className }: DailyTrackingGridProps) {
    const {
        dailyData,
        isLoading,
        error,
        fetchDailyData,
        startPolling,
        stopPolling,
        clearError
    } = useDashboardStore()

    // Get data for the selected date
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Memoized fetch callback
    const handleFetchData = useCallback(() => {
        fetchDailyData(date)
    }, [date, fetchDailyData])

    // Fetch data and start polling on mount
    useEffect(() => {
        handleFetchData()
        startPolling(30000) // Poll every 30 seconds

        return () => {
            stopPolling()
        }
    }, [handleFetchData, startPolling, stopPolling])

    // Clear error when date changes
    useEffect(() => {
        if (error) {
            clearError()
        }
    }, [date, error, clearError])

    // Loading state
    if (isLoading && !dayData) {
        return (
            <div className={cn('space-y-4', className)}>
                {/* Loading skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div
                            key={index}
                            className="h-80 animate-pulse rounded-card bg-subtle"
                            aria-label={t('dashboard.grid.loadingAria')}
                        />
                    ))}
                </div>
            </div>
        )
    }

    // Error state
    if (error && !dayData) {
        return (
            <div className={cn('space-y-4', className)}>
                <div className="space-y-4 rounded-card border border-line bg-surface px-5 py-8 text-center">
                    <div className="flex justify-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft">
                            <AlertTriangle className="h-6 w-6 text-danger-fg" strokeWidth={1.8} aria-hidden="true" />
                        </span>
                    </div>
                    <div className="space-y-1">
                        <h3 className="type-title-3 text-fg">
                            {t('dashboard.grid.loadFailed')}
                        </h3>
                        <p className="text-sm text-fg-muted">
                            {error.message}
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        onClick={() => handleFetchData()}
                    >
                        {t('dashboard.grid.retry')}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className={cn('space-y-3 sm:space-y-4', className)}>
            {/* Responsive grid layout - 3 columns */}
            {/* Mobile: single column, stacked blocks */}
            {/* Tablet+: three-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
                {/* Питание — главный блок дня: на планшете и шире во всю строку
                    сетки из двух колонок, на десктопе — половина из четырёх. */}
                <div className="col-span-1 sm:col-span-2">
                    <NutritionBlock
                        date={date}
                        className="h-full"
                    />
                </div>

                {/* Steps Block */}
                <div className="col-span-1">
                    <StepsBlock
                        date={date}
                        className="h-full"
                    />
                </div>

                {/* Workout Block */}
                <div className="col-span-1">
                    <WorkoutBlock
                        date={date}
                        className="h-full"
                    />
                </div>

                {/* Water Block */}
                <div className="col-span-1">
                    <WaterBlock
                        date={date}
                        className="h-full"
                    />
                </div>
            </div>

            {/* Real-time update indicator */}
            {isLoading && dayData && (
                <div className="flex items-center justify-center py-2">
                    <div className="flex items-center gap-2 text-sm text-fg-muted">
                        <span
                            className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary"
                            aria-hidden="true"
                        />
                        <span>{t('dashboard.grid.refreshing')}</span>
                    </div>
                </div>
            )}

            {/* Offline indicator */}
            {error?.code === 'NETWORK_ERROR' && (
                <div className="flex items-center justify-center py-2">
                    <div className="flex items-center gap-2 rounded-tile bg-warning-soft px-3 py-2">
                        <WifiOff className="h-4 w-4 flex-shrink-0 text-warning-fg" strokeWidth={1.8} aria-hidden="true" />
                        <span className="text-sm text-warning-fg">
                            {t('dashboard.grid.offlineCached')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
})
