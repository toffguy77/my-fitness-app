'use client'

import { useId, useState, type ReactNode } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Checkbox } from '@/shared/components/ui/Checkbox'
import { Input } from '@/shared/components/ui/Input'
import { fieldClass, fieldLabelClass } from '@/shared/components/forms/fieldStyles'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import { ALLERGENS, COMPLEXITIES, MEAL_TYPES, type CatalogueFood, type Complexity, type RecipeVersion, type VersionInput } from '../types'
import {
    draftFromVersion,
    draftToInput,
    emptyIngredient,
    emptyStep,
    type EditorDraft,
    type IngredientDraft,
    type StepDraft,
} from '../utils/editorDraft'
import { fieldLabel } from '../utils/recipeInput'
import { IngredientPicker } from './IngredientPicker'
import { RecipePhotoField } from './RecipePhotoField'

export interface RecipeEditorProps {
    /** Версия, с которой начинается правка; `null` — новый рецепт. */
    initial: RecipeVersion | null
    /**
     * `admin` — команда: всё, включая загрузку фото. `curator` — правка перед
     * одобрением: фото загружает только команда, поэтому без загрузки.
     */
    mode: 'admin' | 'curator'
    /** Незаполненные поля из последнего `422`. */
    missing?: string[] | null
    /** Кнопки под формой; получают способ собрать текущий запрос. */
    actions: (getInput: () => VersionInput) => ReactNode
}

const SECTION = 'flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5'

/**
 * Редактор рецепта — общий для команды и для правки куратором.
 *
 * КБЖУ здесь не вводится: его считает сервер по каталогу продуктов при каждом
 * сохранении, и присланные значения он всё равно игнорирует.
 */
