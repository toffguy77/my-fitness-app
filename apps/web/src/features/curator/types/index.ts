import type { LucideIcon } from 'lucide-react'

export type CuratorNavigationItemId = 'hub' | 'chats' | 'content' | 'profile'

export interface CuratorNavigationItemConfig {
    id: CuratorNavigationItemId
    label: string
    icon: LucideIcon
    href: string
}

export interface DailyKBZHU {
    calories: number
    protein: number
    fat: number
    carbs: number
}

export interface PlanKBZHU {
    calories: number
    protein: number
    fat: number
    carbs: number
}

export interface Alert {
    level: 'red' | 'yellow' | 'green'
    message: string
}

export interface ClientCard {
    id: number
    name: string
    avatar_url?: string
    today_kbzhu: DailyKBZHU | null
    plan: PlanKBZHU | null
    alerts: Alert[]
    unread_count: number
    last_weight: number | null
    weight_trend: 'up' | 'down' | 'stable' | ''
    target_weight: number | null
    today_water: WaterView | null
    email?: string
    height?: number | null
    timezone?: string
    telegram_username?: string
    instagram_username?: string
    birth_date?: string | null
    biological_sex?: string | null
    activity_level?: string | null
    fitness_goal?: string | null
    weekly_kbzhu_percent?: number
    active_tasks_count?: number
    overdue_tasks_count?: number
    last_activity_date?: string
    streak_days?: number
}

export interface FoodEntryView {
    id: string
    food_name: string
    meal_type: string
    calories: number
    protein: number
    fat: number
    carbs: number
    weight: number
    created_by?: number
    time: string
}

export interface WeightHistoryPoint {
    date: string
    weight: number
}

export interface WaterView {
    glasses: number
    goal: number
    glass_size: number
}

export interface WorkoutView {
    completed: boolean
    type: string
    duration: number
}

export interface PhotoView {
    id: string
    photo_url: string
    week_start: string
    week_end: string
    uploaded_at: string
}

export interface DayDetail {
    date: string
    kbzhu: DailyKBZHU | null
    plan: PlanKBZHU | null
    alerts: Alert[]
    food_entries: FoodEntryView[]
    water: WaterView | null
    steps: number
    workout: WorkoutView | null
}

export interface ClientDetail extends ClientCard {
    days: DayDetail[]
    weekly_plan: PlanKBZHU | null
    weight_history: WeightHistoryPoint[]
    photos: PhotoView[]
    water_goal: number | null
}

// Weekly plans
export interface WeeklyPlanView {
    id: string
    calories: number
    protein: number
    fat: number
    carbs: number
    start_date: string
    end_date: string
    comment?: string
    is_active: boolean
    created_at: string
}

export interface CreateWeeklyPlanRequest {
    calories: number
    protein: number
    fat: number
    carbs: number
    start_date: string
    end_date: string
    comment?: string
}

export interface UpdateWeeklyPlanRequest {
    calories?: number
    protein?: number
    fat?: number
    carbs?: number
    comment?: string
}

// Tasks
export type TaskType = 'nutrition' | 'workout' | 'habit' | 'measurement'
export type TaskRecurrence = 'once' | 'daily' | 'weekly'
export type TaskStatus = 'active' | 'completed' | 'overdue'

export interface TaskView {
    id: string
    title: string
    type: TaskType
    description?: string
    deadline: string
    recurrence: TaskRecurrence
    recurrence_days?: number[]
    status: TaskStatus
    completions?: string[]
    created_at: string
}

export interface CreateTaskRequest {
    title: string
    type: TaskType
    description?: string
    deadline: string
    recurrence: TaskRecurrence
    recurrence_days?: number[]
}

// Weekly reports & feedback
export interface WeeklyReportView {
    id: string
    week_start: string
    week_end: string
    week_number: number
    summary: Record<string, unknown>
    submitted_at: string
    curator_feedback?: CuratorFeedback
    has_feedback: boolean
}

export type RatingLevel = 'excellent' | 'good' | 'needs_improvement'

export interface CategoryRating {
    rating: RatingLevel
    comment?: string
}

export interface CuratorFeedback {
    nutrition?: CategoryRating
    activity?: CategoryRating
    water?: CategoryRating
    photo_uploaded?: boolean
    summary: string
    recommendations?: string
}

export interface SubmitFeedbackRequest {
    nutrition?: CategoryRating
    activity?: CategoryRating
    water?: CategoryRating
    photo_uploaded?: boolean
    summary: string
    recommendations?: string
}

// Analytics
export interface AnalyticsSummary {
    total_clients: number
    attention_clients: number
    avg_kbzhu_percent: number
    total_unread: number
    clients_waiting: number
    active_tasks: number
    overdue_tasks: number
    completed_today: number
}

export interface AttentionItem {
    client_id: number
    client_name: string
    client_avatar?: string
    reason: 'red_alert' | 'overdue_task' | 'inactive' | 'unread_message' | 'awaiting_feedback'
    detail: string
    priority: number
    action_url: string
}

// Snapshots & benchmarks
export interface DailySnapshot {
    date: string
    total_clients: number
    attention_clients: number
    avg_kbzhu_percent: number
    total_unread: number
    active_tasks: number
    overdue_tasks: number
    completed_tasks: number
    avg_client_streak: number
}

export interface WeeklySnapshot {
    week_start: string
    avg_kbzhu_percent: number
    avg_response_time_hours: number
    clients_with_feedback: number
    clients_total: number
    task_completion_rate: number
    clients_on_track: number
    clients_off_track: number
    avg_client_streak: number
}

export interface PlatformBenchmark {
    week_start: string
    avg_kbzhu_percent: number
    avg_response_time_hours: number
    avg_task_completion_rate: number
    avg_feedback_rate: number
    avg_client_streak: number
    curator_count: number
}

export interface BenchmarkData {
    own_snapshots: WeeklySnapshot[]
    platform_benchmarks: PlatformBenchmark[]
}
