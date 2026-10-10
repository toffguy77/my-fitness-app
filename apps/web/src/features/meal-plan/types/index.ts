/**
 * План питания на день — типы ответа и запроса.
 *
 * Имена полей — ровно те, что в контракте
 * (`openspec/changes/meal-day-plan/api.md`), в snake_case. Сторож —
 * `__tests__/goFields.test.ts`: он сверяет их с json-тегами Go.
 */

import { MEAL_TYPES, type MealType } from '@/features/recipes/types'

export { MEAL_TYPES }
export type { MealType }

export const NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs'] as const
export type Nutrient = (typeof NUTRIENTS)[number]

export interface Nutrition {
    kcal: number
    protein: number
    fat: number
    carbs: number
}

export interface PlanItem {
    meal_type: MealType
    recipe_id: string
    recipe_version_id: string
    name: string
    photo_url: string | null
    /** Кратно 10, если не задан вручную. */
    grams: number
    /** Вес порции рецепта. */
    portion_grams: number
    /** КБЖУ на вес `grams`. */
    nutrition: Nutrition
    /** Целые проценты от цели дня. */
    percent_of_target: Nutrition
    locked: boolean
    manual_grams: boolean
    /** Рецепт снят, скрыт или стал недоступен клиенту. */
    unavailable: boolean
    /**
     * Есть запись дневника на дату и приём пищи этого блюда
     * (`openspec/changes/plan-diary-logging/api.md`).
     */
    eaten: boolean
    /** Вес из записи дневника, а не из плана; `null`, пока не съедено. */
    eaten_grams: number | null
    /** Запись дневника; только когда `eaten`. */
    food_entry_id: string | null
}

export interface EmptySlot {
    meal_type: MealType
    reason: 'no_recipes'
}

/** Показатель вне допуска: `delta` > 0 — перебор, < 0 — недобор. */
export interface Deviation {
    nutrient: Nutrient
    delta: number
}

export interface CalorieSplit {
    protein: number
    fat: number
    carbs: number
}

export interface MealPlan {
    date: string
    meal_types: MealType[]
    target: Nutrition
    target_changed: boolean
    items: PlanItem[]
    empty: EmptySlot[]
    totals: Nutrition
    percent_of_target: Nutrition
    remaining: Nutrition
    calorie_split: CalorieSplit
    deviations: Deviation[]
}

export interface Alternative {
    recipe_id: string
    name: string
    photo_url: string | null
    grams: number
    nutrition: Nutrition
    /** Итоги дня, если выбрать эту альтернативу. */
    day_totals: Nutrition
}

export interface AlternativesResponse {
    items: Alternative[]
}

export interface PlanItemUpdate {
    recipe_id?: string
    grams?: number
    locked?: boolean
    reset_grams?: boolean
}

/** «Съел»: без `grams` — вес из плана, без `time` — решает сервер. */
export interface EatRequest {
    grams?: number
    /** `HH:MM`. */
    time?: string
}

/** Запись дневника и план, пересчитанный с ней. */
export interface EatResponse {
    entry_id: string
    plan: MealPlan
}

export interface MealPlanSettings {
    meal_types: MealType[]
}

/** Что сервер назвал недостающим в `409 target_missing`. */
export type MissingInput = 'profile' | 'weight'
