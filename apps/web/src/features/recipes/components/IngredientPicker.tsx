'use client'

import { useCallback, useId, useState } from 'react'
import { Input } from '@/shared/components/ui/Input'
import { Button } from '@/shared/components/ui/Button'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { t } from '@/shared/i18n'
import { adminRecipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import type { CatalogueFood } from '../types'

const MIN_QUERY = 2

interface IngredientPickerProps {
    onPick: (food: CatalogueFood) => void
    onCancel: () => void
}

/**
 * Подбор продукта для ингредиента — только по общему каталогу.
 *
 * Поиск дневника сюда не годится: он подмешивает личные продукты того, кто
 * ищет, а личный продукт сотрудника не должен становиться ингредиентом
 * рецепта для всех. Поэтому отдельный маршрут команды без `user_foods`.
 */
export function IngredientPicker({ onPick, onCancel }: IngredientPickerProps) {
    const id = useId()
    const [search, setSearch] = useState('')
    const query = useDebounce(search.trim(), 300)

    const load = useCallback(
        () => adminRecipesApi.searchCatalogue(query),
        [query]
    )
    const { data, error, loading } = useResource(query.length >= MIN_QUERY ? load : null)
    const items = data?.items ?? []

    return (
        <div className="flex flex-col gap-2 rounded-tile border border-line bg-canvas p-3">
            <Input
                id={`${id}-search`}
                label={t('recipes.picker.label')}
                placeholder={t('recipes.picker.placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
            />
            {query.length >= MIN_QUERY && (
                <div aria-live="polite">
                    {loading ? (
                        <p className="py-2 text-sm text-fg-muted">{t('recipes.picker.searching')}</p>
                    ) : error ? (
                        <p className="py-2 text-sm text-danger-fg">{t('recipes.picker.failed')}</p>
                    ) : items.length === 0 ? (
                        <p className="py-2 text-sm text-fg-muted">{t('recipes.picker.nothing')}</p>
                    ) : (
                        <ul className="flex max-h-72 flex-col overflow-y-auto">
                            {items.map((food) => (
                                <li key={String(food.food_id)}>
                                    <button
                                        type="button"
                                        onClick={() => onPick(food)}
                                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-field px-3 py-2 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                    >
                                        <span className="text-fg">{food.name}</span>
                                        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                                            {t('recipes.picker.per100', { kcal: Math.round(food.kcal_100) })}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            <Button variant="ghost" size="sm" onClick={onCancel} className="self-end">
                {t('recipes.picker.cancel')}
            </Button>
        </div>
    )
}
