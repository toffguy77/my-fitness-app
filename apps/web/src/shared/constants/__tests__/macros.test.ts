import { MACRO_COLORS, MACRO_KEYS, MACRO_TEXT_COLORS, macroColor } from '../macros'

describe('цвет нутриента', () => {
    it('объявлен для каждого из трёх нутриентов', () => {
        expect(MACRO_KEYS).toEqual(['protein', 'fat', 'carbs'])
        MACRO_KEYS.forEach((key) => {
            expect(MACRO_COLORS[key]).toBeDefined()
        })
    })

    // Значение должно годиться и для `stroke` в SVG, и для `backgroundColor`,
    // и переключаться с темой: это CSS-переменная роли из дизайн-токенов, а не
    // литерал, объявленный здесь второй раз.
    it('задан ролью дизайн-системы', () => {
        MACRO_KEYS.forEach((key) => {
            expect(MACRO_COLORS[key]).toBe(`var(--ds-color-macro-${key})`)
            expect(MACRO_TEXT_COLORS[key]).toBe(`var(--ds-color-macro-${key}-fg)`)
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
