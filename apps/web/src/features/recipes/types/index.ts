/**
 * Каталог рецептов — типы ответа и запроса.
 *
 * Имена полей — ровно те, что в контракте
 * (`openspec/changes/recipe-catalogue/api.md`), в snake_case. Список,
 * прочитанный не тем полем, выглядит как пустой — так однажды «Недавние»
 * не показывались никогда.
 */

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const COMPLEXITIES = ['easy', 'medium', 'hard'] as const
export type Complexity = (typeof COMPLEXITIES)[number]

export const ALLERGENS = [
    'nuts',
    'peanuts',
    'gluten',
    'lactose',
    'eggs',
    'fish',
    'seafood',
    'soy',
    'sesame',
    'mustard',
    'celery',
] as const
export type Allergen = (typeof ALLERGENS)[number]

export type VersionState = 'draft' | 'review' | 'approved' | 'superseded'
export type RecipeStatus = 'published' | 'unpublished'
export type RecipeSource = 'manual' | 'vkusvill'

export interface Nutrition {
    kcal: number
    protein: number
    fat: number
    carbs: number
}

export interface IngredientCandidate {
    food_id: string
    name: string
    default_weight: number | null
}

export interface Ingredient {
    position: number
    food_id: string | null
    food_name: string | null
    source_name: string | null
    grams: number | null
    display_quantity: string | null
    to_taste: boolean
    candidates?: IngredientCandidate[]
}

export interface Step {
    position: number
    text: string
    photo_url: string | null
    /** Ключ в хранилище — то, что уходит обратно при сохранении. */
    photo_key: string | null
}

export interface RecipeVersion {
    id: string
    recipe_id: string
    version: number
    state: VersionState
    name: string
    description: string
    photo_url: string | null
    /** Ключ в хранилище — то, что уходит обратно при сохранении. */
    photo_key: string | null
    cook_minutes: number
    complexity: Complexity
    servings: number
    yield_grams: number | null
    total_grams: number
    portion_grams: number
    approximate: boolean
    meal_types: MealType[]
    tags: string[]
    allergens: Allergen[]
    per_100g: Nutrition
    per_portion: Nutrition
    ingredients: Ingredient[]
    steps: Step[]
    review_comment: string | null
    approved_at: string | null
    created_at: string
}

export interface RecipeSummary {
    id: string
    status: RecipeStatus
    source: RecipeSource
    name: string
    photo_key: string | null
    photo_url: string | null
    cook_minutes: number
    complexity: Complexity
    meal_types: MealType[]
    portion_grams: number
    per_portion: Nutrition
    approximate: boolean
    approved_version: number | null
    working_state: 'draft' | 'review' | null
}

/** `response.Collection` бэкенда. */
export interface Collection<T> {
    items: T[]
    total: number
    limit: number
    offset: number
}

/** Рецепт целиком для команды и куратора. */
export interface RecipeBundle {
    recipe: RecipeSummary
    approved: RecipeVersion | null
    working: RecipeVersion | null
}

export interface IngredientInput {
    /** Число из `products` или UUID `food_items` — в той форме, что отдал поиск. */
    food_id: string | number | null
    source_name?: string | null
    grams: number | null
    display_quantity: string | null
    to_taste: boolean
}

export interface StepInput {
    text: string
    photo_key: string | null
}

export interface VersionInput {
    name: string
    description: string
    photo_key: string | null
    cook_minutes: number
    complexity: Complexity
    servings: number
    yield_grams: number | null
    meal_types: MealType[]
    tags: string[]
    allergens: Allergen[]
    ingredients: IngredientInput[]
    steps: StepInput[]
}

export interface CatalogueFood {
    food_id: string | number
    name: string
    kcal_100: number
    protein_100: number
    fat_100: number
    carbs_100: number
    default_weight: number | null
}

export interface VkusvillRecipe {
    source_ref: string
    name: string
    photo_url: string | null
    portions: number | null
    imported_recipe_id: string | null
    cook_minutes?: number | null
    complexity?: Complexity | null
    ingredients_count?: number | null
}

export interface VkusvillSearch {
    items: VkusvillRecipe[]
    has_more: boolean
}

export interface ImportResult {
    recipe_id: string
    existing?: boolean
}

export interface UploadedPhoto {
    photo_key: string
    photo_url: string
}

export interface NamedRef {
    id: string
    name: string
}

export interface FoodRestrictions {
    allergens: Allergen[]
    excluded_foods: { food_id: string; name: string }[]
    rejected_recipes: NamedRef[]
    hidden_recipes?: NamedRef[]
}

export interface FoodRestrictionsInput {
    allergens: Allergen[]
    excluded_food_ids: string[]
}

export interface CatalogueQuery {
    q?: string
    meal_type?: MealType | ''
    page?: number
    page_size?: number
}

export interface AdminListQuery {
    q?: string
    state?: string
    page?: number
    page_size?: number
}
