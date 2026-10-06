/**
 * FoodEntryCard Component
 *
 * Renders a food_entry message with nutritional data.
 * Shows food name, meal type (in Russian), weight, and KBZHU values.
 */

'use client'

import { t } from '@/shared/i18n'
import { MACRO_TEXT_COLORS } from '@/shared/constants/macros'

// ============================================================================
// Types
// ============================================================================

interface FoodEntryMetadata {
    food_name?: string
    meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    weight?: number
    calories?: number
    protein?: number
    fat?: number
    carbs?: number
}

interface FoodEntryCardProps {
    metadata: Record<string, unknown> | undefined
}

// ============================================================================
// Helpers
// ============================================================================

const MEAL_TYPE_LABELS: Record<string, string> = {
    breakfast: t('meals.breakfast'),
    lunch: t('meals.lunch'),
    dinner: t('meals.dinner'),
    snack: t('meals.snack'),
}

function getMealLabel(mealType?: string): string {
    if (!mealType) return ''
    return MEAL_TYPE_LABELS[mealType] ?? mealType
}

// ============================================================================
// Component
// ============================================================================

export function FoodEntryCard({ metadata }: FoodEntryCardProps) {
    if (!metadata) return null

    const data = metadata as unknown as FoodEntryMetadata

    // Запись КБЖУ — не реплика, а карточка дневника внутри переписки: бумага
    // с линией, как приём пищи в дневнике. Цвет у нутриентов опознаёт их и
    // ничего не оценивает; калории — суммой, без цвета.
    const macros = [
        { key: 'protein', value: data.protein, label: t('macros.proteinShort') },
        { key: 'fat', value: data.fat, label: t('macros.fatShort') },
        { key: 'carbs', value: data.carbs, label: t('macros.carbsShort') },
    ] as const

    return (
        <div className="min-w-[200px] max-w-[280px] rounded-tile border border-line bg-surface p-3.5">
            <div className="mb-1 flex items-start justify-between gap-2">
                <span className="type-headline text-fg">
                    {data.food_name ?? t('chat.product')}
                </span>
                {data.meal_type && (
                    <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                        {getMealLabel(data.meal_type)}
                    </span>
                )}
            </div>

            {data.weight != null && (
                <p className="mb-2 text-[13px] text-fg-muted tabular-nums">{t('chat.weightGrams', { weight: data.weight })}</p>
            )}

            <div className="flex items-end gap-4 border-t border-line pt-2 text-[13px] tabular-nums">
                <div className="text-center">
                    <span className="block font-semibold text-fg">
                        {data.calories ?? 0}
                    </span>
                    <span className="text-fg-muted">{t('units.kcal')}</span>
                </div>
                {macros.map((macro) => (
                    <div key={macro.key} className="text-center">
                        <span className="block font-semibold text-fg">
                            {macro.value ?? 0}
                        </span>
                        <span style={{ color: MACRO_TEXT_COLORS[macro.key] }}>{macro.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
