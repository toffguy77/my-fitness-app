import { AlertTriangle, ChefHat, RefreshCw } from 'lucide-react'
import { CalculateTargetPrompt, type MissingTargetInputs } from '@/features/nutrition-calc'
import { Button } from '@/shared/components/ui/Button'
import { t } from '@/shared/i18n'
import type { MealPlan, MealType } from '../types'
import { deviationText } from '../utils/planText'

interface PlanWarningsProps {
    plan: MealPlan
    onRegenerate: () => void
    regenerating: boolean
    disabled?: boolean
}

/**
 * Что в плане не так: цель сменилась после сборки, в цель не попали, блюдо
 * стало недоступно. Недобор называется числом и нутриентом, а не «план
 * неточный»: человеку нужно знать, чего докупить или доесть.
 */
export function PlanWarnings({ plan, onRegenerate, regenerating, disabled }: PlanWarningsProps) {
    const hasUnavailable = plan.items.some((item) => item.unavailable)
    if (!plan.target_changed && plan.deviations.length === 0 && !hasUnavailable) return null

    return (
        <div className="flex flex-col gap-3">
            {plan.target_changed && (
                <div role="status" className="flex flex-col gap-3 rounded-tile bg-warning-soft p-4" data-testid="plan-target-changed">
                    <div className="flex items-start gap-3">
                        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-warning-fg" strokeWidth={1.8} aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="type-headline text-fg">{t('mealPlan.warnings.targetChanged')}</p>
                            <p className="mt-1 text-sm text-fg-muted">{t('mealPlan.warnings.targetChangedHint')}</p>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onRegenerate}
                        isLoading={regenerating}
                        disabled={disabled}
                        className="self-start"
                    >
                        {t('mealPlan.regenerate')}
                    </Button>
                </div>
            )}

            {plan.deviations.length > 0 && (
                <div className="flex items-start gap-3 rounded-tile bg-subtle p-4" data-testid="plan-deviations">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-fg" strokeWidth={1.8} aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="type-headline text-fg">{t('mealPlan.warnings.title')}</p>
                        <ul className="mt-1 flex flex-col gap-0.5 text-sm text-fg">
                            {plan.deviations.map((deviation) => (
                                <li key={deviation.nutrient}>{deviationText(deviation)}</li>
                            ))}
                        </ul>
                        <p className="mt-2 text-sm text-fg-muted">{t('mealPlan.warnings.hint')}</p>
                    </div>
                </div>
            )}

            {hasUnavailable && (
                <p className="rounded-tile bg-subtle p-4 text-sm text-fg" data-testid="plan-unavailable">
                    {t('mealPlan.warnings.unavailable')}
                </p>
            )}
        </div>
    )
}

/** Приём пищи без блюда: доступных клиенту рецептов для него нет. */
export function EmptySlotNotice({ mealType }: { mealType: MealType }) {
    return (
        <article
            aria-label={t(`recipes.mealTypes.${mealType}`)}
            className="flex items-start gap-3 rounded-card border border-dashed border-line bg-surface p-4"
            data-testid={`plan-empty-${mealType}`}
        >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted">
                <ChefHat className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{t(`recipes.mealTypes.${mealType}`)}</p>
                <p className="type-headline text-fg">{t('mealPlan.warnings.noRecipes')}</p>
                <p className="mt-1 text-sm text-fg-muted">{t('mealPlan.warnings.noRecipesHint')}</p>
            </div>
        </article>
    )
}

/** `409 target_missing`: без нормы план не строится — ведём туда, где её посчитать. */
export function TargetMissingNotice({ missing }: { missing: MissingTargetInputs }) {
    return <CalculateTargetPrompt missing={missing} />
}
