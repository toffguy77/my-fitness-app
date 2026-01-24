import { validateEmail, validatePassword, validateRequired } from '../validation'

describe('validation utils', () => {
    describe('validateEmail', () => {
        it('validates correct email addresses', () => {
            expect(validateEmail('test@example.com')).toBe(true)
            expect(validateEmail('user.name@domain.co.uk')).toBe(true)
            expect(validateEmail('user+tag@example.com')).toBe(true)
        })

        it('rejects invalid email addresses', () => {
            expect(validateEmail('invalid')).toBe(false)
            expect(validateEmail('invalid@')).toBe(false)
            expect(validateEmail('@example.com')).toBe(false)
            expect(validateEmail('invalid@domain')).toBe(false)
            expect(validateEmail('')).toBe(false)
        })
    })

    describe('validatePassword', () => {
        it('validates passwords meeting minimum length', () => {
            expect(validatePassword('password123', 8)).toBe(true)
            expect(validatePassword('12345678', 8)).toBe(true)
        })

        it('rejects passwords below minimum length', () => {
            expect(validatePassword('short', 8)).toBe(false)
            expect(validatePassword('1234567', 8)).toBe(false)
            expect(validatePassword('', 8)).toBe(false)
        })

        it('uses default minimum length of 8', () => {
            expect(validatePassword('1234567')).toBe(false)
            expect(validatePassword('12345678')).toBe(true)
        })
    })

    describe('validateRequired', () => {
        it('validates non-empty values', () => {
            expect(validateRequired('value')).toBe(true)
            expect(validateRequired('a')).toBe(true)
            expect(validateRequired('  text  ')).toBe(true)
        })

        it('rejects empty values', () => {
            expect(validateRequired('')).toBe(false)
            expect(validateRequired('   ')).toBe(false)
        })
    })
})
