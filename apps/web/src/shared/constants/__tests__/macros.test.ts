import { MACRO_COLORS, MACRO_KEYS, macroColor } from '../macros'

describe('цвет нутриента', () => {
    it('объявлен для каждого из трёх нутриентов', () => {
        expect(MACRO_KEYS).toEqual(['protein', 'fat', 'carbs'])
        MACRO_KEYS.forEach((key) => {
            expect(MACRO_COLORS[key]).toBeDefined()
        })
    })

    // Значение должно годиться и для `stroke` в SVG, и для `backgroundColor`:
    // класс Tailwind не годится ни для первого, ни для сверки в тестах.
    it('задан шестнадцатеричным значением', () => {
        MACRO_KEYS.forEach((key) => {
            expect(MACRO_COLORS[key]).toMatch(/^#[0-9a-f]{6}$/)
        })
    })

    // Одинаковый цвет у двух нутриентов лишает цвет его единственной работы —
    // опознания.
    it('различает нутриенты между собой', () => {
        const colors = MACRO_KEYS.map((key) => MACRO_COLORS[key])
        expect(new Set(colors).size).toBe(MACRO_KEYS.length)
    })

    it('отдаётся по ключу', () => {
        MACRO_KEYS.forEach((key) => {
            expect(macroColor(key)).toBe(MACRO_COLORS[key])
        })
    })

    // Калорий здесь нет намеренно: они не нутриент, и красить их значило бы
    // вернуть цвету вторую работу — оценку выполнения нормы.
    it('не содержит калорий', () => {
        expect((MACRO_COLORS as Record<string, string>).calories).toBeUndefined()
        expect(MACRO_KEYS as readonly string[]).not.toContain('calories')
    })
})
