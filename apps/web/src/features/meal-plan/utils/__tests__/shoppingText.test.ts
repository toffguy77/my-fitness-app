// i18n-exempt-file — ожидаемый текст списка в тестах.
import { shoppingList } from '../../testing/fixtures'
import { formatShoppingList, formatShoppingRange } from '../shoppingText'
import { loadMarks, marksKey, saveMarks, toggleMark } from '../shoppingMarks'

describe('formatShoppingList', () => {
    it('Текст списка: заголовок с диапазоном, отделы со строками, «Обычно есть дома»', () => {
        expect(formatShoppingList(shoppingList(), {})).toBe(
            [
                'Список покупок · 13–15 октября',
                '',
                'Овощи и зелень',
                '— Огурцы — 300 г',
                '— Томаты — 250 г',
                '',
                'Мясо и птица',
                '— Филе куриное — 500 г',
                '',
                'Молочное и яйца',
                '— Яйцо куриное — 4 шт. (≈220 г)',
                '',
                'Обычно есть дома: Перец чёрный, Соль',
            ].join('\n')
        )
    })

    it('отмеченные строки не попадают в текст, отдел без строк — тоже', () => {
        const text = formatShoppingList(shoppingList(), { 'f-tomato': 'have', 'f-chicken': 'bought' })
        expect(text).toContain('— Огурцы — 300 г')
        expect(text).not.toContain('Томаты')
        expect(text).not.toContain('Филе куриное')
        expect(text).not.toContain('Мясо и птица')
        expect(text).toContain('Молочное и яйца')
    })

    it('без «по вкусу» блока нет', () => {
        const text = formatShoppingList(shoppingList({ at_home: [] }), {})
        expect(text).not.toContain('Обычно есть дома')
    })
})

describe('formatShoppingRange', () => {
    it.each([
        ['2026-10-13', '2026-10-13', '13 октября'],
        ['2026-10-13', '2026-10-15', '13–15 октября'],
        ['2026-10-30', '2026-11-02', '30 октября – 2 ноября'],
        ['2026-12-30', '2027-01-02', '30 декабря 2026 г. – 2 января 2027 г.'],
    ])('%s … %s → %s', (from, to, expected) => {
        expect(formatShoppingRange(from, to)).toBe(expected)
    })
})

describe('отметки на устройстве', () => {
    beforeEach(() => localStorage.clear())

    it('ключ — диапазон дат', () => {
        expect(marksKey('2026-10-13', '2026-10-15')).toBe('shopping:2026-10-13:2026-10-15')
    })

    it('сохраняются и читаются; пустые убирают ключ', () => {
        const key = marksKey('2026-10-13', '2026-10-15')
        saveMarks(key, { a: 'bought', b: 'have' })
        expect(loadMarks(key)).toEqual({ a: 'bought', b: 'have' })
        saveMarks(key, {})
        expect(localStorage.getItem(key)).toBeNull()
    })

    it('испорченное и чужое содержимое не ломает список', () => {
        localStorage.setItem('k1', '{нет')
        localStorage.setItem('k2', '[1,2]')
        localStorage.setItem('k3', JSON.stringify({ a: 'bought', b: 'eaten', c: 3 }))
        expect(loadMarks('k1')).toEqual({})
        expect(loadMarks('k2')).toEqual({})
        expect(loadMarks('k3')).toEqual({ a: 'bought' })
    })

    it('та же отметка снимается, другая заменяет', () => {
        expect(toggleMark({}, 'a', 'have')).toEqual({ a: 'have' })
        expect(toggleMark({ a: 'have' }, 'a', 'bought')).toEqual({ a: 'bought' })
        expect(toggleMark({ a: 'bought' }, 'a', 'bought')).toEqual({})
    })
})
