// i18n-exempt-file — тестовые данные, их никто не читает в интерфейсе.
import type { Alternative, MealPlan, PlanItem } from '../types'

export const DATE = '2026-10-10'
export const PHOTO_URL = 'https://storage.yandexcloud.net/curator-content/recipes/aaa.jpg'

export function item(overrides: Partial<PlanItem> = {}): PlanItem {
    return {
        meal_type: 'breakfast',
        recipe_id: 'r-breakfast',
        recipe_version_id: 'v-breakfast',
        name: 'Сырники',
        photo_url: PHOTO_URL,
        grams: 200,
        portion_grams: 150,
        nutrition: { kcal: 420, protein: 30, fat: 14, carbs: 44 },
        percent_of_target: { kcal: 21, protein: 25, fat: 21, carbs: 18 },
        locked: false,
        manual_grams: false,
        unavailable: false,
        ...overrides,
    }
}

export function plan(overrides: Partial<MealPlan> = {}): MealPlan {
    return {
        date: DATE,
        meal_types: ['breakfast', 'lunch', 'dinner', 'snack'],
        target: { kcal: 2000, protein: 120, fat: 67, carbs: 250 },
        target_changed: false,
        items: [
            item(),
            item({ meal_type: 'lunch', recipe_id: 'r-lunch', recipe_version_id: 'v-lunch', name: 'Плов с курицей', photo_url: null, grams: 350 }),
            item({ meal_type: 'dinner', recipe_id: 'r-dinner', recipe_version_id: 'v-dinner', name: 'Треска с овощами', grams: 300 }),
            item({ meal_type: 'snack', recipe_id: 'r-snack', recipe_version_id: 'v-snack', name: 'Йогурт с ягодами', grams: 150 }),
        ],
        empty: [],
        totals: { kcal: 1960, protein: 102, fat: 70, carbs: 240 },
        percent_of_target: { kcal: 98, protein: 85, fat: 104, carbs: 96 },
        remaining: { kcal: 40, protein: 18, fat: -3, carbs: 10 },
        calorie_split: { protein: 21, fat: 32, carbs: 47 },
        deviations: [],
        ...overrides,
    }
}

export function alternative(overrides: Partial<Alternative> = {}): Alternative {
    return {
        recipe_id: 'r-alt-1',
        name: 'Индейка с булгуром',
        photo_url: null,
        grams: 280,
        nutrition: { kcal: 510, protein: 42, fat: 12, carbs: 55 },
        day_totals: { kcal: 1990, protein: 118, fat: 66, carbs: 245 },
        ...overrides,
    }
}
