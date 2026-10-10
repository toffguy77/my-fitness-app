'use client'

import { useCallback, useId, useState } from 'react'
import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { Button, buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { fieldClass, fieldLabelClass } from '@/shared/components/forms/fieldStyles'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import { adminRecipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import type { RecipeSummary } from '../types'
import { RecipeCard } from './RecipeCard'
import { VkusvillImport } from './VkusvillImport'

/** Значения фильтра `state` списка команды. */
export const ADMIN_STATE_FILTERS = ['draft', 'review', 'published', 'unpublished'] as const

/** Подпись состояния рецепта в списке: рабочая версия важнее публикации. */
export function summaryBadge(recipe: RecipeSummary): string {
    if (recipe.working_state) return t(`recipes.states.${recipe.working_state}`)
    return t(`recipes.states.${recipe.status}`)
}

/** Список рецептов команды с фильтром по состоянию, созданием и импортом. */
export function AdminRecipeList() {
    const id = useId()
    const [search, setSearch] = useState('')
    const [state, setState] = useState('')
    const [importOpen, setImportOpen] = useState(false)
    const query = useDebounce(search.trim(), 300)

    const load = useCallback(() => adminRecipesApi.list({ q: query, state, page: 1, page_size: 100 }), [query, state])
    const { data, error, loading, reload } = useResource(load)

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-screen-x py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="type-title-1 text-fg">{t('recipes.admin.title')}</h1>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setImportOpen((open) => !open)} aria-expanded={importOpen}>
                        <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        {t('recipes.admin.importVkusvill')}
                    </Button>
                    <Link href="/admin/recipes/new" className={cn(buttonBase, buttonVariants.primary, buttonSizes.md)}>
                        <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        {t('recipes.admin.newRecipe')}
                    </Link>
                </div>
            </div>

            {importOpen && <VkusvillImport onClose={() => setImportOpen(false)} />}

            <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
                <Input
                    id={`${id}-search`}
                    type="search"
                    label={t('recipes.admin.searchLabel')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div>
                    <label htmlFor={`${id}-state`} className={fieldLabelClass}>
                        {t('recipes.admin.stateLabel')}
                    </label>
                    <select
                        id={`${id}-state`}
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className={fieldClass}
                    >
                        <option value="">{t('recipes.admin.stateAll')}</option>
                        {ADMIN_STATE_FILTERS.map((value) => (
                            <option key={value} value={value}>
                                {t(`recipes.states.${value}`)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {loading && !data ? (
                <Spinner label={t('recipes.admin.loading')} />
            ) : error && !data ? (
                <ErrorState variant="inline" title={t('recipes.admin.loadFailed')} onRetry={reload} showHomeLink={false} />
            ) : !data || data.items.length === 0 ? (
                <p className="py-10 text-center text-fg-muted">{t('recipes.admin.empty')}</p>
            ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                    {data.items.map((recipe) => (
                        <li key={recipe.id}>
                            <RecipeCard recipe={recipe} href={`/admin/recipes/${recipe.id}`} badge={summaryBadge(recipe)} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
