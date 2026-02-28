/**
 * FoodEntryCard Component
 *
 * Renders a food_entry message with nutritional data.
 * Shows food name, meal type (in Russian), weight, and KBZHU values.
 */

'use client'

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
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус',
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
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 min-w-[200px] max-w-[280px]">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-emerald-900">
                    {data.food_name ?? 'Продукт'}
                </span>
                {data.meal_type && (
                    <span className="text-xs text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                        {getMealLabel(data.meal_type)}
                    </span>
                )}
            </div>

            {data.weight != null && (
                <p className="text-xs text-emerald-700 mb-2">{data.weight} г</p>
            )}

            <div className="flex items-center gap-3 text-xs">
                <div className="text-center">
                    <span className="block font-medium text-gray-900">
                        {data.calories ?? 0}
                    </span>
                    <span className="text-gray-500">ккал</span>
                </div>
                <div className="text-center">
                    <span className="block font-medium text-gray-900">
                        {data.protein ?? 0}
                    </span>
                    <span className="text-gray-500">Б</span>
                </div>
                <div className="text-center">
                    <span className="block font-medium text-gray-900">
                        {data.fat ?? 0}
                    </span>
                    <span className="text-gray-500">Ж</span>
                </div>
                <div className="text-center">
                    <span className="block font-medium text-gray-900">
                        {data.carbs ?? 0}
                    </span>
                    <span className="text-gray-500">У</span>
                </div>
            </div>
        </div>
    )
}