export function RecipeEditor({ initial, mode, missing, actions }: RecipeEditorProps) {
    const id = useId()
    const [draft, setDraft] = useState<EditorDraft>(() => draftFromVersion(initial))
    const [pickerFor, setPickerFor] = useState<string | null>(null)
    const canUpload = mode === 'admin'

    const update = (patch: Partial<EditorDraft>) => setDraft((current) => ({ ...current, ...patch }))

    const updateIngredient = (key: string, patch: Partial<IngredientDraft>) =>
        setDraft((current) => ({
            ...current,
            ingredients: current.ingredients.map((row) => (row.key === key ? { ...row, ...patch } : row)),
        }))

    const updateStep = (key: string, patch: Partial<StepDraft>) =>
        setDraft((current) => ({
            ...current,
            steps: current.steps.map((row) => (row.key === key ? { ...row, ...patch } : row)),
        }))

    const toggle = <T extends string>(list: T[], value: T): T[] =>
        list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

    const pickFood = (key: string, food: { food_id: string | number; name: string }) => {
        updateIngredient(key, { food_id: food.food_id, food_name: food.name, candidates: [] })
        setPickerFor(null)
    }

    return (
        <div className="flex flex-col gap-5">
            {missing && missing.length > 0 && (
                <div role="alert" className="rounded-card border border-danger bg-danger-soft p-4 text-danger-fg">
                    <p className="font-semibold">{t('recipes.admin.missingTitle')}</p>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                        {missing.map((field) => (
                            <li key={field}>{fieldLabel(field)}</li>
                        ))}
                    </ul>
                </div>
            )}

            <section className={SECTION}>
                <Input
                    id={`${id}-name`}
                    label={t('recipes.editor.name')}
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                />
                <div>
                    <label htmlFor={`${id}-description`} className={fieldLabelClass}>
                        {t('recipes.editor.description')}
                    </label>
                    <textarea
                        id={`${id}-description`}
                        value={draft.description}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={3}
                        className={cn(fieldClass, 'h-auto py-3')}
                    />
                </div>
                <div>
                    <p className={fieldLabelClass}>{t('recipes.editor.photo')}</p>
                    <RecipePhotoField
                        url={draft.photo_url}
                        alt={t('recipes.editor.photoAlt')}
                        canUpload={canUpload}
                        onChange={(photo) =>
                            update({ photo_key: photo?.photo_key ?? null, photo_url: photo?.photo_url ?? null })
                        }
                    />
                </div>
            </section>

            <section className={cn(SECTION, 'sm:grid sm:grid-cols-2')}>
                <Input
                    id={`${id}-cook`}
                    label={t('recipes.editor.cookMinutes')}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={draft.cook_minutes}
                    onChange={(e) => update({ cook_minutes: e.target.value })}
                />
                <div>
                    <label htmlFor={`${id}-complexity`} className={fieldLabelClass}>
                        {t('recipes.editor.complexity')}
                    </label>
                    <select
                        id={`${id}-complexity`}
                        value={draft.complexity}
                        onChange={(e) => update({ complexity: e.target.value as Complexity })}
                        className={fieldClass}
                    >
                        {COMPLEXITIES.map((value) => (
                            <option key={value} value={value}>
                                {t(`recipes.complexity.${value}`)}
                            </option>
                        ))}
                    </select>
                </div>
                <Input
                    id={`${id}-servings`}
                    label={t('recipes.editor.servings')}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={draft.servings}
                    onChange={(e) => update({ servings: e.target.value })}
                />
                <Input
                    id={`${id}-yield`}
                    label={t('recipes.editor.yieldGrams')}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={draft.yield_grams}
                    onChange={(e) => update({ yield_grams: e.target.value })}
                    helperText={draft.yield_grams.trim() === '' ? t('recipes.editor.yieldHint') : undefined}
                />
            </section>

            <section className={SECTION}>
                <fieldset>
                    <legend className={fieldLabelClass}>{t('recipes.editor.mealTypes')}</legend>
                    <div className="grid grid-cols-2 gap-3">
                        {MEAL_TYPES.map((value) => (
                            <Checkbox
                                key={value}
                                id={`${id}-meal-${value}`}
                                label={t(`recipes.mealTypes.${value}`)}
                                checked={draft.meal_types.includes(value)}
                                onChange={() => update({ meal_types: toggle(draft.meal_types, value) })}
                            />
                        ))}
                    </div>
                </fieldset>
                <fieldset>
                    <legend className={fieldLabelClass}>{t('recipes.editor.allergens')}</legend>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {ALLERGENS.map((value) => (
                            <Checkbox
                                key={value}
                                id={`${id}-allergen-${value}`}
                                label={t(`recipes.allergens.${value}`)}
                                checked={draft.allergens.includes(value)}
                                onChange={() => update({ allergens: toggle(draft.allergens, value) })}
                            />
                        ))}
                    </div>
                </fieldset>
                <Input
                    id={`${id}-tags`}
                    label={t('recipes.editor.tags')}
                    value={draft.tags}
                    onChange={(e) => update({ tags: e.target.value })}
                />
            </section>

            <section className={SECTION} aria-labelledby={`${id}-ingredients`}>
                <h2 id={`${id}-ingredients`} className="type-title-3 text-fg">
                    {t('recipes.editor.ingredients')}
                </h2>
                <p className="text-sm text-fg-muted">{t('recipes.editor.computedNote')}</p>
                <ol className="flex flex-col gap-4">
                    {draft.ingredients.map((row, index) => (
                        <li
                            key={row.key}
                            className="flex flex-col gap-3 rounded-tile border border-line p-3"
                            aria-label={t('recipes.editor.ingredientNumber', { number: index + 1 })}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-xs text-fg-muted">{t('recipes.editor.product')}</p>
                                    <p className={cn('font-medium', row.food_id == null ? 'text-danger-fg' : 'text-fg')}>
                                        {row.food_id == null ? t('recipes.editor.noProduct') : row.food_name}
                                    </p>
                                    {row.source_name && (
                                        <p className="text-xs text-fg-subtle">
                                            {t('recipes.editor.source', { name: row.source_name })}
                                        </p>
                                    )}
                                </div>
                                <IconButton
                                    variant="ghost"
                                    aria-label={t('recipes.editor.removeIngredient', { number: index + 1 })}
                                    onClick={() =>
                                        update({ ingredients: draft.ingredients.filter((item) => item.key !== row.key) })
                                    }
                                >
                                    <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                </IconButton>
                            </div>

                            {row.food_id == null && row.candidates.length > 0 && (
                                <div>
                                    <p className="mb-1.5 text-xs text-fg-muted">{t('recipes.editor.candidates')}</p>
                                    <ul className="flex flex-col gap-1">
                                        {row.candidates.map((candidate) => (
                                            <li
                                                key={candidate.food_id}
                                                className="flex items-center justify-between gap-2 rounded-field bg-canvas px-3 py-1.5"
                                            >
                                                <span className="text-sm text-fg">{candidate.name}</span>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    aria-label={`${t('recipes.editor.choose')}: ${candidate.name}`}
                                                    onClick={() => pickFood(row.key, candidate)}
                                                >
                                                    {t('recipes.editor.choose')}
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {pickerFor === row.key ? (
                                <IngredientPicker
                                    onPick={(food: CatalogueFood) => pickFood(row.key, food)}
                                    onCancel={() => setPickerFor(null)}
                                />
                            ) : (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="self-start"
                                    onClick={() => setPickerFor(row.key)}
                                >
                                    <Search className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                    {row.food_id == null ? t('recipes.picker.label') : t('recipes.editor.changeProduct')}
                                </Button>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    id={`${id}-grams-${row.key}`}
                                    label={t('recipes.editor.grams')}
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    value={row.grams}
                                    disabled={row.to_taste}
                                    onChange={(e) => updateIngredient(row.key, { grams: e.target.value })}
                                />
                                <Input
                                    id={`${id}-quantity-${row.key}`}
                                    label={t('recipes.editor.displayQuantity')}
                                    placeholder={t('recipes.editor.displayQuantityPlaceholder')}
                                    value={row.display_quantity}
                                    onChange={(e) => updateIngredient(row.key, { display_quantity: e.target.value })}
                                />
                            </div>
                            <Checkbox
                                id={`${id}-taste-${row.key}`}
                                label={t('recipes.editor.toTaste')}
                                checked={row.to_taste}
                                onChange={(e) =>
                                    updateIngredient(row.key, {
                                        to_taste: e.target.checked,
                                        grams: e.target.checked ? '' : row.grams,
                                    })
                                }
                            />
                        </li>
                    ))}
                </ol>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => update({ ingredients: [...draft.ingredients, emptyIngredient()] })}
                >
                    <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    {t('recipes.editor.addIngredient')}
                </Button>
            </section>

            <section className={SECTION} aria-labelledby={`${id}-steps`}>
                <h2 id={`${id}-steps`} className="type-title-3 text-fg">
                    {t('recipes.editor.steps')}
                </h2>
                <ol className="flex flex-col gap-4">
                    {draft.steps.map((step, index) => (
                        <li key={step.key} className="flex flex-col gap-2 rounded-tile border border-line p-3">
                            <div className="flex items-center justify-between gap-2">
                                <label htmlFor={`${id}-step-${step.key}`} className="text-sm font-medium text-fg">
                                    {t('recipes.editor.stepNumber', { number: index + 1 })}
                                </label>
                                <IconButton
                                    variant="ghost"
                                    aria-label={t('recipes.editor.removeStep', { number: index + 1 })}
                                    onClick={() => update({ steps: draft.steps.filter((item) => item.key !== step.key) })}
                                >
                                    <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                </IconButton>
                            </div>
                            <textarea
                                id={`${id}-step-${step.key}`}
                                value={step.text}
                                onChange={(e) => updateStep(step.key, { text: e.target.value })}
                                rows={3}
                                className={cn(fieldClass, 'h-auto py-3')}
                            />
                            <RecipePhotoField
                                url={step.photo_url}
                                alt={t('recipes.editor.stepPhotoAlt', { number: index + 1 })}
                                canUpload={canUpload}
                                onChange={(photo) =>
                                    updateStep(step.key, {
                                        photo_key: photo?.photo_key ?? null,
                                        photo_url: photo?.photo_url ?? null,
                                    })
                                }
                            />
                        </li>
                    ))}
                </ol>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => update({ steps: [...draft.steps, emptyStep()] })}
                >
                    <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    {t('recipes.editor.addStep')}
                </Button>
            </section>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions(() => draftToInput(draft))}</div>
        </div>
    )
}
