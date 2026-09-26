'use client'

/**
 * Сшивает то, что этот браузер делал до аккаунта, с тем, что он делает после.
 *
 * До регистрации события несут только `visitor_id` — он живёт в браузере.
 * После появляется `user_id`. Связывает их таблица `analytics_identities`, и
 * заполняется она единственным способом: этим запросом.
 *
 * Без него воронка обрывается ровно там, где интереснее всего. На проде
 * 2026-09-26 таблица была пуста: обработчик написан, маршрут зарегистрирован,
 * а звать его никто не звал — переход «аноним → зарегистрировался» посчитать
 * было нельзя вообще.
 */

import { apiClient } from '@/shared/utils/api-client'
import { visitorId } from './client'

/**
 * Отметка о том, что этот браузер уже сшит.
 *
 * Сервер идемпотентен — `ON CONFLICT DO UPDATE`, — так что повтор безвреден.
 * Отметка нужна не ради него, а чтобы не отправлять запрос на каждой загрузке
 * страницы у человека, который давно вошёл.
 */
const LINKED_KEY = 'analytics_visitor_linked'

function alreadyLinked(visitor: string): boolean {
    try {
        return localStorage.getItem(LINKED_KEY) === visitor
    } catch {
        // Приватный просмотр отказывает в хранилище. Тогда запрос уйдёт лишний
        // раз — это дешевле, чем не уйти вовсе.
        return false
    }
}

function rememberLinked(visitor: string): void {
    try {
        localStorage.setItem(LINKED_KEY, visitor)
    } catch {
        // См. выше: отсутствие отметки стоит одного лишнего запроса.
    }
}

/**
 * Связывает браузер с вошедшим пользователем. Вызывать, когда сессия есть.
 *
 * Ничего не бросает и ничего не возвращает: аналитика не должна уметь сломать
 * вход. Отказ здесь означает несшитую воронку, а не неработающий продукт.
 */
export async function linkVisitor(): Promise<void> {
    if (typeof window === 'undefined') return

    const visitor = visitorId()
    if (!visitor || alreadyLinked(visitor)) return

    try {
        await apiClient.post('/api/v1/analytics/identify', { visitor_id: visitor })
        rememberLinked(visitor)
    } catch {
        // Попробуем в следующий раз: отметка не поставлена.
    }
}

/** Тестовый шов: забыть, что браузер уже сшит. */
export function resetIdentityForTests(): void {
    try {
        localStorage.removeItem(LINKED_KEY)
    } catch {
        // Нечего забывать.
    }
}
