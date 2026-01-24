import { formatDate, formatNumber, formatCurrency, formatPercentage } from '../format'

describe('format utilities', () => {
    describe('formatDate', () => {
        it('formats date correctly', () => {
            const date = new Date('2024-01-15T12:00:00Z')
            const formatted = formatDate(date)
            expect(formatted).toContain('2024')
        })

        it('handles string dates', () => {
            const formatted = formatDate('2024-01-15')
            expect(formatted).toContain('2024')
        })
    })

    describe('formatNumber', () => {
        it('formats numbers with default locale', () => {
            expect(formatNumber(1000)).toBe('1,000')
        })

        it('formats decimals', () => {
            expect(formatNumber(1234.56)).toBe('1,234.56')
        })
    })

    describe('formatCurrency', () => {
        it('formats currency with default settings', () => {
            const formatted = formatCurrency(1000)
            expect(formatted).toContain('1,000')
        })

        it('formats currency with custom currency code', () => {
            const formatted = formatCurrency(1000, 'EUR')
            expect(formatted).toBeTruthy()
        })
    })

    describe('formatPercentage', () => {
        it('formats percentage', () => {
            expect(formatPercentage(0.5)).toBe('50%')
        })

        it('formats percentage with decimals', () => {
            expect(formatPercentage(0.1234, 2)).toBe('12.34%')
        })
    })
})
