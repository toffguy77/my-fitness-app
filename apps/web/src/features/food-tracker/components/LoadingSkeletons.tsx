'use client';

/**
 * Loading Skeletons for Food Tracker
 *
 * Skeleton screens for various loading states in the food tracker feature.
 * Provides visual feedback during data fetching and lazy loading.
 *
 * @module food-tracker/components/LoadingSkeletons
 */

import { memo } from 'react';

// ============================================================================
// Base Skeleton Component
// ============================================================================

interface SkeletonProps {
    className?: string;
}

export const Skeleton = memo(function Skeleton({ className = '' }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse bg-gray-200 rounded ${className}`}
            aria-hidden="true"
        />
    );
});

// ============================================================================
// КБЖУ Summary Skeleton
// ============================================================================

export const KBZHUSummarySkeleton = memo(function KBZHUSummarySkeleton() {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
            <Skeleton className="h-5 w-32 mb-3 sm:mb-4" />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                        <Skeleton className="h-2 w-full" />
                        <Skeleton className="h-3 w-8" />
                    </div>
                ))}
            </div>
        </div>
    );
});

// ============================================================================
// Meal Slot Skeleton
// ============================================================================

export const MealSlotSkeleton = memo(function MealSlotSkeleton() {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-5 h-5 rounded" />
                    <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="w-8 h-8 rounded-full" />
            </div>
            <div className="p-3 sm:p-4">
                <div className="space-y-2">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between py-2">
                            <div className="flex-1">
                                <Skeleton className="h-4 w-32 mb-1" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                            <Skeleton className="h-4 w-16" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

// ============================================================================
// Water Tracker Skeleton
// ============================================================================

export const WaterTrackerSkeleton = memo(function WaterTrackerSkeleton() {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-5 h-5 rounded" />
                    <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-3 w-full mb-3" />
            <Skeleton className="h-10 w-full rounded-lg" />
        </div>
    );
});

// ============================================================================
// Food Entry Skeleton
// ============================================================================

export const FoodEntrySkeleton = memo(function FoodEntrySkeleton() {
    return (
        <div className="flex items-center justify-between py-2 px-3">
            <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-16" />
        </div>
    );
});

// ============================================================================
// Search Results Skeleton
// ============================================================================

export const SearchResultsSkeleton = memo(function SearchResultsSkeleton() {
    return (
        <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between py-3 px-3">
                    <div className="flex-1">
                        <Skeleton className="h-4 w-40 mb-1" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                    <div className="text-right">
                        <Skeleton className="h-4 w-16 mb-1" />
                        <Skeleton className="h-3 w-12" />
                    </div>
                </div>
            ))}
        </div>
    );
});

// ============================================================================
// Full Page Skeleton
// ============================================================================

export const FoodTrackerPageSkeleton = memo(function FoodTrackerPageSkeleton() {
    return (
        <div className="space-y-3 pb-20 sm:space-y-4 sm:pb-24" aria-label="Загрузка...">
            <KBZHUSummarySkeleton />
            <MealSlotSkeleton />
            <MealSlotSkeleton />
            <MealSlotSkeleton />
            <MealSlotSkeleton />
            <WaterTrackerSkeleton />
        </div>
    );
});

// ============================================================================
// Recommendations Skeleton
// ============================================================================

export const RecommendationsSkeleton = memo(function RecommendationsSkeleton() {
    return (
        <div className="space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="w-5 h-5 rounded" />
                    </div>
                    <div className="space-y-3">
                        {[1, 2, 3].map((j) => (
                            <div key={j} className="flex items-center justify-between">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-4 w-20" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
});

export default {
    Skeleton,
    KBZHUSummarySkeleton,
    MealSlotSkeleton,
    WaterTrackerSkeleton,
    FoodEntrySkeleton,
    SearchResultsSkeleton,
    FoodTrackerPageSkeleton,
    RecommendationsSkeleton,
};
