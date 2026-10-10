'use client'

import { useCallback } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { t } from '@/shared/i18n'
import { curatorRecipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import { RecipeCard } from './RecipeCard'

/** Очередь куратора: рецепты, рабочая версия которых ждёт проверки. */
export function ReviewQueue() {
    const load = useCallback(() => curatorRecipesApi.reviewQueue(1), [])
    const { data, error, loading, reload } = useResource(load)

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-screen-x py-5">
            <h1 className="type-title-1 text-fg">{t('recipes.review.title')}</h1>

            {loading && !data ? (
                <Spinner label={t('recipes.review.loading')} />
            ) : error && !data ? (
                <ErrorState variant="inline" title={t('recipes.review.loadFailed')} onRetry={reload} showHomeLink={false} />
            ) : !data || data.items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
                    <ClipboardCheck className="h-7 w-7 text-fg-muted" strokeWidth={1.6} aria-hidden="true" />
                    <p className="text-fg-muted">{t('recipes.review.empty')}</p>
                </div>
            ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                    {data.items.map((recipe) => (
                        <li key={recipe.id}>
                            <RecipeCard
                                recipe={recipe}
                                href={`/curator/recipes/${recipe.id}`}
                                badge={t('recipes.states.review')}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
