'use client'

import { useEffect, useRef, useState } from 'react'
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
 * `entries` — сохранённые записи дневника (id и приём пищи). План читается один
 * раз на дату и перечитывается, только когда запись, которую дневник уже видел,
 * исчезла или сменила приём пищи: съеденность блюда сервер выводит из записи, и
 * удалённое или перенесённое блюдо должно вернуться под «По плану». Первая
 * загрузка записей план не перечитывает — иначе каждый заход в дневник
 * спрашивал бы его дважды.
 *
 * `onLogged` — обновить записи дневника после «+», чтобы итоги дня сошлись.
 */
export interface DiaryEntryRef {
    id: string
    mealType: MealType
}

export function useDiaryPlan(date: string, entries: DiaryEntryRef[], onLogged: () => void): DiaryPlanState {
    const [loaded, setLoaded] = useState<Loaded | null>(null)
    const [logging, setLogging] = useState<MealType | null>(null)
    const [reloads, setReloads] = useState(0)
    // Записи, которые дневник уже показывал на эту дату: id → приём пищи.
    const seen = useRef<{ date: string; meals: Map<string, MealType> }>({ date, meals: new Map() })

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
    }, [date, reloads])

    const entriesKey = entries.map((entry) => `${entry.id}:${entry.mealType}`).sort().join(',')
    useEffect(() => {
        const previous = seen.current.date === date ? seen.current.meals : new Map<string, MealType>()
        const current = new Map(entries.map((entry) => [entry.id, entry.mealType] as const))
        seen.current = { date, meals: current }
        const eaten = loaded?.date === date ? loaded.plan?.items.filter((item) => item.eaten) ?? [] : []
        const lostOrMoved = eaten.some((item) => {
            const id = item.food_entry_id
            return id !== null && previous.has(id) && current.get(id) !== item.meal_type
        })
        if (lostOrMoved) setReloads((n) => n + 1)
        // entriesKey стоит вместо entries: массив новый на каждой отрисовке.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- сравнение по отпечатку, см. выше
    }, [date, entriesKey, loaded])

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
