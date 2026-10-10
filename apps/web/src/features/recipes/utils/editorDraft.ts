import type {
    Allergen,
    Complexity,
    IngredientCandidate,
    MealType,
    RecipeVersion,
    VersionInput,
} from '../types'

/**
 * Состояние редактора рецепта.
 *
 * Числа хранятся строками, как их вводит человек: пустое поле — это «не
 * задано», а не ноль, и превращение в число происходит один раз, при отправке.
 */
export interface IngredientDraft {
    key: string
    food_id: string | number | null
    food_name: string | null
    source_name: string | null
    grams: string
    display_quantity: string
    to_taste: boolean
    candidates: IngredientCandidate[]
}

export interface StepDraft {
    key: string
    text: string
    photo_key: string | null
    photo_url: string | null
}

export interface EditorDraft {
    name: string
    description: string
    photo_key: string | null
    photo_url: string | null
    cook_minutes: string
    complexity: Complexity
    servings: string
    yield_grams: string
    meal_types: MealType[]
    tags: string
    allergens: Allergen[]
    ingredients: IngredientDraft[]
    steps: StepDraft[]
}

let sequence = 0

/** Ключ строки списка: позиции меняются, а React должен узнавать строку. */
export function nextKey(): string {
    sequence += 1
    return `row-${sequence}`
}

export function emptyIngredient(): IngredientDraft {
    return {
        key: nextKey(),
        food_id: null,
        food_name: null,
        source_name: null,
        grams: '',
        display_quantity: '',
        to_taste: false,
        candidates: [],
    }
}

export function emptyStep(): StepDraft {
    return { key: nextKey(), text: '', photo_key: null, photo_url: null }
}

function numberText(value: number | null | undefined): string {
    return value == null ? '' : String(value)
}

export function draftFromVersion(version: RecipeVersion | null): EditorDraft {
    if (!version) {
        return {
            name: '',
            description: '',
            photo_key: null,
            photo_url: null,
            cook_minutes: '30',
            complexity: 'easy',
            servings: '2',
            yield_grams: '',
            meal_types: [],
            tags: '',
            allergens: [],
            ingredients: [emptyIngredient()],
            steps: [emptyStep()],
        }
    }

    return {
        name: version.name,
        description: version.description,
        photo_key: version.photo_key,
        photo_url: version.photo_url,
        cook_minutes: numberText(version.cook_minutes),
        complexity: version.complexity,
        servings: numberText(version.servings),
        yield_grams: numberText(version.yield_grams),
        meal_types: [...version.meal_types],
        tags: version.tags.join(', '),
        allergens: [...version.allergens],
        ingredients: [...version.ingredients]
            .sort((a, b) => a.position - b.position)
            .map((ingredient) => ({
                key: nextKey(),
                food_id: ingredient.food_id,
                food_name: ingredient.food_name,
                source_name: ingredient.source_name,
                grams: ingredient.to_taste ? '' : numberText(ingredient.grams),
                display_quantity: ingredient.display_quantity ?? '',
                to_taste: ingredient.to_taste,
                candidates: ingredient.candidates ?? [],
            })),
        steps: [...version.steps]
            .sort((a, b) => a.position - b.position)
            .map((step) => ({
                key: nextKey(),
                text: step.text,
                photo_key: step.photo_key,
                photo_url: step.photo_url,
            })),
    }
}

function toNumber(text: string): number | null {
    const trimmed = text.trim().replace(',', '.')
    if (trimmed === '') return null
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : null
}

/**
 * Состояние редактора → запрос на сохранение.
 *
 * Пустые строки ингредиентов и шагов отбрасываются: незаполненная строка,
 * добавленная «на будущее», — не ингредиент. КБЖУ не отправляется вовсе —
 * его считает сервер.
 */
export function draftToInput(draft: EditorDraft): VersionInput {
    return {
        name: draft.name.trim(),
        description: draft.description.trim(),
        photo_key: draft.photo_key,
        cook_minutes: toNumber(draft.cook_minutes) ?? 0,
        complexity: draft.complexity,
        servings: toNumber(draft.servings) ?? 0,
        yield_grams: toNumber(draft.yield_grams),
        meal_types: draft.meal_types,
        tags: draft.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        allergens: draft.allergens,
        ingredients: draft.ingredients
            .filter((ingredient) => ingredient.food_id != null || ingredient.source_name || ingredient.grams.trim())
            .map((ingredient) => ({
                food_id: ingredient.food_id,
                source_name: ingredient.source_name,
                grams: ingredient.to_taste ? null : toNumber(ingredient.grams),
                display_quantity: ingredient.display_quantity.trim() || null,
                to_taste: ingredient.to_taste,
            })),
        steps: draft.steps
            .filter((step) => step.text.trim() || step.photo_key)
            .map((step) => ({ text: step.text.trim(), photo_key: step.photo_key })),
    }
}
