'use client'

import { useId, useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Checkbox } from '@/shared/components/ui/Checkbox'
import { Input } from '@/shared/components/ui/Input'
import { messageForOr } from '@/shared/errors/apiErrors'
import { useFoodSearch } from '@/features/food-tracker/hooks/useFoodSearch'
import { t } from '@/shared/i18n'
import { ALLERGENS, type Allergen, type FoodRestrictions, type FoodRestrictionsInput } from '../types'

interface FoodRestrictionsFormProps {
    initial: FoodRestrictions
    save: (input: FoodRestrictionsInput) => Promise<FoodRestrictions>
    onSaved?: (saved: FoodRestrictions) => void
}

/**
 * Аллергены и продукты-исключения.
 *
 * Один и тот же вид у клиента в настройках и у куратора в карточке клиента.
 * Продукт ищется тем же поиском, что в дневнике, и отправляется с тем
 * идентификатором, который поиск отдал.
 */
export function FoodRestrictionsForm({ initial, save, onSaved }: FoodRestrictionsFormProps) {
    const id = useId()
    const [allergens, setAllergens] = useState<Allergen[]>(initial.allergens)
    const [excluded, setExcluded] = useState(initial.excluded_foods)
    const [saving, setSaving] = useState(false)
    const search = useFoodSearch({ autoLoadRecent: false, minQueryLength: 2 })

    const toggleAllergen = (value: Allergen) =>
        setAllergens((current) => (current.includes(value) ? current.filter((a) => a !== value) : [...current, value]))

    const addExcluded = (food: { id: string; name: string }) => {
        setExcluded((current) =>
            current.some((item) => item.food_id === food.id) ? current : [...current, { food_id: food.id, name: food.name }]
        )
        search.setQuery('')
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const saved = await save({ allergens, excluded_food_ids: excluded.map((food) => food.food_id) })
            toast.success(t('recipes.restrictions.saved'))
            onSaved?.(saved)
        } catch (err) {
            toast.error(messageForOr(err, t('recipes.restrictions.saveFailed')))
        } finally {
            setSaving(false)
        }
    }

    const results = search.query.trim().length >= 2 ? search.results : []

    return (
        <div className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-3">
                <legend className="type-title-3 text-fg">{t('recipes.restrictions.allergensTitle')}</legend>
                <p className="text-sm text-fg-muted">{t('recipes.restrictions.allergensHint')}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {ALLERGENS.map((value) => (
                        <Checkbox
                            key={value}
                            id={`${id}-allergen-${value}`}
                            label={t(`recipes.allergens.${value}`)}
                            checked={allergens.includes(value)}
                            onChange={() => toggleAllergen(value)}
                        />
                    ))}
                </div>
            </fieldset>

            <section className="flex flex-col gap-3" aria-labelledby={`${id}-excluded`}>
                <h3 id={`${id}-excluded`} className="type-title-3 text-fg">
                    {t('recipes.restrictions.excludedTitle')}
                </h3>
                <p className="text-sm text-fg-muted">{t('recipes.restrictions.excludedHint')}</p>

                {excluded.length === 0 ? (
                    <p className="text-sm text-fg-subtle">{t('recipes.restrictions.noExcluded')}</p>
                ) : (
                    <ul className="flex flex-wrap gap-2">
                        {excluded.map((food) => (
                            <li
                                key={food.food_id}
                                className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm text-fg"
                            >
                                {food.name}
                                <IconButton
                                    variant="ghost"
                                    aria-label={t('recipes.restrictions.remove', { name: food.name })}
                                    onClick={() => setExcluded((current) => current.filter((item) => item.food_id !== food.food_id))}
                                    className="h-8 w-8"
                                >
                                    <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                </IconButton>
                            </li>
                        ))}
                    </ul>
                )}

                <Input
                    id={`${id}-food-search`}
                    type="search"
                    label={t('recipes.restrictions.searchLabel')}
                    placeholder={t('recipes.restrictions.searchPlaceholder')}
                    value={search.query}
                    onChange={(e) => search.setQuery(e.target.value)}
                />
                {search.isSearching && <p className="text-sm text-fg-muted">{t('recipes.restrictions.searching')}</p>}
                {results.length > 0 && (
                    <ul className="flex max-h-64 flex-col overflow-y-auto rounded-tile border border-line bg-surface">
                        {results.map((food) => (
                            <li key={food.id}>
                                <button
                                    type="button"
                                    onClick={() => addExcluded(food)}
                                    className="flex min-h-11 w-full items-center px-4 py-2 text-left text-fg hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                                >
                                    {food.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <Button onClick={handleSave} isLoading={saving} block>
                {t('recipes.restrictions.save')}
            </Button>
        </div>
    )
}
