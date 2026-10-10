import { formatDate, t } from '@/shared/i18n'
import { formatLocalDate } from '@/shared/utils/format'

/** Сервер строит план не дальше 30 дней от сегодня в обе стороны (иначе `422`). */
export const PLAN_WINDOW_DAYS = 30

/** `YYYY-MM-DD` → локальная полночь этой даты (без сдвига по UTC). */
export function parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

export function addDays(value: string, days: number): string {
    const date = parseLocalDate(value)
    date.setDate(date.getDate() + days)
    return formatLocalDate(date)
}

/** Разница в днях между датами (`b − a`), по календарю, а не по часам. */
export function daysBetween(a: string, b: string): number {
    const ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime()
    return Math.round(ms / 86_400_000)
}

export function todayString(now: Date = new Date()): string {
    return formatLocalDate(now)
}

/** Дата в окне ±30 дней от сегодня. */
export function isWithinWindow(value: string, today: string): boolean {
    return Math.abs(daysBetween(today, value)) <= PLAN_WINDOW_DAYS
}

/** «Сегодня, 10 октября», «Завтра, 11 октября» или «пятница, 16 октября». */
export function dayLabel(value: string, today: string): string {
    const date = parseLocalDate(value)
    const dayMonth = formatDate(date, undefined, { day: 'numeric', month: 'long' })
    const offset = daysBetween(today, value)
    if (offset === 0) return t('mealPlan.date.today', { date: dayMonth })
    if (offset === 1) return t('mealPlan.date.tomorrow', { date: dayMonth })
    if (offset === -1) return t('mealPlan.date.yesterday', { date: dayMonth })
    return formatDate(date, undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}
