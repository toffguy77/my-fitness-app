import type { EatRequest } from '../types'
import { todayString } from './planDates'

/** Текущее время клиента `HH:MM` — время записи «Съел» на сегодня. */
export function clientTime(now: Date = new Date()): string {
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/**
 * Тело «Съел»: время — только для сегодняшней даты; для прочих сервер ставит
 * 12:00 (api.md), и чужое «сейчас» в прошлом дне было бы неправдой.
 */
export function eatRequest(date: string, grams?: number): EatRequest {
    const body: EatRequest = {}
    if (grams !== undefined) body.grams = grams
    if (date === todayString()) body.time = clientTime()
    return body
}
