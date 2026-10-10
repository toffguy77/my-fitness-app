// i18n-exempt-file — тестовые данные, их никто не читает в интерфейсе.
import type { FoodRestrictions, RecipeBundle, RecipeSummary, RecipeVersion } from '../types'

export const RECIPE_ID = '0f8b6c1e-2d0a-4f43-9a51-1b2c3d4e5f60'
export const PHOTO_URL = 'https://storage.yandexcloud.net/curator-content/recipes/aaa.jpg'

export function summary(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
    return {
        id: RECIPE_ID,
        status: 'published',
        source: 'manual',
        name: 'Сырники',
        photo_key: 'recipes/aaa.jpg',
        photo_url: PHOTO_URL,
        cook_minutes: 25,
        complexity: 'easy',
        meal_types: ['breakfast'],
        portion_grams: 150,
        per_portion: { kcal: 320.4, protein: 21.3, fat: 12, carbs: 30.55 },
        approximate: false,
        approved_version: 1,
        working_state: null,
        ...overrides,
    }
}

export function version(overrides: Partial<RecipeVersion> = {}): RecipeVersion {
    return {
        id: 'v-1',
        recipe_id: RECIPE_ID,
        version: 1,
        state: 'approved',
        name: 'Сырники',
        description: 'Пышные сырники',
        photo_key: 'recipes/aaa.jpg',
        photo_url: PHOTO_URL,
        cook_minutes: 25,
        complexity: 'medium',
        servings: 2,
        yield_grams: 300,
        total_grams: 300,
        portion_grams: 150,
        approximate: false,
        meal_types: ['breakfast', 'snack'],
        tags: ['творог', 'быстро'],
        allergens: ['lactose', 'eggs'],
        per_100g: { kcal: 213.6, protein: 14.2, fat: 8, carbs: 20.4 },
        per_portion: { kcal: 320.4, protein: 21.3, fat: 12, carbs: 30.6 },
        ingredients: [
            {
                position: 2,
                food_id: 'food-egg',
                food_name: 'Яйцо куриное',
                source_name: null,
                grams: null,
                display_quantity: '1 шт.',
                to_taste: false,
            },
            {
                position: 1,
                food_id: 'food-curd',
                food_name: 'Творог 5%',
                source_name: null,
                grams: 250,
                display_quantity: null,
                to_taste: false,
            },
            {
                position: 3,
                food_id: 'food-salt',
                food_name: 'Соль',
                source_name: null,
                grams: null,
                display_quantity: null,
                to_taste: true,
            },
        ],
        steps: [
            {
                position: 2,
                text: 'Обжарить',
                photo_key: 'recipes/step2.jpg',
                photo_url: 'https://storage.yandexcloud.net/curator-content/recipes/step2.jpg',
            },
            { position: 1, text: 'Смешать творог с яйцом', photo_key: null, photo_url: null },
        ],
        review_comment: null,
        approved_at: '2026-10-01T10:00:00Z',
        created_at: '2026-10-01T09:00:00Z',
        ...overrides,
    }
}

export function bundle(overrides: Partial<RecipeBundle> = {}): RecipeBundle {
    return {
        recipe: summary(),
        approved: version(),
        working: null,
        ...overrides,
    }
}

export function restrictions(overrides: Partial<FoodRestrictions> = {}): FoodRestrictions {
    return {
        allergens: ['nuts'],
        excluded_foods: [{ food_id: 'food-mushroom', name: 'Грибы' }],
        rejected_recipes: [{ id: RECIPE_ID, name: 'Сырники' }],
        ...overrides,
    }
}
