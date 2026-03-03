import type { LucideIcon } from 'lucide-react'

export type CuratorNavigationItemId = 'clients' | 'chats' | 'profile'

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
