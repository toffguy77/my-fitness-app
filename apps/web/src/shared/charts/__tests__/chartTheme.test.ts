import { color } from '@burcev/design-tokens'
import { AXIS_STYLE, GRID_STROKE, TARGET_STROKE, TOOLTIP_CLASS, chartColor } from '../chartTheme'

describe('chartTheme', () => {
    it('графики красятся ролями — CSS-переменными, которые сами меняются с темой', () => {
        for (const value of [AXIS_STYLE.fill, GRID_STROKE, TARGET_STROKE, chartColor.primary, chartColor.warning]) {
            expect(value).toMatch(/^var\(--ds-/)
        }
    })

    it('ни одного литерала цвета', () => {
        expect(JSON.stringify({ AXIS_STYLE, GRID_STROKE, TARGET_STROKE })).not.toMatch(/#[0-9a-f]{3,8}\b/i)
        expect(chartColor).toBe(color)
    })

    it('подсказка — та же поверхность, что карточки', () => {
        expect(TOOLTIP_CLASS).toContain('bg-surface')
        expect(TOOLTIP_CLASS).toContain('border-line')
    })
})
