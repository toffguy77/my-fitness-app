import type { ShoppingMark, ShoppingMarks } from '../types'

/**
 * Отметки «уже есть» и «купил» живут только на этом устройстве, по ключу
 * диапазона: список на другие даты — другой поход в магазин.
 */
export function marksKey(from: string, to: string): string {
    return `shopping:${from}:${to}`
}

const VALID: readonly ShoppingMark[] = ['have', 'bought']

export function loadMarks(key: string): ShoppingMarks {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
        const marks: ShoppingMarks = {}
        for (const [foodId, mark] of Object.entries(stored)) {
            if (VALID.includes(mark as ShoppingMark)) marks[foodId] = mark as ShoppingMark
        }
        return marks
    } catch {
        // Хранилище недоступно или испорчено — начинаем без отметок.
        return {}
    }
}

export function saveMarks(key: string, marks: ShoppingMarks): void {
    try {
        if (Object.keys(marks).length === 0) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(marks))
    } catch {
        // Без хранилища отметки доживут до перезагрузки.
    }
}

/** Та же отметка ещё раз снимает её; другая — заменяет. */
export function toggleMark(marks: ShoppingMarks, foodId: string, mark: ShoppingMark): ShoppingMarks {
    const next = { ...marks }
    if (next[foodId] === mark) delete next[foodId]
    else next[foodId] = mark
    return next
}
