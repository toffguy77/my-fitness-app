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
            className="fixed inset-0 z-50 flex items-end justify-center bg-scrim"
            onClick={handleBackdropClick}
        >
            <div className="w-full max-w-lg bg-surface rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                    <h3 className="text-base font-semibold text-fg">
                        {t('chat.addMacros')}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 text-fg-subtle hover:text-fg-muted transition-colors rounded-full hover:bg-subtle"
                        aria-label={t('common.close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
                    {/* Food name */}
                    <div>
                        <label
                            htmlFor="food-name"
                            className="block text-sm font-medium text-fg mb-1"
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
                            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus"
                        />
                    </div>

                    {/* Meal type */}
                    <div>
                        <label
                            htmlFor="meal-type"
                            className="block text-sm font-medium text-fg mb-1"
                        >
                            {t('chat.meal')}
                        </label>
                        <select
                            id="meal-type"
                            value={mealType}
                            onChange={(e) =>
                                setMealType(e.target.value as MealType)
                            }
                            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus bg-surface"
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
                            className="block text-sm font-medium text-fg mb-1"
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
                            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus"
                        />
                    </div>

                    {/* KBZHU row */}
                    <div className="grid grid-cols-4 gap-2">
                        <div>
                            <label
                                htmlFor="calories"
                                className="block text-xs font-medium text-fg mb-1"
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
                                className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="protein"
                                className="block text-xs font-medium text-fg mb-1"
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
                                className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="fat"
                                className="block text-xs font-medium text-fg mb-1"
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
                                className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="carbs"
                                className="block text-xs font-medium text-fg mb-1"
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
                                className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus"
                            />
                        </div>
                    </div>

                    {/* Error message */}
                    {error && (
                        <p className="text-sm text-danger-fg">{error}</p>
                    )}

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={isSubmitting || !foodName.trim()}
                        className="w-full rounded-lg bg-success text-on-primary py-2.5 text-sm font-medium hover:bg-success disabled:bg-line disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting ? t('common.saving') : t('chat.addMacros')}
                    </button>
                </form>
            </div>
        </div>
    )
}
