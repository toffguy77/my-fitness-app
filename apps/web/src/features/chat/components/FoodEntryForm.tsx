/**
 * FoodEntryForm Component
 *
 * Modal overlay form for curators to create a food entry from a photo message.
 * Allows entering food name, meal type, weight, and KBZHU nutritional values.
 */

'use client'

import { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { chatApi } from '../api/chatApi'
import type { Message, CreateFoodEntryRequest } from '../types'
import { t } from '@/shared/i18n'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { messageForOr } from '@/shared/errors/apiErrors'

// ============================================================================
// Types
// ============================================================================

interface FoodEntryFormProps {
    conversationId: string
    messageId: string
    onClose: () => void
    onSubmit: (message: Message) => void
}

type MealType = CreateFoodEntryRequest['meal_type']

// ============================================================================
// Constants
// ============================================================================

const MEAL_OPTIONS: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: t('meals.breakfast') },
    { value: 'lunch', label: t('meals.lunch') },
    { value: 'dinner', label: t('meals.dinner') },
    { value: 'snack', label: t('meals.snack') },
]

// ============================================================================
// Component
// ============================================================================

export function FoodEntryForm({
    conversationId,
    messageId,
    onClose,
    onSubmit,
}: FoodEntryFormProps) {
    const [foodName, setFoodName] = useState('')
    const [mealType, setMealType] = useState<MealType>('lunch')
    const [weight, setWeight] = useState('')
    const [calories, setCalories] = useState('')
    const [protein, setProtein] = useState('')
    const [fat, setFat] = useState('')
    const [carbs, setCarbs] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault()

            if (!foodName.trim()) {
                setError(t('chat.dishRequired'))
                return
            }

            setIsSubmitting(true)
            setError(null)

            try {
                const data: CreateFoodEntryRequest = {
                    food_name: foodName.trim(),
                    meal_type: mealType,
                    weight: Number(weight) || 0,
                    calories: Number(calories) || 0,
                    protein: Number(protein) || 0,
                    fat: Number(fat) || 0,
                    carbs: Number(carbs) || 0,
                }

                const resultMessage = await chatApi.createFoodEntry(
                    conversationId,
                    messageId,
                    data
                )
                onSubmit(resultMessage)
                onClose()
            } catch (err) {
                setError(messageForOr(err, t('chat.createFailed')))
            } finally {
                setIsSubmitting(false)
            }
        },
        [
            foodName,
            mealType,
            weight,
            calories,
            protein,
            fat,
            carbs,
            conversationId,
            messageId,
            onSubmit,
            onClose,
        ]
    )

    // Close on backdrop click
    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) {
                onClose()
            }
        },
        [onClose]
    )

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-lg rounded-t-sheet bg-surface pb-[env(safe-area-inset-bottom)] shadow-overlay animate-in slide-in-from-bottom duration-200 sm:rounded-sheet">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 py-3 pl-6 pr-3">
                    <h3 className="type-title-2 text-fg">
                        {t('chat.addMacros')}
                    </h3>
                    <IconButton
                        variant="ghost"
                        onClick={onClose}
                        aria-label={t('common.close')}
                    >
                        <X className="h-5 w-5" strokeWidth={1.8} />
                    </IconButton>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-2">
                    {/* Food name */}
                    <div>
                        <label
                            htmlFor="food-name"
                            className="mb-1.5 block text-sm font-medium text-fg-muted"
                        >
                            {t('chat.dishName')}
                        </label>
                        <input
                            id="food-name"
                            type="text"
                            value={foodName}
                            onChange={(e) => setFoodName(e.target.value)}
                            placeholder={t('chat.dishPlaceholder')}
                            required
                            className="h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                        />
                    </div>

                    {/* Meal type */}
                    <div>
                        <label
                            htmlFor="meal-type"
                            className="mb-1.5 block text-sm font-medium text-fg-muted"
                        >
                            {t('chat.meal')}
                        </label>
                        <select
                            id="meal-type"
                            value={mealType}
                            onChange={(e) =>
                                setMealType(e.target.value as MealType)
                            }
                            className="h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                        >
                            {MEAL_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Weight */}
                    <div>
                        <label
                            htmlFor="weight"
                            className="mb-1.5 block text-sm font-medium text-fg-muted"
                        >
                            {t('chat.weightField')}
                        </label>
                        <input
                            id="weight"
                            type="number"
                            min="0"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            placeholder="0"
                            className="h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                        />
                    </div>

                    {/* KBZHU row */}
                    <div className="grid grid-cols-4 gap-2">
                        <div>
                            <label
                                htmlFor="calories"
                                className="mb-1.5 block truncate text-[13px] font-medium text-fg-muted"
                            >
                                {t('chat.caloriesField')}
                            </label>
                            <input
                                id="calories"
                                type="number"
                                min="0"
                                value={calories}
                                onChange={(e) => setCalories(e.target.value)}
                                placeholder="0"
                                className="h-12 w-full rounded-field border border-line bg-surface px-3 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="protein"
                                className="mb-1.5 block truncate text-[13px] font-medium text-fg-muted"
                            >
                                {t('chat.proteinField')}
                            </label>
                            <input
                                id="protein"
                                type="number"
                                min="0"
                                step="0.1"
                                value={protein}
                                onChange={(e) => setProtein(e.target.value)}
                                placeholder="0"
                                className="h-12 w-full rounded-field border border-line bg-surface px-3 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="fat"
                                className="mb-1.5 block truncate text-[13px] font-medium text-fg-muted"
                            >
                                {t('chat.fatField')}
                            </label>
                            <input
                                id="fat"
                                type="number"
                                min="0"
                                step="0.1"
                                value={fat}
                                onChange={(e) => setFat(e.target.value)}
                                placeholder="0"
                                className="h-12 w-full rounded-field border border-line bg-surface px-3 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="carbs"
                                className="mb-1.5 block truncate text-[13px] font-medium text-fg-muted"
                            >
                                {t('chat.carbsField')}
                            </label>
                            <input
                                id="carbs"
                                type="number"
                                min="0"
                                step="0.1"
                                value={carbs}
                                onChange={(e) => setCarbs(e.target.value)}
                                placeholder="0"
                                className="h-12 w-full rounded-field border border-line bg-surface px-3 text-base text-fg tabular-nums placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                            />
                        </div>
                    </div>

                    {/* Error message */}
                    {error && (
                        <p className="text-sm text-danger-fg" role="alert">{error}</p>
                    )}

                    {/* Submit button */}
                    <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        block
                        disabled={isSubmitting || !foodName.trim()}
                    >
                        {isSubmitting ? t('common.saving') : t('chat.addMacros')}
                    </Button>
                </form>
            </div>
        </div>
    )
}
