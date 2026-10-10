import { formatDate, t } from '@/shared/i18n'
import type { ShoppingList, ShoppingMarks } from '../types'
import { parseLocalDate } from './planDates'

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }

/**
 * Диапазон словами: «13 октября», «13–15 октября», «30 октября – 2 ноября»,
 * «30 декабря 2026 – 2 января 2027».
 */
export function formatShoppingRange(from: string, to: string): string {
    const a = parseLocalDate(from)
    const b = parseLocalDate(to)
    if (from === to) return formatDate(a, undefined, DAY_MONTH)
    if (a.getFullYear() !== b.getFullYear()) {
        return `${formatDate(a, undefined, DAY_MONTH_YEAR)} – ${formatDate(b, undefined, DAY_MONTH_YEAR)}`
    }
    if (a.getMonth() !== b.getMonth()) {
        return `${formatDate(a, undefined, DAY_MONTH)} – ${formatDate(b, undefined, DAY_MONTH)}`
    }
    return `${a.getDate()}–${formatDate(b, undefined, DAY_MONTH)}`
}

/**
 * Текст списка для мессенджера или заметок — единственная реализация формата.
 *
 * Заголовок с диапазоном, отделы со строками «— Название — количество» и блок
 * «Обычно есть дома». Строки с отметкой («уже есть», «купил») в текст не
 * попадают, отдел без оставшихся строк — тоже: текст — то, что ещё купить.
 */
export function formatShoppingList(list: ShoppingList, marks: ShoppingMarks): string {
    const blocks: string[] = [t('mealPlan.shopping.textTitle', { range: formatShoppingRange(list.from, list.to) })]
    for (const department of list.departments) {
        const rows = department.items
            .filter((item) => !marks[item.food_id])
            .map((item) => t('mealPlan.shopping.textRow', { name: item.name, quantity: item.quantity_text }))
        if (rows.length > 0) blocks.push([department.name, ...rows].join('\n'))
    }
    if (list.at_home.length > 0) {
        blocks.push(t('mealPlan.shopping.textAtHome', { items: list.at_home.join(', ') }))
    }
    return blocks.join('\n\n')
}
