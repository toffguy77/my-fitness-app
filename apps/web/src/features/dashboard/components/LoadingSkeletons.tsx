/**
 * Loading Skeleton Components for Dashboard
 *
 * Provides loading placeholders for lazy-loaded dashboard components.
 * Used with React.lazy() and Suspense for code splitting.
 *
 * Requirements: 19.1 - Code splitting with appropriate loading fallbacks
 */

import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'

/**
 * Base skeleton component with pulse animation.
 * Рецепт системы: `animate-pulse rounded-tile bg-subtle`; строки текста —
 * `rounded-full`, чтобы читались как текст, а не как плитка.
 */
interface SkeletonProps {
    className?: string
}

function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-tile bg-subtle',
                className
            )}
            aria-hidden="true"
        />
    )
}

/** Карточка-заглушка: та же поверхность, что у карточки экрана, — без тени. */
const SKELETON_CARD = 'rounded-card border border-line bg-surface p-5'

/**
 * Loading skeleton for ProgressSection
 * Mimics the structure of the progress section with chart and stats
 */
export function ProgressSectionSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn(SKELETON_CARD, className)}
            role="status"
            aria-label={t('dashboard.skeletons.progress')}
        >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-6 w-28 rounded-full" />
            </div>

            {/* Chart placeholder */}
            <div className="space-y-4">
                <Skeleton className="h-4 w-32 rounded-full" />
                <Skeleton className="h-32 w-full" />
            </div>

            {/* Adherence indicator */}
            <div className="mt-6 space-y-2">
                <div className="flex justify-between">
                    <Skeleton className="h-4 w-40 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
            </div>

            {/* Achievements */}
            <div className="mt-6 space-y-3">
                <Skeleton className="h-3 w-36 rounded-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>

            <span className="sr-only">{t('common.loading')}</span>
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
            className={cn(SKELETON_CARD, className)}
            role="status"
            aria-label={t('dashboard.skeletons.photos')}
        >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-6 w-32 rounded-full" />
            </div>

            {/* Upload area placeholder */}
            <Skeleton className="h-14 w-full" />

            {/* File requirements */}
            <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-32 rounded-full" />
                <Skeleton className="h-3 w-48 rounded-full" />
                <Skeleton className="h-3 w-40 rounded-full" />
            </div>

            <span className="sr-only">{t('common.loading')}</span>
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
            className={cn(SKELETON_CARD, className)}
            role="status"
            aria-label={t('dashboard.skeletons.weeklyPlan')}
        >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-6 w-36 rounded-full" />
            </div>

            {/* Active indicator */}
            <div className="mb-4 flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 w-16 rounded-full" />
            </div>

            {/* Targets — строки списка */}
            <div className="divide-y divide-line" data-testid="weekly-plan-skeleton-targets">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between py-3">
                        <Skeleton className="h-4 w-20 rounded-full" />
                        <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                ))}
            </div>

            {/* Plan dates */}
            <div className="mt-4">
                <Skeleton className="h-4 w-48 rounded-full" />
            </div>

            <span className="sr-only">{t('common.loading')}</span>
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
            className={cn(SKELETON_CARD, className)}
            role="status"
            aria-label={t('dashboard.skeletons.tasks')}
        >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
                <Skeleton className="h-6 w-24 rounded-full" />
            </div>

            {/* Week indicator */}
            <Skeleton className="mb-1 h-3 w-24 rounded-full" />

            {/* Task rows — как в списке задач: отметка, название, подпись */}
            <div className="divide-y divide-line" data-testid="tasks-skeleton-rows">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="flex min-h-14 items-start gap-3 py-3"
                    >
                        <Skeleton className="h-[22px] w-[22px] flex-shrink-0 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4 rounded-full" />
                            <Skeleton className="h-3 w-24 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>

            <span className="sr-only">{t('common.loading')}</span>
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
