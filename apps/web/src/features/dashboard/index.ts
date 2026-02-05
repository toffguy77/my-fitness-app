/**
 * Dashboard feature public API
 *
 * This file exports the public interface of the dashboard feature.
 * Components, hooks, and utilities should be exported here for use by other features.
 */

// Types
export type {
    NavigationItemId,
    NavigationItemConfig,
    UserProfile,
    NotificationSummary,
} from './types'

// Components
export { DashboardLayout } from './components/DashboardLayout'
export { DashboardHeader } from './components/DashboardHeader'
export { FooterNavigation } from './components/FooterNavigation'
export { NavigationItem } from './components/NavigationItem'
export { MainContent } from './components/MainContent'
export { DailyTrackingGrid } from './components/DailyTrackingGrid'
export { NutritionBlock } from './components/NutritionBlock'
export { WeightBlock } from './components/WeightBlock'
export { StepsBlock } from './components/StepsBlock'
export { WorkoutBlock } from './components/WorkoutBlock'

// Hooks will be exported here as they are implemented
// export { useUserProfile } from './hooks/useUserProfile'
// export { useNotifications } from './hooks/useNotifications'
