import { generateErrorId } from '../errorId'

describe('generateErrorId', () => {
    // The id is read aloud to support, so it must be short and free of
    // characters that sound or look alike.
    it('produces a short, dictatable id', () => {
        expect(generateErrorId()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    })

    it('avoids ambiguous characters', () => {
        const ids = Array.from({ length: 200 }, generateErrorId).join('')
        for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
            expect(ids).not.toContain(ambiguous)
        }
    })

    it('does not repeat across calls', () => {
        const ids = new Set(Array.from({ length: 500 }, generateErrorId))
        expect(ids.size).toBeGreaterThan(490)
    })
})
