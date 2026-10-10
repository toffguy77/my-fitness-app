import Link from 'next/link'
import { Clock } from 'lucide-react'
import { t } from '@/shared/i18n'
import type { RecipeSummary } from '../types'
import { NutritionLine } from './NutritionLine'
import { RecipePhoto } from './RecipePhoto'

interface RecipeCardProps {
    recipe: RecipeSummary
    href: string
    /** Подпись состояния для команды и куратора; клиенту не передаётся. */
    badge?: string
}

/** Карточка рецепта в списке: фото, название, время, КБЖУ и вес порции. */
export function RecipeCard({ recipe, href, badge }: RecipeCardProps) {
    return (
        <Link
            href={href}
            className="flex overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
            <RecipePhoto url={recipe.photo_url} alt={recipe.name} className="aspect-square w-28 shrink-0 sm:w-36" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
                {badge && (
                    <span className="self-start rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-fg-muted">{badge}</span>
                )}
                <h3 className="line-clamp-2 type-headline text-fg">{recipe.name}</h3>
                <p className="flex items-center gap-1 text-xs text-fg-muted tabular-nums">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {t('recipes.card.minutes', { value: recipe.cook_minutes })}
                    <span aria-hidden="true">·</span>
                    {t('recipes.card.portion', { value: Math.round(recipe.portion_grams) })}
                </p>
                <NutritionLine nutrition={recipe.per_portion} className="text-xs" />
                {recipe.approximate && (
                    <span className="self-start text-xs text-fg-subtle">{t('recipes.nutrition.approximate')}</span>
                )}
            </div>
        </Link>
    )
}
