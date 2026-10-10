'use client'

import { useCallback, useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { NutritionLine } from '@/features/recipes/components/NutritionLine'
import { RecipePhoto } from '@/features/recipes/components/RecipePhoto'
import { useResource } from '@/features/recipes/hooks/useResource'
import { ErrorState } from '@/shared/components/ErrorState'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Spinner'
import { useFocusTrap } from '@/shared/hooks/useFocusTrap'
import { t } from '@/shared/i18n'
import { mealPlanApi } from '../api/mealPlanApi'
import type { Alternative, MealType, Nutrition } from '../types'

interface AlternativesSheetProps {
    date: string
    mealType: MealType
    /** Цель дня — чтобы показать итоги дня с альтернативой в процентах. */
    target: Nutrition
    /** Замена в пути: кнопки выбора выключены. */
    choosing: boolean
    onChoose: (recipeId: string) => void
    onClose: () => void
}

function percent(value: number, target: number): number {
    return target > 0 ? Math.round((value / target) * 100) : 0
}

/**
 * Замена блюда: 3–5 вариантов с уже подобранным весом и итогами дня, которые
 * получатся, если выбрать вариант. Шторка снизу на телефоне, окно на десктопе.
 */
export function AlternativesSheet({ date, mealType, target, choosing, onChoose, onClose }: AlternativesSheetProps) {
    const titleId = useId()
    const panelRef = useRef<HTMLDivElement>(null)
    useFocusTrap(panelRef as React.RefObject<HTMLElement>)

    const load = useCallback(() => mealPlanApi.alternatives(date, mealType), [date, mealType])
    const { data, error, loading, reload } = useResource(load)

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKey)
        return () => document.removeEventListener('keydown', handleKey)
    }, [onClose])

    const items: Alternative[] = data?.items ?? []

    return (
        <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div
                ref={panelRef}
                className="max-h-[90vh] w-full overflow-y-auto rounded-t-sheet bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-overlay sm:max-w-lg sm:rounded-sheet"
            >
                <div className="mb-5 flex items-center justify-between gap-3">
                    <h2 id={titleId} className="type-title-2 text-fg">
                        {t('mealPlan.alternatives.title', { meal: t(`recipes.mealTypes.${mealType}`) })}
                    </h2>
                    <IconButton variant="ghost" aria-label={t('common.close')} onClick={onClose} className="-mr-2">
                        <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>

                {loading && !data ? (
                    <Spinner label={t('mealPlan.alternatives.loading')} />
                ) : error && !data ? (
                    <ErrorState
                        variant="inline"
                        title={t('mealPlan.alternatives.loadFailed')}
                        onRetry={reload}
                        showHomeLink={false}
                    />
                ) : items.length === 0 ? (
                    <p className="py-6 text-center text-fg-muted">{t('mealPlan.alternatives.empty')}</p>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {items.map((alternative) => (
                            <li
                                key={alternative.recipe_id}
                                className="flex flex-col gap-3 rounded-card border border-line p-3"
                                data-testid={`alternative-${alternative.recipe_id}`}
                            >
                                <div className="flex gap-3">
                                    <RecipePhoto
                                        url={alternative.photo_url}
                                        alt={alternative.name}
                                        className="aspect-square w-16 shrink-0 rounded-tile"
                                    />
                                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                                        <h3 className="line-clamp-2 type-headline text-fg">{alternative.name}</h3>
                                        <p className="text-xs text-fg-muted tabular-nums">
                                            {t('recipes.nutrition.grams', { value: alternative.grams })}
                                        </p>
                                        <NutritionLine nutrition={alternative.nutrition} className="text-xs" />
                                    </div>
                                </div>
                                <p className="text-xs text-fg-muted tabular-nums">
                                    {t('mealPlan.alternatives.dayTotals', {
                                        kcal: Math.round(alternative.day_totals.kcal),
                                        percent: percent(alternative.day_totals.kcal, target.kcal),
                                        protein: Math.round(alternative.day_totals.protein),
                                        fat: Math.round(alternative.day_totals.fat),
                                        carbs: Math.round(alternative.day_totals.carbs),
                                    })}
                                </p>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => onChoose(alternative.recipe_id)}
                                    disabled={choosing}
                                    aria-label={t('mealPlan.alternatives.chooseAria', { name: alternative.name })}
                                >
                                    {t('mealPlan.alternatives.choose')}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
