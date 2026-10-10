import { EVENTS, track } from '@/shared/analytics'
import type { MealPlan } from '../types'

/**
 * Даты, план на которые уже показан в этой сессии вкладки.
 *
 * В ответе плана нет признака «собран сейчас» (api.md), поэтому `plan_generated`
 * — первое открытие даты за сессию: на сервере первое открытие и есть сборка,
 * а повтор в той же вкладке — то же открытие ещё раз. Хранится в
 * sessionStorage, чтобы перезагрузка страницы не считалась новой сборкой.
 */
const STORAGE_KEY = 'meal-plan:viewed-dates'
const memory = new Set<string>()

function viewedDates(): Set<string> {
    try {
        const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
        if (Array.isArray(stored)) stored.forEach((date) => typeof date === 'string' && memory.add(date))
    } catch {
        // Хранилище недоступно — помним только в памяти.
    }
    return memory
}

function remember(date: string): void {
    const dates = viewedDates()
    dates.add(date)
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...dates]))
    } catch {
        // Без хранилища дедупликация живёт до перезагрузки.
    }
}

/** Отклонения есть — каталога не хватило, чтобы попасть в цель. */
function trackOffTarget(plan: MealPlan): void {
    if (plan.deviations.length > 0) track(EVENTS.planOffTarget)
}

/** План на дату показан: первое открытие за сессию — сборка. */
export function trackPlanViewed(plan: MealPlan): void {
    if (viewedDates().has(plan.date)) return
    remember(plan.date)
    track(EVENTS.planGenerated)
    trackOffTarget(plan)
}

export type PlanAction = 'regenerated' | 'replaced' | 'locked' | 'grams_set'

/**
 * Правка клиента дошла до сервера; ответ — пересобранный день.
 *
 * `plan_off_target` — только после сборки сервером (первое открытие и
 * пересборка): событие отвечает, хватает ли каталога, а промах после ручного
 * веса или выбранной клиентом замены — его решение, а не нехватка рецептов.
 * Иначе каждая правка граммов повторяла бы одно и то же событие.
 *
 * Каждый вызов `track` — с литералом `EVENTS.<ключ>`: check-codebase-integrity
 * сверяет вызовы со словарём сервера и имя из таблицы не разберёт.
 */
export function trackPlanAction(action: PlanAction, plan: MealPlan): void {
    switch (action) {
        case 'regenerated':
            track(EVENTS.planRegenerated)
            trackOffTarget(plan)
            return
        case 'replaced':
            track(EVENTS.planItemReplaced)
            return
        case 'locked':
            track(EVENTS.planItemLocked)
            return
        case 'grams_set':
            track(EVENTS.planGramsSet)
            return
    }
}

/** Для тестов: забыть показанные даты. */
export function resetPlanEventsForTests(): void {
    memory.clear()
    try {
        sessionStorage.removeItem(STORAGE_KEY)
    } catch {
        // нечего чистить
    }
}

/** Где блюдо плана записали в дневник. */
export type EatSource = 'plan' | 'diary'

/**
 * Блюдо плана записано в дневник.
 *
 * Два вызова с литералами, а не `{ source }`: check-codebase-integrity сверяет
 * значение со словарём сервера только у литерала.
 */
export function trackPlanItemEaten(source: EatSource): void {
    if (source === 'plan') track(EVENTS.planItemEaten, { source: 'plan' })
    else track(EVENTS.planItemEaten, { source: 'diary' })
}

/** «Подогнать остаток» дошло до сервера. */
export function trackPlanRefit(): void {
    track(EVENTS.planRefit)
}
