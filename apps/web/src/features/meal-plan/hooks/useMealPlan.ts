'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { useResource } from '@/features/recipes/hooks/useResource'
import { mealPlanApi } from '../api/mealPlanApi'
import type { MealPlan, MealType, PlanItem } from '../types'
import { eatRequest } from '../utils/eatRequest'
import { trackPlanAction, trackPlanItemEaten, trackPlanRefit, trackPlanViewed, type PlanAction } from '../utils/planEvents'

/** Что сейчас ждёт ответа сервера: пересборка, подгонка или правка конкретного приёма. */
export type PendingAction = 'regenerate' | 'refit' | MealType | null

export interface MealPlanState {
    plan: MealPlan | undefined
    error: unknown
    loading: boolean
    pending: PendingAction
    reload: () => void
    regenerate: () => Promise<boolean>
    replaceItem: (mealType: MealType, recipeId: string) => Promise<boolean>
    toggleLock: (item: PlanItem) => Promise<boolean>
    setGrams: (mealType: MealType, grams: number) => Promise<boolean>
    resetGrams: (mealType: MealType) => Promise<boolean>
    /** «Съел»: без `grams` — вес из плана. */
    eat: (mealType: MealType, grams?: number) => Promise<boolean>
    /** «Подогнать остаток». */
    refit: () => Promise<boolean>
}

/**
 * План на дату и правки поверх него.
 *
 * Каждая правка отвечает пересобранным днём целиком — он и становится текущим,
 * без повторного запроса. Пока правка в пути, другие правки и смена даты
 * заблокированы экраном (`pending`): ответ на прошлую дату не должен лечь на
 * новую.
 */
export function useMealPlan(date: string): MealPlanState {
    const load = useCallback(() => mealPlanApi.get(date), [date])
    const { data, error, loading, reload, replace } = useResource(load)
    const [pending, setPending] = useState<PendingAction>(null)

    useEffect(() => {
        if (data) trackPlanViewed(data)
    }, [data])

    const mutate = async (
        key: Exclude<PendingAction, null>,
        action: PlanAction | null,
        request: () => Promise<MealPlan>,
        failure: string
    ): Promise<boolean> => {
        setPending(key)
        try {
            const plan = await request()
            replace(plan)
            if (action) trackPlanAction(action, plan)
            return true
        } catch (err) {
            toast.error(messageForOr(err, failure))
            return false
        } finally {
            setPending(null)
        }
    }

    return {
        plan: data,
        error,
        loading,
        pending,
        reload,
        regenerate: async () => {
            const ok = await mutate('regenerate', 'regenerated', () => mealPlanApi.regenerate(date), t('mealPlan.regenerateFailed'))
            if (ok) toast.success(t('mealPlan.regenerated'))
            return ok
        },
        replaceItem: (mealType, recipeId) =>
            mutate(mealType, 'replaced', () => mealPlanApi.updateItem(date, mealType, { recipe_id: recipeId }), t('mealPlan.updateFailed')),
        toggleLock: (item) =>
            mutate(
                item.meal_type,
                // Событие — о закреплении; снятие закрепления его не шлёт.
                item.locked ? null : 'locked',
                () => mealPlanApi.updateItem(date, item.meal_type, { locked: !item.locked }),
                t('mealPlan.updateFailed')
            ),
        setGrams: (mealType, grams) =>
            mutate(mealType, 'grams_set', () => mealPlanApi.updateItem(date, mealType, { grams }), t('mealPlan.updateFailed')),
        resetGrams: (mealType) =>
            mutate(mealType, null, () => mealPlanApi.updateItem(date, mealType, { reset_grams: true }), t('mealPlan.updateFailed')),
        eat: async (mealType, grams) => {
            const ok = await mutate(
                mealType,
                null,
                async () => (await mealPlanApi.eat(date, mealType, eatRequest(date, grams))).plan,
                t('mealPlan.eat.failed')
            )
            if (ok) {
                trackPlanItemEaten('plan')
                toast.success(t('mealPlan.eat.done'))
            }
            return ok
        },
        refit: async () => {
            const ok = await mutate('refit', null, () => mealPlanApi.refit(date), t('mealPlan.refit.failed'))
            if (ok) {
                trackPlanRefit()
                toast.success(t('mealPlan.refit.done'))
            }
            return ok
        },
    }
}
