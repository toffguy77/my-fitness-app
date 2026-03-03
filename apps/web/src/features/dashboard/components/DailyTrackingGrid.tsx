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
import { useDashboardStore } from '../store/dashboardStore'
import { formatLocalDate } from '@/shared/utils/format'
import { NutritionBlock } from './NutritionBlock'
import { StepsBlock } from './StepsBlock'
import { WorkoutBlock } from './WorkoutBlock'
import { WaterBlock } from './WaterBlock'

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
                            className="h-80 bg-gray-100 rounded-lg animate-pulse"
                            aria-label="Загрузка блока отслеживания"
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
                <div className="text-center py-8 space-y-4">
                    <div className="text-red-500">
                        <svg
                            className="h-12 w-12 mx-auto mb-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                            />
                        </svg>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Не удалось загрузить данные
                        </h3>
                        <p className="text-sm text-gray-600">
                            {error.message}
                        </p>
                    </div>
                    <button
                        onClick={() => handleFetchData()}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        Попробовать снова
                    </button>
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
                {/* Nutrition Block */}
                <div className="col-span-1">
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
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <svg
                            className="h-4 w-4 animate-spin"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                        </svg>
                        <span>Обновление данных...</span>
                    </div>
                </div>
            )}

            {/* Offline indicator */}
            {error?.code === 'NETWORK_ERROR' && (
                <div className="flex items-center justify-center py-2">
                    <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <svg
                            className="h-4 w-4 text-yellow-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                            />
                        </svg>
                        <span className="text-sm text-yellow-800">
                            Нет подключения к интернету. Показаны сохраненные данные.
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
})
