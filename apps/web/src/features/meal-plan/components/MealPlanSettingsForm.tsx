'use client'

import { useCallback, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useResource } from '@/features/recipes/hooks/useResource'
import { ErrorState } from '@/shared/components/ErrorState'
import { Button } from '@/shared/components/ui/Button'
import { Checkbox } from '@/shared/components/ui/Checkbox'
import { Spinner } from '@/shared/components/ui/Spinner'
import { messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { mealPlanApi } from '../api/mealPlanApi'
import { MEAL_TYPES, type MealType } from '../types'

function MealTypesForm({ initial }: { initial: MealType[] }) {
    const [selected, setSelected] = useState<MealType[]>(initial)
    const [saved, setSaved] = useState<MealType[]>(initial)
    const [saving, setSaving] = useState(false)
    const empty = selected.length === 0
    const dirty = MEAL_TYPES.some((type) => selected.includes(type) !== saved.includes(type))

    const toggle = (type: MealType) =>
        setSelected((current) =>
            current.includes(type) ? current.filter((value) => value !== type) : MEAL_TYPES.filter((value) => value === type || current.includes(value))
        )

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        if (empty) return
        setSaving(true)
        try {
            const result = await mealPlanApi.saveSettings({ meal_types: selected })
            setSelected(result.meal_types)
            setSaved(result.meal_types)
            toast.success(t('mealPlan.settings.saved'))
        } catch (err) {
            toast.error(messageForOr(err, t('mealPlan.settings.saveFailed')))
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-3" aria-describedby="meal-plan-types-hint">
                <legend className="sr-only">{t('mealPlan.settings.title')}</legend>
                {MEAL_TYPES.map((type) => (
                    <Checkbox
                        key={type}
                        id={`meal-plan-type-${type}`}
                        label={t(`recipes.mealTypes.${type}`)}
                        checked={selected.includes(type)}
                        onChange={() => toggle(type)}
                        error={empty}
                    />
                ))}
            </fieldset>
            {empty && (
                <p role="alert" className="text-sm text-danger-fg">
                    {t('mealPlan.settings.atLeastOne')}
                </p>
            )}
            <Button type="submit" variant="secondary" isLoading={saving} disabled={empty || !dirty} className="self-start">
                {t('mealPlan.settings.save')}
            </Button>
        </form>
    )
}

/**
 * «Приёмы пищи в плане» — какие приёмы план дня собирает. Хотя бы один
 * обязателен: сервер ответит `422` на пустой список, и форма его не отправит.
 */
export function MealPlanSettingsForm() {
    const load = useCallback(() => mealPlanApi.getSettings(), [])
    const { data, error, loading, reload } = useResource(load)

    return (
        <section className="flex flex-col gap-3" aria-labelledby="meal-plan-types-title">
            <h3 id="meal-plan-types-title" className="type-title-3 text-fg">
                {t('mealPlan.settings.title')}
            </h3>
            <p id="meal-plan-types-hint" className="text-sm text-fg-muted">
                {t('mealPlan.settings.hint')}
            </p>
            {loading && !data ? (
                <Spinner label={t('mealPlan.settings.loading')} />
            ) : error || !data ? (
                <ErrorState variant="inline" title={t('mealPlan.settings.loadFailed')} onRetry={reload} showHomeLink={false} />
            ) : (
                <MealTypesForm initial={data.meal_types} />
            )}
        </section>
    )
}
