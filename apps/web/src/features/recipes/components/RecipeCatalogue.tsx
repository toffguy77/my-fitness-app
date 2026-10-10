'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChefHat, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { EVENTS, track } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { recipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import type { MealType, RecipeSummary } from '../types'
import { MealTypeFilter } from './MealTypeFilter'
import { RecipeCard } from './RecipeCard'

export const CATALOGUE_PAGE_SIZE = 20

/**
 * «Меню» клиента: одобренные куратором и доступные ему рецепты.
 *
 * Доступность решает сервер (аллергены, исключения, скрытые и отклонённые);
 * здесь только поиск по названию и фильтр по приёму пищи.
 */
export function RecipeCatalogue() {
    const [search, setSearch] = useState('')
    const [mealType, setMealType] = useState<MealType | null>(null)
    const query = useDebounce(search.trim(), 300)
    const [more, setMore] = useState<{ key: string; page: number; items: RecipeSummary[] } | null>(null)
    const [loadingMore, setLoadingMore] = useState(false)

    useEffect(() => {
        track(EVENTS.menuOpened)
    }, [])

    const key = `${query}|${mealType ?? ''}`
    const loadFirst = useCallback(
        () => recipesApi.list({ q: query, meal_type: mealType ?? '', page: 1, page_size: CATALOGUE_PAGE_SIZE }),
        [query, mealType]
    )
    const { data, error, loading, reload } = useResource(loadFirst)

    const extra = more?.key === key ? more : null
    const items = [...(data?.items ?? []), ...(extra?.items ?? [])]
    const total = data?.total ?? 0
    const filtered = query !== '' || mealType !== null

    const handleShowMore = async () => {
        const page = (extra?.page ?? 1) + 1
        setLoadingMore(true)
        try {
            const next = await recipesApi.list({
                q: query,
                meal_type: mealType ?? '',
                page,
                page_size: CATALOGUE_PAGE_SIZE,
            })
            setMore({ key, page, items: [...(extra?.items ?? []), ...next.items] })
        } catch {
            // Кнопка остаётся на месте: повторное нажатие и есть повтор.
        } finally {
            setLoadingMore(false)
        }
    }

    return (
        <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-screen-x py-5">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-1 text-fg">{t('recipes.menu.title')}</h1>
                <p className="text-sm text-fg-muted">{t('recipes.menu.subtitle')}</p>
            </header>

            <div className="relative">
                <Search
                    className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-fg-subtle"
                    strokeWidth={1.8}
                    aria-hidden="true"
                />
                <Input
                    id="recipe-search"
                    type="search"
                    aria-label={t('recipes.menu.searchLabel')}
                    placeholder={t('recipes.menu.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-11"
                />
            </div>

            <MealTypeFilter selected={mealType} onSelect={setMealType} />

            {loading && !data ? (
                <Spinner label={t('recipes.menu.loading')} />
            ) : error && !data ? (
                <ErrorState
                    variant="inline"
                    title={t('recipes.menu.loadFailed')}
                    onRetry={reload}
                    showHomeLink={false}
                />
            ) : items.length === 0 ? (
                filtered ? (
                    <p className="py-10 text-center text-fg-muted">{t('recipes.menu.nothingFound')}</p>
                ) : (
                    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-subtle text-fg-muted">
                            <ChefHat className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
                        </span>
                        <h2 className="type-title-3 text-fg">{t('recipes.menu.emptyTitle')}</h2>
                        <p className="max-w-sm text-sm text-fg-muted">{t('recipes.menu.emptyText')}</p>
                    </div>
                )
            ) : (
                <>
                    <ul className="flex flex-col gap-3" aria-busy={loading}>
                        {items.map((recipe) => (
                            <li key={recipe.id}>
                                <RecipeCard recipe={recipe} href={`/menu/recipes/${recipe.id}`} />
                            </li>
                        ))}
                    </ul>
                    {items.length < total && (
                        <Button variant="secondary" block onClick={handleShowMore} isLoading={loadingMore}>
                            {t('recipes.menu.more')}
                        </Button>
                    )}
                </>
            )}
        </div>
    )
}
