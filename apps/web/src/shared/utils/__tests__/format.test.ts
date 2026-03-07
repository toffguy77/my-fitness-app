import { formatDate, formatLocalDate, formatNumber, formatCurrency } from '../format'

describe('format utils', () => {
    describe('formatDate', () => {
        it('formats a Date object to Russian long date', () => {
            const date = new Date(2024, 0, 15) // January 15, 2024
            const result = formatDate(date)
            expect(result).toBe('15 января 2024 г.')
        })

        it('formats a date string to Russian long date', () => {
            const result = formatDate('2024-06-01T12:00:00')
            expect(result).toBe('1 июня 2024 г.')
        })

        it('handles different months correctly', () => {
            expect(formatDate(new Date(2024, 11, 25))).toBe('25 декабря 2024 г.')
            expect(formatDate(new Date(2024, 2, 8))).toBe('8 марта 2024 г.')
        })

        it('handles the first day of the year', () => {
            expect(formatDate(new Date(2025, 0, 1))).toBe('1 января 2025 г.')
        })

        it('handles the last day of the year', () => {
            expect(formatDate(new Date(2025, 11, 31))).toBe('31 декабря 2025 г.')
        })

        it('throws RangeError for an invalid date string', () => {
            expect(() => formatDate('not-a-date')).toThrow(RangeError)
        })
    })

    describe('formatLocalDate', () => {
        it('formats a date as YYYY-MM-DD', () => {
            const date = new Date(2024, 0, 15) // January 15, 2024
            expect(formatLocalDate(date)).toBe('2024-01-15')
        })

        it('pads single-digit month and day with leading zeros', () => {
            const date = new Date(2024, 2, 5) // March 5, 2024
            expect(formatLocalDate(date)).toBe('2024-03-05')
        })

        it('does not pad double-digit month and day', () => {
            const date = new Date(2024, 10, 22) // November 22, 2024
            expect(formatLocalDate(date)).toBe('2024-11-22')
        })

        it('handles December 31 correctly', () => {
            const date = new Date(2024, 11, 31)
            expect(formatLocalDate(date)).toBe('2024-12-31')
        })

        it('handles January 1 correctly', () => {
            const date = new Date(2025, 0, 1)
            expect(formatLocalDate(date)).toBe('2025-01-01')
        })
    })

    describe('formatNumber', () => {
        it('formats an integer with no decimals by default', () => {
            expect(formatNumber(1234)).toBe('1\u00A0234')
        })

        it('formats a number with specified decimal places', () => {
            expect(formatNumber(1234.567, 2)).toBe('1\u00A0234,57')
        })

        it('pads with trailing zeros to match decimal places', () => {
            expect(formatNumber(10, 2)).toBe('10,00')
        })

        it('formats zero', () => {
            expect(formatNumber(0)).toBe('0')
        })

        it('formats negative numbers', () => {
            const result = formatNumber(-5000)
            expect(result).toContain('5\u00A0000')
        })

        it('rounds to the specified decimal places', () => {
            expect(formatNumber(1.999, 1)).toBe('2,0')
        })
    })

    describe('formatCurrency', () => {
        it('formats a positive amount as Russian rubles', () => {
            const result = formatCurrency(1500)
            expect(result).toContain('1\u00A0500')
            expect(result).toContain('₽')
        })

        it('formats zero amount', () => {
            const result = formatCurrency(0)
            expect(result).toContain('0')
            expect(result).toContain('₽')
        })

        it('formats a decimal amount with two fraction digits', () => {
            const result = formatCurrency(99.5)
            expect(result).toContain('99,50')
        })

        it('formats large amounts with thousands separator', () => {
            const result = formatCurrency(1000000)
            expect(result).toContain('1\u00A0000\u00A0000')
        })

        it('formats negative amounts', () => {
            const result = formatCurrency(-250)
            expect(result).toContain('250')
            expect(result).toContain('₽')
        })
    })
})
