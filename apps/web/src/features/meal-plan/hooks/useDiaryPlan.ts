'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { messageForOr } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { mealPlanApi } from '../api/mealPlanApi'
import type { MealPlan, MealType, PlanItem } from '../types'
import { isWithinWindow, todayString } from '../utils/planDates'
import { trackPlanItemEaten } from '../utils/planEvents'
import { eatRequest } from '../utils/eatRequest'

export interface DiaryPlanState {
    /** Несъеденные блюда плана в приёме пищи; пусто, если плана нет. */
    plannedFor: (mealType: MealType) => PlanItem[]
    /** Приём, блюдо которого сейчас записывается. */
    logging: MealType | null
    /** «+»: записать блюдо плана в дневник. */
    log: (item: PlanItem) => Promise<boolean>
}

interface Loaded {
    date: string
    plan: MealPlan | null
}

/**
 * План на дату дневника — только чтение уже собранного.
 *
 * Дневник зовёт `?generate=false` и никогда — собирающий вариант: просмотр
 * дневника план не создаёт. Плана нет (`204`), дата вне окна плана или ошибка —
 * блока «По плану» просто нет: дневник не жалуется на план, которого человек
 * не просил.
 *
 * `entriesKey` — отпечаток записей дневника. Запись удалили, перенесли или
 * добавили — план перечитывается: съеденность блюда сервер выводит из записи,
 * и удалённое из дневника блюдо должно вернуться под «По плану».
 *
 * `onLogged` — обновить записи дневника после «+», чтобы итоги дня сошлись.
 */
export function useDiaryPlan(date: string, entriesKey: string, onLogged: () => void): DiaryPlanState {
    const [loaded, setLoaded] = useState<Loaded | null>(null)
    const [logging, setLogging] = useState<MealType | null>(null)

    useEffect(() => {
        if (!isWithinWindow(date, todayString())) return
        let active = true
        mealPlanApi.getExisting(date).then(
            (plan) => {
                if (active) setLoaded({ date, plan: plan ?? null })
            },
            () => {
                // Без плана дневник остаётся дневником.
            }
        )
        return () => {
            active = false
        }
    }, [date, entriesKey])

    // Ответ на прошлую дату к новой не относится.
    const plan = loaded?.date === date ? loaded.plan : null

    return {
        plannedFor: (mealType) => plan?.items.filter((item) => item.meal_type === mealType && !item.eaten) ?? [],
        logging,
        log: async (item) => {
            setLogging(item.meal_type)
            try {
                const response = await mealPlanApi.eat(date, item.meal_type, eatRequest(date))
                setLoaded({ date, plan: response.plan })
                trackPlanItemEaten('diary')
                toast.success(t('foodTracker.mealSlot.plannedLogged'))
                onLogged()
                return true
            } catch (err) {
                toast.error(messageForOr(err, t('foodTracker.mealSlot.plannedLogFailed')))
                return false
            } finally {
                setLogging(null)
            }
        },
    }
}
