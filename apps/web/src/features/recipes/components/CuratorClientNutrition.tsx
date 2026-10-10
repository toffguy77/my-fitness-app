'use client'

import { useCallback, useId, useState } from 'react'
import { useDebounce } from '@/shared/hooks/useDebounce'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { curatorRecipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import type { FoodRestrictionsInput } from '../types'
import { FoodRestrictionsForm } from './FoodRestrictionsForm'

interface CuratorClientNutritionProps {
    clientId: number
}

/** Вкладка «Питание» в карточке клиента: ограничения и скрытые рецепты. */
export function CuratorClientNutrition({ clientId }: CuratorClientNutritionProps) {
    const id = useId()
    const loadRestrictions = useCallback(() => curatorRecipesApi.getClientRestrictions(clientId), [clientId])
    const loadHidden = useCallback(() => curatorRecipesApi.hiddenRecipes(clientId), [clientId])
    const restrictions = useResource(loadRestrictions)
    const hidden = useResource(loadHidden)
    const [search, setSearch] = useState('')
    const query = useDebounce(search.trim(), 300)
    const loadPublished = useCallback(() => curatorRecipesApi.listPublished(query), [query])
    // Список куратора — только опубликованные с одобренной версией: скрывать
    // имеет смысл то, что клиент вообще может увидеть.
    const published = useResource(query.length >= 2 ? loadPublished : null)
    const [busy, setBusy] = useState<string | null>(null)

    const save = (input: FoodRestrictionsInput) => curatorRecipesApi.saveClientRestrictions(clientId, input)

    const handleUnhide = async (recipeId: string) => {
        setBusy(recipeId)
        try {
            await curatorRecipesApi.unhideRecipe(clientId, recipeId)
            toast.success(t('recipes.curatorClient.unhidden'))
            hidden.reload()
        } catch (err) {
            toast.error(messageForOr(err, t('recipes.curatorClient.actionFailed')))
        } finally {
            setBusy(null)
        }
    }

    const handleHide = async (recipeId: string) => {
        setBusy(recipeId)
        try {
            await curatorRecipesApi.hideRecipe(clientId, recipeId)
            toast.success(t('recipes.curatorClient.hidden'))
            hidden.reload()
        } catch (err) {
            toast.error(messageForOr(err, t('recipes.curatorClient.actionFailed')))
        } finally {
            setBusy(null)
        }
    }

    const hiddenIds = new Set(hidden.data?.items.map((recipe) => recipe.id) ?? [])
    const candidates = (published.data?.items ?? []).filter((recipe) => !hiddenIds.has(recipe.id))

    return (
        <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-4" aria-labelledby={`${id}-restrictions`}>
                <h2 id={`${id}-restrictions`} className="type-title-2 text-fg">
                    {t('recipes.curatorClient.restrictionsTitle')}
                </h2>
                {restrictions.loading && !restrictions.data ? (
                    <Spinner label={t('recipes.restrictions.loading')} />
                ) : restrictions.error || !restrictions.data ? (
                    <ErrorState
                        variant="inline"
                        title={t('recipes.restrictions.loadFailed')}
                        onRetry={restrictions.reload}
                        showHomeLink={false}
                    />
                ) : (
                    <FoodRestrictionsForm initial={restrictions.data} save={save} />
                )}
            </section>

            <section className="flex flex-col gap-3" aria-labelledby={`${id}-hidden`}>
                <h2 id={`${id}-hidden`} className="type-title-2 text-fg">
                    {t('recipes.curatorClient.hiddenTitle')}
                </h2>
                {hidden.loading && !hidden.data ? (
                    <Spinner label={t('common.loading')} />
                ) : hidden.error || !hidden.data ? (
                    <ErrorState
                        variant="inline"
                        title={t('recipes.curatorClient.hiddenLoadFailed')}
                        onRetry={hidden.reload}
                        showHomeLink={false}
                    />
                ) : hidden.data.items.length === 0 ? (
                    <p className="text-sm text-fg-subtle">{t('recipes.curatorClient.hiddenEmpty')}</p>
                ) : (
                    <ul className="overflow-hidden rounded-card border border-line bg-surface">
                        {hidden.data.items.map((recipe) => (
                            <li
                                key={recipe.id}
                                className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-b-0"
                            >
                                <span className="text-fg">{recipe.name}</span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleUnhide(recipe.id)}
                                    isLoading={busy === recipe.id}
                                    disabled={busy !== null}
                                    aria-label={`${t('recipes.curatorClient.unhide')}: ${recipe.name}`}
                                >
                                    {t('recipes.curatorClient.unhide')}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex flex-col gap-2">
                    <Input
                        id={`${id}-hide`}
                        type="search"
                        label={t('recipes.curatorClient.hideLabel')}
                        placeholder={t('recipes.curatorClient.hidePlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {query.length >= 2 && (
                        <div aria-live="polite">
                            {published.loading && !published.data ? (
                                <p className="text-sm text-fg-muted">{t('recipes.curatorClient.searching')}</p>
                            ) : published.error ? (
                                <p className="text-sm text-danger-fg">{t('recipes.curatorClient.searchFailed')}</p>
                            ) : candidates.length === 0 ? (
                                <p className="text-sm text-fg-muted">{t('recipes.curatorClient.nothing')}</p>
                            ) : (
                                <ul className="overflow-hidden rounded-card border border-line bg-surface">
                                    {candidates.map((recipe) => (
                                        <li
                                            key={recipe.id}
                                            className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-b-0"
                                        >
                                            <span className="text-fg">{recipe.name}</span>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleHide(recipe.id)}
                                                isLoading={busy === recipe.id}
                                                disabled={busy !== null}
                                                aria-label={`${t('recipes.curatorClient.hide')}: ${recipe.name}`}
                                            >
                                                {t('recipes.curatorClient.hide')}
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}
