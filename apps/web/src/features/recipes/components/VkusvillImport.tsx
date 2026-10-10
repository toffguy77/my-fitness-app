'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { isApiError } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { adminRecipesApi } from '../api/recipesApi'
import type { VkusvillRecipe } from '../types'
import { RecipePhoto } from './RecipePhoto'

interface VkusvillImportProps {
    onClose: () => void
}

interface Results {
    query: string
    page: number
    items: VkusvillRecipe[]
    hasMore: boolean
}

/**
 * 502 — ВкусВилл не ответил (код у него `internal`, поэтому по статусу);
 * 503 — импорт выключен на этом стенде. Оба — не вина человека, и сказать
 * надо иначе, чем «не удалось».
 */
function failureText(err: unknown, fallback: string): string {
    if (isApiError(err) && err.status === 502) return t('recipes.vkusvill.unavailable')
    if (isApiError(err) && err.status === 503) return t('recipes.vkusvill.disabled')
    return fallback
}

/**
 * Импорт рецепта ВкусВилла в черновик.
 *
 * Импорт — инструмент команды, а не источник для клиента: из него получается
 * черновик, ингредиенты которого человек сопоставляет с каталогом сам.
 */
export function VkusvillImport({ onClose }: VkusvillImportProps) {
    const id = useId()
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<Results | null>(null)
    const [searching, setSearching] = useState(false)
    const [importing, setImporting] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const runSearch = async (query: string, page: number) => {
        setSearching(true)
        setError(null)
        try {
            const found = await adminRecipesApi.searchVkusvill(query, page)
            setResults((previous) => ({
                query,
                page,
                items: page > 1 && previous ? [...previous.items, ...found.items] : found.items,
                hasMore: found.has_more,
            }))
        } catch (err) {
            // Поиск идёт только во ВкусВилл: прочий отказ здесь — тоже он.
            setError(failureText(err, t('recipes.vkusvill.unavailable')))
        } finally {
            setSearching(false)
        }
    }

    const handleSearch = (event: React.FormEvent) => {
        event.preventDefault()
        const query = search.trim()
        if (query) runSearch(query, 1)
    }

    const handleImport = async (recipe: VkusvillRecipe) => {
        if (recipe.imported_recipe_id) {
            router.push(`/admin/recipes/${recipe.imported_recipe_id}`)
            return
        }
        setImporting(recipe.source_ref)
        setError(null)
        try {
            const result = await adminRecipesApi.importVkusvill(recipe.source_ref, recipe.name)
            router.push(`/admin/recipes/${result.recipe_id}`)
        } catch (err) {
            setError(failureText(err, t('recipes.vkusvill.importFailed')))
            setImporting(null)
        }
    }

    return (
        <section
            aria-labelledby={`${id}-title`}
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
        >
            <div className="flex items-center justify-between gap-2">
                <h2 id={`${id}-title`} className="type-title-3 text-fg">
                    {t('recipes.vkusvill.title')}
                </h2>
                <IconButton variant="ghost" aria-label={t('recipes.vkusvill.close')} onClick={onClose}>
                    <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
            </div>

            <form onSubmit={handleSearch} className="flex items-end gap-2">
                <Input
                    id={`${id}-search`}
                    label={t('recipes.vkusvill.searchLabel')}
                    placeholder={t('recipes.vkusvill.searchPlaceholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <Button type="submit" variant="secondary" size="lg" isLoading={searching && !results}>
                    {t('recipes.vkusvill.search')}
                </Button>
            </form>

            {error && (
                <p role="alert" className="text-sm text-danger-fg">
                    {error}
                </p>
            )}

            {searching && !results && <p className="text-sm text-fg-muted">{t('recipes.vkusvill.searching')}</p>}

            {results && results.items.length === 0 && (
                <p className="text-sm text-fg-muted">{t('recipes.vkusvill.nothing')}</p>
            )}

            {results && results.items.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {results.items.map((recipe) => (
                        <li key={recipe.source_ref} className="flex items-center gap-3 rounded-tile border border-line p-2">
                            <RecipePhoto url={recipe.photo_url} alt={recipe.name} className="aspect-square w-16 shrink-0 rounded-field" />
                            <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm font-medium text-fg">{recipe.name}</p>
                                <p className="text-xs text-fg-muted">
                                    {recipe.portions != null && t('recipes.vkusvill.portions', { value: recipe.portions })}
                                    {recipe.imported_recipe_id && (
                                        <span className="ml-2 text-fg-subtle">{t('recipes.vkusvill.alreadyImported')}</span>
                                    )}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant={recipe.imported_recipe_id ? 'ghost' : 'secondary'}
                                onClick={() => handleImport(recipe)}
                                isLoading={importing === recipe.source_ref}
                                disabled={importing !== null}
                                aria-label={`${recipe.imported_recipe_id ? t('recipes.vkusvill.open') : t('recipes.vkusvill.import')}: ${recipe.name}`}
                            >
                                {recipe.imported_recipe_id ? t('recipes.vkusvill.open') : t('recipes.vkusvill.import')}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            {results?.hasMore && (
                <Button
                    variant="ghost"
                    onClick={() => runSearch(results.query, results.page + 1)}
                    isLoading={searching}
                    className="self-center"
                >
                    {t('recipes.vkusvill.more')}
                </Button>
            )}
        </section>
    )
}
