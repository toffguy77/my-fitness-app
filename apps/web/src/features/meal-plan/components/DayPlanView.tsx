'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, RefreshCw, ShoppingBasket } from 'lucide-react'
import { ErrorState } from '@/shared/components/ErrorState'
import { Button, IconButton, buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Spinner'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import { useMealPlan } from '../hooks/useMealPlan'
import { MEAL_TYPES, type MealType } from '../types'
import { addDays, dayLabel, isWithinWindow, todayString } from '../utils/planDates'
import { targetMissingFrom } from '../utils/planText'
import { AlternativesSheet } from './AlternativesSheet'
import { DayTotals } from './DayTotals'
import { MealSlotCard } from './MealSlotCard'
import { EmptySlotNotice, PlanWarnings, TargetMissingNotice } from './PlanWarnings'

interface DayPlanViewProps {
    /** Дата при открытии (`YYYY-MM-DD`); по умолчанию — сегодня. */
    initialDate?: string
}

/**
 * План питания на день: переключатель даты в пределах ±30 дней, итоги дня,
 * блюда по приёмам пищи и «Пересобрать».
 */
export function DayPlanView({ initialDate }: DayPlanViewProps) {
    // «Сегодня» фиксируется при открытии: экран, оставленный открытым за
    // полночь, не должен сам перепрыгнуть на другой день.
    const [today] = useState(todayString)
    const [date, setDate] = useState(initialDate ?? today)
    const [replacing, setReplacing] = useState<MealType | null>(null)
    const state = useMealPlan(date)
    const { plan, error, loading, pending } = state
    const busy = pending !== null

    const prev = addDays(date, -1)
    const next = addDays(date, 1)

    const handleChoose = async (recipeId: string) => {
        if (!replacing) return
        const ok = await state.replaceItem(replacing, recipeId)
        if (ok) setReplacing(null)
    }

    const missing = !plan ? targetMissingFrom(error) : null

    return (
        <section className="flex flex-col gap-4" aria-label={t('mealPlan.menu.tabPlan')}>
            <div className="flex items-center justify-between gap-2" role="group" aria-label={t('mealPlan.date.switcherAria')}>
                <IconButton
                    variant="ghost"
                    aria-label={t('mealPlan.date.previous')}
                    onClick={() => setDate(prev)}
                    disabled={busy || !isWithinWindow(prev, today)}
                >
                    <ChevronLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
                <div className="flex min-w-0 flex-col items-center">
                    <h2 className="type-title-3 text-center text-fg first-letter:uppercase" data-testid="plan-date">
                        {dayLabel(date, today)}
                    </h2>
                    {date !== today && (
                        <button
                            type="button"
                            onClick={() => setDate(today)}
                            disabled={busy}
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                        >
                            {t('mealPlan.date.backToToday')}
                        </button>
                    )}
                </div>
                <IconButton
                    variant="ghost"
                    aria-label={t('mealPlan.date.next')}
                    onClick={() => setDate(next)}
                    disabled={busy || !isWithinWindow(next, today)}
                >
                    <ChevronRight className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
            </div>

            {loading && !plan ? (
                <Spinner label={t('mealPlan.loading')} />
            ) : missing ? (
                <TargetMissingNotice missing={missing} />
            ) : error && !plan ? (
                <ErrorState variant="inline" title={t('mealPlan.loadFailed')} onRetry={state.reload} showHomeLink={false} />
            ) : plan ? (
                <>
                    <PlanWarnings
                        plan={plan}
                        onRegenerate={state.regenerate}
                        regenerating={pending === 'regenerate'}
                        disabled={busy}
                    />
                    <DayTotals
                        plan={plan}
                        onRefit={state.refit}
                        refitting={pending === 'refit'}
                        disabled={busy}
                    />
                    <ul className="flex flex-col gap-3" aria-busy={busy}>
                        {MEAL_TYPES.map((mealType) => {
                            const item = plan.items.find((candidate) => candidate.meal_type === mealType)
                            if (item) {
                                return (
                                    <li key={mealType}>
                                        <MealSlotCard
                                            // Новый вес, блюдо или отметка «съедено» с сервера —
                                            // новые черновики полей веса.
                                            key={`${item.recipe_id}:${item.grams}:${item.eaten ? 'eaten' : 'planned'}`}
                                            item={item}
                                            disabled={busy}
                                            busy={pending === mealType}
                                            onReplace={() => setReplacing(mealType)}
                                            onToggleLock={() => state.toggleLock(item)}
                                            onSetGrams={(grams) => state.setGrams(mealType, grams)}
                                            onResetGrams={() => state.resetGrams(mealType)}
                                            onEat={(grams) => state.eat(mealType, grams)}
                                        />
                                    </li>
                                )
                            }
                            if (plan.empty.some((slot) => slot.meal_type === mealType)) {
                                return (
                                    <li key={mealType}>
                                        <EmptySlotNotice mealType={mealType} />
                                    </li>
                                )
                            }
                            return null
                        })}
                    </ul>
                    <div className="flex flex-col items-center gap-1">
                        <Button
                            variant="secondary"
                            block
                            onClick={state.regenerate}
                            isLoading={pending === 'regenerate'}
                            disabled={busy}
                        >
                            <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            {t('mealPlan.regenerate')}
                        </Button>
                        <p className="text-xs text-fg-subtle">{t('mealPlan.regenerateHint')}</p>
                    </div>
                    <Link
                        href="/menu/shopping"
                        className={cn(buttonBase, buttonVariants.ghost, buttonSizes.md, 'w-full')}
                    >
                        <ShoppingBasket className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        {t('mealPlan.shopping.entry')}
                    </Link>
                </>
            ) : null}

            {replacing && plan && (
                <AlternativesSheet
                    date={date}
                    mealType={replacing}
                    target={plan.target}
                    choosing={busy}
                    onChoose={handleChoose}
                    onClose={() => setReplacing(null)}
                />
            )}
        </section>
    )
}
