import { unitLabel } from '../unitLabel'

describe('unitLabel', () => {
    it('reads the codes stored today', () => {
        expect(unitLabel('g')).toBe('г')
        expect(unitLabel('ml')).toBe('мл')
        expect(unitLabel('pcs')).toBe('шт')
        expect(unitLabel('serving')).toBe('порция')
        expect(unitLabel('mg')).toBe('мг')
        expect(unitLabel('mcg')).toBe('мкг')
        expect(unitLabel('IU')).toBe('МЕ')
    })

    // A page already open when the migration runs is reading rows it was not
    // redeployed for. It must not start showing a raw value in the middle of a
    // sentence.
    it('still reads the words stored before migration 061', () => {
        expect(unitLabel('г')).toBe('г')
        expect(unitLabel('мл')).toBe('мл')
        expect(unitLabel('мкг')).toBe('мкг')
        expect(unitLabel('МЕ')).toBe('МЕ')
    })

    // An imported food can carry a unit nobody planned for. Inventing a label
    // would lose what it actually said.
    it('shows an unplanned unit as it came', () => {
        expect(unitLabel('cup')).toBe('cup')
        expect(unitLabel('ст. ложка')).toBe('ст. ложка')
    })

    it('says nothing when there is nothing', () => {
        expect(unitLabel(null)).toBe('')
        expect(unitLabel(undefined)).toBe('')
        expect(unitLabel('')).toBe('')
    })
})
