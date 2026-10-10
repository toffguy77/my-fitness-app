import { Info } from 'lucide-react'
import { t } from '@/shared/i18n'
import type { Ingredient, Nutrition, RecipeVersion } from '../types'
import { formatAmount } from '../utils/recipeInput'
import { RecipePhoto } from './RecipePhoto'

interface RecipeViewProps {
    version: RecipeVersion
}

function NutritionTable({ title, nutrition }: { title: string; nutrition: Nutrition }) {
    return (
        <div className="rounded-tile border border-line bg-surface p-4">
            <p className="type-overline text-fg-subtle">{title}</p>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-center tabular-nums">
                <div>
                    <dt className="text-xs text-fg-muted">{t('macros.calories')}</dt>
                    <dd className="type-num-l text-fg">{Math.round(nutrition.kcal)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-fg-muted">{t('macros.proteinShort')}</dt>
                    <dd className="type-num-l text-protein-fg">{formatAmount(nutrition.protein)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-fg-muted">{t('macros.fatShort')}</dt>
                    <dd className="type-num-l text-fat-fg">{formatAmount(nutrition.fat)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-fg-muted">{t('macros.carbsShort')}</dt>
                    <dd className="type-num-l text-carbs-fg">{formatAmount(nutrition.carbs)}</dd>
                </div>
            </dl>
        </div>
    )
}

/** Количество ингредиента: «по вкусу», человеческая подпись или граммы. */
export function ingredientQuantity(ingredient: Ingredient): string {
    if (ingredient.to_taste) return t('recipes.detail.toTaste')
    if (ingredient.display_quantity) return ingredient.display_quantity
    if (ingredient.grams != null) return t('recipes.nutrition.grams', { value: formatAmount(ingredient.grams) })
    return ''
}

/**
 * Рецепт целиком: фото, факты, КБЖУ на порцию и на 100 г, ингредиенты и шаги.
 *
 * Один и тот же вид у клиента в «Меню» и у куратора на проверке — куратор
 * одобряет ровно то, что увидит клиент.
 */
export function RecipeView({ version }: RecipeViewProps) {
    const ingredients = [...version.ingredients].sort((a, b) => a.position - b.position)
    const steps = [...version.steps].sort((a, b) => a.position - b.position)

    return (
        <article className="flex flex-col gap-6">
            <RecipePhoto url={version.photo_url} alt={version.name} className="aspect-[4/3] rounded-card" priority />

            <header className="flex flex-col gap-2">
                <h1 className="type-title-1 text-fg">{version.name}</h1>
                {version.meal_types.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                        {version.meal_types.map((mealType) => (
                            <li key={mealType} className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-fg-muted">
                                {t(`recipes.mealTypes.${mealType}`)}
                            </li>
                        ))}
                    </ul>
                )}
                {version.description && <p className="type-body text-fg-muted">{version.description}</p>}
            </header>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: t('recipes.detail.time'), value: t('recipes.card.minutes', { value: version.cook_minutes }) },
                    { label: t('recipes.detail.complexity'), value: t(`recipes.complexity.${version.complexity}`) },
                    { label: t('recipes.detail.servings'), value: String(version.servings) },
                    {
                        label: t('recipes.detail.portionWeight'),
                        value: t('recipes.nutrition.grams', { value: Math.round(version.portion_grams) }),
                    },
                ].map((fact) => (
                    <div key={fact.label} className="rounded-tile border border-line bg-surface px-3 py-2.5">
                        <dt className="text-xs text-fg-muted">{fact.label}</dt>
                        <dd className="type-headline tabular-nums text-fg">{fact.value}</dd>
                    </div>
                ))}
            </dl>

            <section className="flex flex-col gap-3" aria-label={t('recipes.nutrition.perPortion')}>
                {version.approximate && (
                    <p className="flex items-start gap-2 rounded-tile bg-warning-soft px-3 py-2.5 text-sm text-warning-fg" role="note">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                        <span>
                            <span className="font-semibold">{t('recipes.nutrition.approximate')}</span>
                            {'. '}
                            {t('recipes.nutrition.approximateHint')}
                        </span>
                    </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                    <NutritionTable title={t('recipes.nutrition.perPortion')} nutrition={version.per_portion} />
                    <NutritionTable title={t('recipes.nutrition.per100')} nutrition={version.per_100g} />
                </div>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="type-title-2 text-fg">{t('recipes.detail.ingredients')}</h2>
                <ul className="overflow-hidden rounded-card border border-line bg-surface">
                    {ingredients.map((ingredient, index) => (
                        <li
                            key={`${ingredient.position}-${index}`}
                            className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
                        >
                            <span className="text-fg">{ingredient.food_name ?? ingredient.source_name}</span>
                            <span className="shrink-0 text-sm tabular-nums text-fg-muted">{ingredientQuantity(ingredient)}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="type-title-2 text-fg">{t('recipes.detail.steps')}</h2>
                <ol className="flex flex-col gap-5">
                    {steps.map((step, index) => (
                        <li key={`${step.position}-${index}`} className="flex gap-3">
                            <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold tabular-nums text-fg"
                                aria-hidden="true"
                            >
                                {index + 1}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-3">
                                <p className="type-body whitespace-pre-line text-fg">{step.text}</p>
                                {step.photo_url && (
                                    <RecipePhoto
                                        url={step.photo_url}
                                        alt={t('recipes.detail.stepPhotoAlt', { number: index + 1 })}
                                        className="aspect-[4/3] rounded-tile"
                                    />
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            </section>
        </article>
    )
}
