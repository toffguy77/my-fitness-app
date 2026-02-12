/**
 * Loading Skeleton Components for Dashboard
 *
 * Provides loading placeholders for lazy-loaded dashboard components.
 * Used with React.lazy() and Suspense for code splitting.
 *
 * Requirements: 19.1 - Code splitting with appropriate loading fallbacks
 */

import { cn } from '@/shared/utils/cn'

/**
 * Base skeleton component with pulse animation
 */
interface SkeletonProps {
    className?: string
}

function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                'animate-pulse bg-gray-200 rounded',
                className
            )}
            aria-hidden="true"
        />
    )
}

/**
 * Loading skeleton for ProgressSection
 * Mimics the structure of the progress section with chart and stats
 */
export function ProgressSectionSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn('bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6', className)}
            role="status"
            aria-label="Загрузка раздела прогресса..."
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-8 w-24 rounded-md" />
            </div>

            {/* Chart placeholder */}
            <div className="space-y-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-4 w-48 mx-auto" />
            </div>

            {/* Adherence indicator */}
            <div className="mt-6 space-y-2">
                <div className="flex justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
            </div>

            {/* Achievements */}
            <div className="mt-6 space-y-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
            </div>

            <span className="sr-only">Загрузка...</span>
        </div>
    )
}

/**
 * Loading skeleton for PhotoUploadSection
 * Mimics the photo upload area with button
 */
export function PhotoUploadSectionSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn('bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6', className)}
            role="status"
            aria-label="Загрузка раздела фото..."
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-6 w-32" />
            </div>

            {/* Upload button placeholder */}
            <Skeleton className="h-14 w-full rounded-lg" />

            {/* File requirements */}
            <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-40" />
            </div>

            <span className="sr-only">Загрузка...</span>
        </div>
    )
}

/**
 * Loading skeleton for WeeklyPlanSection
 * Mimics the weekly plan display with targets
 */
export function WeeklyPlanSectionSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn('bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6', className)}
            role="status"
            aria-label="Загрузка недельной планки..."
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-6 w-36" />
            </div>

            {/* Active indicator */}
            <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 w-16" />
            </div>

            {/* Targets */}
            <div className="space-y-3">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
            </div>

            {/* Plan dates */}
            <div className="mt-4">
                <Skeleton className="h-16 w-full rounded-lg" />
            </div>

            <span className="sr-only">Загрузка...</span>
        </div>
    )
}

/**
 * Loading skeleton for TasksSection
 * Mimics the tasks list with items
 */
export function TasksSectionSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn('bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6', className)}
            role="status"
            aria-label="Загрузка раздела задач..."
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-6 w-20" />
            </div>

            {/* Week indicator */}
            <Skeleton className="h-4 w-24 mb-3" />

            {/* Task items */}
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg"
                    >
                        <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-5 w-5 flex-shrink-0" />
                    </div>
                ))}
            </div>

            <span className="sr-only">Загрузка...</span>
        </div>
    )
}

/**
 * Combined loading skeleton for all below-the-fold sections
 * Used when loading the entire bottom section of the dashboard
 */
export function BelowFoldSectionsSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">
            {/* Progress Section - full width */}
            <div className="md:col-span-2 lg:col-span-3">
                <ProgressSectionSkeleton className="w-full h-full" />
            </div>

            {/* Photo Upload Section */}
            <div className="md:col-span-1 lg:col-span-1">
                <PhotoUploadSectionSkeleton className="w-full h-full" />
            </div>

            {/* Weekly Plan Section */}
            <div className="md:col-span-1 lg:col-span-1">
                <WeeklyPlanSectionSkeleton className="w-full h-full" />
            </div>

            {/* Tasks Section */}
            <div className="md:col-span-2 lg:col-span-1">
                <TasksSectionSkeleton className="w-full h-full" />
            </div>
        </div>
    )
}
