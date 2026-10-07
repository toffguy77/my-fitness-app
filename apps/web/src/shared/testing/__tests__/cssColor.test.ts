import { hexToRgb } from '../cssColor'

describe('hexToRgb', () => {
    it('приводит hex к виду, в котором jsdom отдаёт inline-цвет', () => {
        expect(hexToRgb('#B8492F')).toBe('rgb(184, 73, 47)')
        expect(hexToRgb('#000000')).toBe('rgb(0, 0, 0)')
        expect(hexToRgb('#ffffff')).toBe('rgb(255, 255, 255)')
    })

    it('роль дизайн-системы — CSS-переменная — проходит как есть', () => {
        expect(hexToRgb('var(--ds-color-macro-protein)')).toBe('var(--ds-color-macro-protein)')
    })
})
