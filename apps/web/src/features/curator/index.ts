// Layout & navigation
export { CuratorLayout } from './components/CuratorLayout'
export { CuratorFooterNavigation } from './components/CuratorFooterNavigation'

// Client list & cards
export { ClientCard } from './components/ClientCard'
export { ClientList } from './components/ClientList'
export { KBZHUProgress } from './components/KBZHUProgress'
export { AlertBadge } from './components/AlertBadge'

// Analytics
export { AnalyticsSummaryCards } from './components/AnalyticsSummaryCards'
export { AttentionList } from './components/AttentionList'
export { AnalyticsDynamicsChart } from './components/AnalyticsDynamicsChart'

// Client detail
export { ClientDetailTabs } from './components/ClientDetailTabs'

// Plans
export { PlanTab } from './components/PlanTab'
export { PlanForm } from './components/PlanForm'

// Tasks
export { TasksTab } from './components/TasksTab'
export { TaskCard } from './components/TaskCard'
export { TaskForm } from './components/TaskForm'

// Reports & feedback
export { ReportsTab } from './components/ReportsTab'
export { ReportCard } from './components/ReportCard'
export { FeedbackForm } from './components/FeedbackForm'

// API
export { curatorApi } from './api/curatorApi'

// Types
export type { CuratorNavigationItemId, CuratorNavigationItemConfig } from './types'
export type { ClientCard as ClientCardType, ClientDetail, FoodEntryView, DailyKBZHU, PlanKBZHU, Alert } from './types'
export type { WeeklyPlanView, CreateWeeklyPlanRequest, UpdateWeeklyPlanRequest } from './types'
export type { TaskType, TaskRecurrence, TaskStatus, TaskView, CreateTaskRequest } from './types'
export type { WeeklyReportView, RatingLevel, CategoryRating, CuratorFeedback, SubmitFeedbackRequest } from './types'
export type { AnalyticsSummary, AttentionItem } from './types'
export type { DailySnapshot, WeeklySnapshot, PlatformBenchmark, BenchmarkData } from './types'
