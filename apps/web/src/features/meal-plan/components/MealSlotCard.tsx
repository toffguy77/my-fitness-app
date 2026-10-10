'use client'

import { useId, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Lock, LockOpen, Repeat } from 'lucide-react'
import { NutritionLine } from '@/features/recipes/components/NutritionLine'
import { RecipePhoto } from '@/features/recipes/components/RecipePhoto'
import { Button } from '@/shared/components/ui/Button'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import type { PlanItem } from '../types'

/** Поле правки числа в карточке: 44 px, текст 16 px — iOS не увеличивает страницу. */
const GRAMS_FIELD =
    'h-11 w-24 rounded-field border border-line bg-surface px-3 text-base tabular-nums text-fg ' +
    'focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 disabled:opacity-50'

export const MAX_GRAMS = 2000

interface MealSlotCardProps {
    item: PlanItem
    /** Пока правка дня в пути, все действия карточки выключены. */
    disabled: boolean
    /** Эта карточка ждёт ответа сервера. */
    busy: boolean
    onReplace: () => void
    onToggleLock: () => void
    onSetGrams: (grams: number) => void
    onResetGrams: () => void
}

/**
 * Блюдо приёма пищи: фото, название со ссылкой на рецепт, вес, КБЖУ,
 * «Заменить» и «Закрепить».
 *
 * Поле веса держит черновик, пока его не применили: каждое применение
 * пересобирает весь день, так что запрос на каждую цифру был бы лишним. Родитель
 * пересоздаёт карточку по весу из ответа (`key`), и черновик сбрасывается сам.
 */
export function MealSlotCard({ item, disabled, busy, onReplace, onToggleLock, onSetGrams, onResetGrams }: MealSlotCardProps) {
    const fieldId = useId()
    const errorId = useId()
    const [draft, setDraft] = useState(String(item.grams))
    const mealLabel = t(`recipes.mealTypes.${item.meal_type}`)
    const parsed = Number(draft)
    const valid = draft.trim() !== '' && Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_GRAMS
    const changed = valid && parsed !== item.grams

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        if (changed && !disabled) onSetGrams(parsed)
    }

    return (
        <article
            aria-label={mealLabel}
            aria-busy={busy}
            data-testid={`plan-item-${item.meal_type}`}
            className={cn('flex flex-col gap-3 rounded-card border bg-surface p-4', item.locked ? 'border-line-strong' : 'border-line')}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{mealLabel}</span>
                {item.locked && (
                    <span className="flex items-center gap-1 text-xs font-medium text-fg-muted">
                        <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        {t('mealPlan.slot.locked')}
                    </span>
                )}
            </div>

            <div className="flex gap-3">
                <RecipePhoto url={item.photo_url} alt={item.name} className="aspect-square w-20 shrink-0 rounded-tile" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                        href={`/menu/recipes/${item.recipe_id}`}
                        className="line-clamp-2 type-headline text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        {item.name}
                    </Link>
                    {item.unavailable && (
                        <span className="self-start rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-fg">
                            {t('mealPlan.slot.unavailable')}
                        </span>
                    )}
                    <p className="text-xs text-fg-muted tabular-nums">
                        {t('recipes.nutrition.grams', { value: item.grams })}
                        <span aria-hidden="true"> · </span>
                        {t('mealPlan.slot.portion', { value: Math.round(item.portion_grams) })}
                    </p>
                    <NutritionLine nutrition={item.nutrition} className="text-xs" />
                    <p className="text-xs text-fg-subtle tabular-nums">
                        {t('mealPlan.slot.percentOfDay', { value: item.percent_of_target.kcal })}
                    </p>
                </div>
            </div>

            {/* Проверку веса форма делает сама: браузерная по `step` отвергла бы
                любой вес не из ряда 1, 11, 21… — а вручную задают и 250 г. */}
            <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                    <label htmlFor={fieldId} className="text-xs font-medium text-fg-muted">
                        {t('mealPlan.slot.grams')}
                    </label>
                    <input
                        id={fieldId}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_GRAMS}
                        step={10}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={disabled}
                        aria-label={t('mealPlan.slot.gramsAria', { name: item.name })}
                        aria-invalid={!valid}
                        aria-describedby={valid ? undefined : errorId}
                        className={GRAMS_FIELD}
                    />
                </div>
                {changed && (
                    <Button type="submit" variant="secondary" size="sm" disabled={disabled} isLoading={busy} className="h-11">
                        {t('mealPlan.slot.gramsApply')}
                    </Button>
                )}
                {!valid && (
                    <p id={errorId} role="alert" className="basis-full text-sm text-danger-fg">
                        {t('mealPlan.slot.gramsInvalid')}
                    </p>
                )}
            </form>

            {item.manual_grams && (
                <div className="flex flex-wrap items-center gap-x-3 text-sm">
                    <span className="text-fg-muted">{t('mealPlan.slot.manual')}</span>
                    <button
                        type="button"
                        onClick={onResetGrams}
                        disabled={disabled}
                        className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                        {t('mealPlan.slot.resetGrams')}
                    </button>
                </div>
            )}

            <div className="flex gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onReplace}
                    disabled={disabled}
                    aria-label={t('mealPlan.slot.replaceAria', { name: item.name })}
                    className="flex-1"
                >
                    <Repeat className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    {t('mealPlan.slot.replace')}
                </Button>
                <Button
                    variant={item.locked ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={onToggleLock}
                    disabled={disabled}
                    aria-pressed={item.locked}
                    aria-label={t(item.locked ? 'mealPlan.slot.unlockAria' : 'mealPlan.slot.lockAria', { name: item.name })}
                    className="flex-1"
                >
                    {item.locked ? (
                        <Lock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    ) : (
                        <LockOpen className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    )}
                    {item.locked ? t('mealPlan.slot.locked') : t('mealPlan.slot.lock')}
                </Button>
            </div>
        </article>
    )
}
