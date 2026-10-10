import { isApiError } from '@/shared/errors/apiErrors'
import { formatNumber, t } from '@/shared/i18n'

/**
 * Незаполненные поля из ответа `422` на отправку или одобрение с правкой:
 * `{code: "validation", params: {missing: string[]}}` (api.md, отклонение 2).
 * `null` — это не 422 с перечнем, а другая ошибка.
 */
export function missingFields(error: unknown): string[] | null {
    if (!isApiError(error) || error.status !== 422) return null
    const missing = (error.data as { params?: { missing?: unknown } } | null)?.params?.missing
    return Array.isArray(missing) ? missing.map(String) : null
}

const FIELD_LABELS: Record<string, () => string> = {
    name: () => t('recipes.editor.name'),
    description: () => t('recipes.editor.description'),
    photo: () => t('recipes.editor.photo'),
    photo_key: () => t('recipes.editor.photo'),
    cook_minutes: () => t('recipes.editor.cookMinutes'),
    complexity: () => t('recipes.editor.complexity'),
    servings: () => t('recipes.editor.servings'),
    meal_types: () => t('recipes.editor.mealTypes'),
    ingredients: () => t('recipes.editor.ingredients'),
    steps: () => t('recipes.editor.steps'),
}

/** Подпись поля для перечня незаполненного; незнакомое имя — как есть. */
export function fieldLabel(field: string): string {
    // Ингредиент из импорта без подтверждённого продукта (api.md, отклонение 2).
    if (field === 'ingredients.food_id') return t('recipes.editor.missingFoodId')
    if (field === 'ingredients.grams') return t('recipes.editor.missingGrams')
    const base = field.split(/[.[]/)[0]
    const label = FIELD_LABELS[base]
    if (!label) return field
    return base === field ? label() : `${label()} (${field.slice(base.length).replace(/^\./, '')})`
}

/** Число без лишних знаков: 12.0 → «12», 12.34 → «12,3». */
export function formatAmount(value: number): string {
    return formatNumber(value, undefined, { maximumFractionDigits: 1 })
}
