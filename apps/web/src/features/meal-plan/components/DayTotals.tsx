import { color as role } from '@burcev/design-tokens'
import { ProgressBar } from '@/shared/components/ui/ProgressBar'
import { MACRO_COLORS, MACRO_KEYS, MACRO_TEXT_COLORS, type MacroKey } from '@/shared/constants/macros'
import { t } from '@/shared/i18n'
import type { MealPlan } from '../types'

const LABELS: Record<MacroKey, () => string> = {
    protein: () => t('macros.protein'),
    fat: () => t('macros.fat'),
    carbs: () => t('macros.carbs'),
}

const SHORT: Record<MacroKey, () => string> = {
    protein: () => t('macros.proteinShort'),
    fat: () => t('macros.fatShort'),
    carbs: () => t('macros.carbsShort'),
}

/** «осталось 18 г» или «больше цели на 5 г»: остаток уходит в минус только словами. */
function remainingText(remaining: number): string {
    const value = Math.round(Math.abs(remaining))
    return remaining < 0 ? t('mealPlan.totals.over', { value }) : t('mealPlan.totals.left', { value })
}

/**
 * Итоги дня: калории и Б/Ж/У в граммах, процент от цели, остаток и раскладка
 * калорий по Б/Ж/У.
 *
 * Цвет нутриента опознаёт его и не меняется от выполнения цели (openspec
 * macro-colour-system); перебор сказан словами. У калорий цвета нутриента нет —
 * полоса в основном цвете, как дуга на главной.
 */
export function DayTotals({ plan }: { plan: MealPlan }) {
    const kcal = Math.round(plan.totals.kcal)
    const targetKcal = Math.round(plan.target.kcal)
    const kcalLeft = Math.round(plan.remaining.kcal)
    const split = plan.calorie_split

    return (
        <section aria-labelledby="plan-totals-title" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
            <h2 id="plan-totals-title" className="type-title-3 text-fg">
                {t('mealPlan.totals.title')}
            </h2>

            <div className="flex flex-col gap-2" data-testid="plan-totals-kcal">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="type-num-l text-fg tabular-nums">
                        {t('mealPlan.totals.kcalOfTarget', { value: kcal, target: targetKcal })}
                    </span>
                    <span className="text-sm text-fg-muted tabular-nums">
                        {t('mealPlan.totals.percent', { value: plan.percent_of_target.kcal })}
                    </span>
                </div>
                <ProgressBar
                    value={kcal}
                    max={targetKcal}
                    color={role.primary}
                    thickness={6}
                    label={t('mealPlan.totals.kcalAria', { value: kcal, target: targetKcal, percent: plan.percent_of_target.kcal })}
                />
                <span className={kcalLeft < 0 ? 'text-sm font-medium text-warning-fg' : 'text-sm text-fg-subtle'}>
                    {kcalLeft < 0
                        ? t('mealPlan.totals.kcalOver', { value: -kcalLeft })
                        : t('mealPlan.totals.kcalLeft', { value: kcalLeft })}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {MACRO_KEYS.map((key) => {
                    const grams = Math.round(plan.totals[key])
                    const target = Math.round(plan.target[key])
                    const remaining = plan.remaining[key]
                    return (
                        <div
                            key={key}
                            data-testid={`plan-totals-${key}`}
                            className="flex min-w-0 flex-col gap-1 rounded-tile border border-line px-3 py-2.5"
                        >
                            <span className="text-[13px] font-semibold leading-[18px]" style={{ color: MACRO_TEXT_COLORS[key] }}>
                                {LABELS[key]()}
                            </span>
                            <span className="flex items-baseline gap-1">
                                <span className="text-xl font-semibold leading-6 text-fg tabular-nums">{grams}</span>
                                <span className="text-sm font-medium text-fg">{t('units.gram')}</span>
                            </span>
                            <ProgressBar
                                value={grams}
                                max={target}
                                color={MACRO_COLORS[key]}
                                thickness={3}
                                label={t('mealPlan.totals.macroAria', {
                                    label: LABELS[key](),
                                    value: grams,
                                    goal: target,
                                    percent: plan.percent_of_target[key],
                                })}
                            />
                            <span className="text-xs text-fg-muted tabular-nums">
                                {t('mealPlan.totals.percent', { value: plan.percent_of_target[key] })}
                            </span>
                            <span className={remaining < 0 ? 'text-xs font-medium text-warning-fg' : 'text-xs text-fg-subtle'}>
                                {remainingText(remaining)}
                            </span>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-fg-muted">{t('mealPlan.totals.splitTitle')}</span>
                <div
                    role="img"
                    aria-label={t('mealPlan.totals.splitAria', { protein: split.protein, fat: split.fat, carbs: split.carbs })}
                    className="flex h-2 w-full overflow-hidden rounded-full bg-track"
                    data-testid="plan-calorie-split"
                >
                    {MACRO_KEYS.map((key) => (
                        <span key={key} className="h-full" style={{ width: `${split[key]}%`, backgroundColor: MACRO_COLORS[key] }} />
                    ))}
                </div>
                <p className="flex gap-3 text-sm tabular-nums" aria-hidden="true">
                    {MACRO_KEYS.map((key) => (
                        <span key={key} className="font-medium" style={{ color: MACRO_TEXT_COLORS[key] }}>
                            {t('mealPlan.totals.splitItem', { label: SHORT[key](), value: split[key] })}
                        </span>
                    ))}
                </p>
            </div>
        </section>
    )
}
