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

export interface ClientDetail extends ClientCard {
    food_entries: FoodEntryView[]
    weekly_plan: PlanKBZHU | null
    last_weight: number | null
}
