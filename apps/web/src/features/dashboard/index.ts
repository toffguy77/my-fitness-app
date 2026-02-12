/**
 * Dashboard feature public API
 *
 * This file exports the public interface of the dashboard feature.
 * Components, hooks, and utilities should be exported here for use by other features.
 */

import { lazy } from 'react'

// Types
export type {
    NavigationItemId,
    NavigationItemConfig,
    UserProfile,
    NotificationSummary,
} from './types'

// ============================================================================
// Eager-loaded Components (Above the fold - critical for initial render)
// ============================================================================
export { DashboardLayout } from './components/DashboardLayout'
export { DashboardHeader } from './components/DashboardHeader'
export { FooterNavigation } from './components/FooterNavigation'
export { NavigationItem } from './components/NavigationItem'
export { MainContent } from './components/MainContent'
export { CalendarNavigator } from './components/CalendarNavigator'
export { DailyTrackingGrid } from './components/DailyTrackingGrid'
export { NutritionBlock } from './components/NutritionBlock'
export { WeightBlock } from './components/WeightBlock'
export { StepsBlock } from './components/StepsBlock'
export { WorkoutBlock } from './components/WorkoutBlock'
export { OfflineIndicator } from './components/OfflineIndicator'
export { UnsavedDataNotification } from './components/UnsavedDataNotification'
export { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp'

// ============================================================================
// Lazy-loaded Components (Below the fold - code splitting)
// ============================================================================
// These components are loaded on demand to reduce initial bundle size
// Use with React.Suspense for loading states

/**
 * Lazy-loaded ProgressSection component
 * Displays weight trends, nutrition adherence, and achievements
 */
export const LazyProgressSection = lazy(() =>
    import('./components/ProgressSection').then(module => ({
        default: module.ProgressSection
    }))
)

/**
 * Lazy-loaded PhotoUploadSection component
 * Handles weekly progress photo uploads
 */
export const LazyPhotoUploadSection = lazy(() =>
    import('./components/PhotoUploadSection').then(module => ({
        default: module.PhotoUploadSection
    }))
)

/**
 * Lazy-loaded WeeklyPlanSection component
 * Displays coach-assigned nutrition plan
 */
export const LazyWeeklyPlanSection = lazy(() =>
    import('./components/WeeklyPlanSection').then(module => ({
        default: module.WeeklyPlanSection
    }))
)

/**
 * Lazy-loaded TasksSection component
 * Displays coach-assigned tasks
 */
export const LazyTasksSection = lazy(() =>
    import('./components/TasksSection').then(module => ({
        default: module.TasksSection
    }))
)

// ============================================================================
// Loading Skeletons for Lazy Components
// ============================================================================
export {
    ProgressSectionSkeleton,
    PhotoUploadSectionSkeleton,
    WeeklyPlanSectionSkeleton,
    TasksSectionSkeleton,
    BelowFoldSectionsSkeleton,
} from './components/LoadingSkeletons'

// ============================================================================
// Regular exports (for direct imports when code splitting is not needed)
// ============================================================================
export { ProgressSection } from './components/ProgressSection'
export { PhotoUploadSection } from './components/PhotoUploadSection'
export { WeeklyPlanSection } from './components/WeeklyPlanSection'
export { TasksSection } from './components/TasksSection'

// Store
export { useDashboardStore } from './store/dashboardStore'

// Hooks
export { useUnsavedData } from './hooks/useUnsavedData'
export { useOnlineStatus } from './hooks/useOnlineStatus'
export {
    useKeyboardNavigation,
    useRovingTabIndex,
    useFocusTrap
} from './hooks/useKeyboardNavigation'

// Error handling utilities
export {
    DashboardErrorCode,
    mapApiError,
    calculateRetryDelay,
    retryWithBackoff,
    showErrorToast,
    showValidationErrors,
    handleError,
    createErrorHandler,
    withErrorHandling,
    isOnline,
    DEFAULT_RETRY_CONFIG,
} from './utils/errorHandling'

export type { DashboardError, RetryConfig } from './utils/errorHandling'

// Offline queue utilities
export {
    addToQueue,
    removeFromQueue,
    loadQueue,
    saveQueue,
    updateQueueEntry,
    getQueueSize,
    clearQueue,
    getEntriesByType,
    shouldRetry,
    incrementAttempts,
    removeFailedEntries,
    getOldestEntry,
    sortQueueByTimestamp,
} from './utils/offlineQueue'

export type { QueueEntry } from './utils/offlineQueue'

// Hooks will be exported here as they are implemented
// export { useUserProfile } from './hooks/useUserProfile'
// export { useNotifications } from './hooks/useNotifications'
