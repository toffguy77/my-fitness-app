/**
 * FoodEntryCard Component
 *
 * Renders a food_entry message with nutritional data.
 * Shows food name, meal type (in Russian), weight, and KBZHU values.
 */

'use client'

import { t } from '@/shared/i18n'

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

    return (
        <div className="rounded-lg bg-success-soft border border-success/30 p-3 min-w-[200px] max-w-[280px]">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-success-fg">
                    {data.food_name ?? t('chat.product')}
                </span>
                {data.meal_type && (
                    <span className="text-xs text-success-fg bg-success-soft px-1.5 py-0.5 rounded">
                        {getMealLabel(data.meal_type)}
                    </span>
                )}
            </div>

            {data.weight != null && (
                <p className="text-xs text-success-fg mb-2">{t('chat.weightGrams', { weight: data.weight })}</p>
            )}

            <div className="flex items-center gap-3 text-xs">
                <div className="text-center">
                    <span className="block font-medium text-fg">
                        {data.calories ?? 0}
                    </span>
                    <span className="text-fg-muted">{t('units.kcal')}</span>
                </div>
                <div className="text-center">
                    <span className="block font-medium text-fg">
                        {data.protein ?? 0}
                    </span>
                    <span className="text-fg-muted">{t('macros.proteinShort')}</span>
                </div>
                <div className="text-center">
                    <span className="block font-medium text-fg">
                        {data.fat ?? 0}
                    </span>
                    <span className="text-fg-muted">{t('macros.fatShort')}</span>
                </div>
                <div className="text-center">
                    <span className="block font-medium text-fg">
                        {data.carbs ?? 0}
                    </span>
                    <span className="text-fg-muted">{t('macros.carbsShort')}</span>
                </div>
            </div>
        </div>
    )
}
