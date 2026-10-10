'use client'

import { useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { recipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import { FoodRestrictionsForm } from './FoodRestrictionsForm'

/** «Ограничения в питании» в настройках клиента, со скрытыми им блюдами. */
export function ClientFoodRestrictions() {
    const load = useCallback(() => recipesApi.getRestrictions(), [])
    const { data, error, loading, reload, replace } = useResource(load)
    const [restoring, setRestoring] = useState<string | null>(null)

    const handleRestore = async (recipeId: string) => {
        if (!data) return
        setRestoring(recipeId)
        try {
            await recipesApi.unreject(recipeId)
            replace({ ...data, rejected_recipes: data.rejected_recipes.filter((recipe) => recipe.id !== recipeId) })
            toast.success(t('recipes.restrictions.restored'))
        } catch (err) {
            toast.error(messageForOr(err, t('recipes.restrictions.restoreFailed')))
        } finally {
            setRestoring(null)
        }
    }

    if (loading && !data) return <Spinner label={t('recipes.restrictions.loading')} />
    if (error || !data) {
        return (
            <ErrorState variant="inline" title={t('recipes.restrictions.loadFailed')} onRetry={reload} showHomeLink={false} />
        )
    }

    return (
        <div className="flex flex-col gap-8">
            <FoodRestrictionsForm initial={data} save={recipesApi.saveRestrictions} />

            <section className="flex flex-col gap-3" aria-labelledby="rejected-recipes-title">
                <h3 id="rejected-recipes-title" className="type-title-3 text-fg">
                    {t('recipes.restrictions.rejectedTitle')}
                </h3>
                {data.rejected_recipes.length === 0 ? (
                    <p className="text-sm text-fg-subtle">{t('recipes.restrictions.rejectedEmpty')}</p>
                ) : (
                    <ul className="overflow-hidden rounded-card border border-line bg-surface">
                        {data.rejected_recipes.map((recipe) => (
                            <li
                                key={recipe.id}
                                className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-b-0"
                            >
                                <span className="text-fg">{recipe.name}</span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleRestore(recipe.id)}
                                    isLoading={restoring === recipe.id}
                                    disabled={restoring !== null}
                                    aria-label={`${t('recipes.restrictions.restore')}: ${recipe.name}`}
                                >
                                    {t('recipes.restrictions.restore')}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}
