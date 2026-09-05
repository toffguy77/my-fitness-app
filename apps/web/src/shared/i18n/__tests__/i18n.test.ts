import { messageForCode, knownErrorCodes, plural, formatDate, formatNumber, currentLanguage } from '../index'
import { pluralRu, pluralEn } from '../plural'
import { messageFor } from '@/shared/errors/apiErrors'
import { ApiError, NetworkError } from '@/shared/errors/apiErrors'

const forms = { one: 'попытка', few: 'попытки', many: 'попыток' }

describe('Russian number agreement', () => {
    // Getting this wrong is the most visible way a translated interface reads
    // as machine-made.
    it.each([
        [1, 'попытка'],
        [2, 'попытки'],
        [4, 'попытки'],
        [5, 'попыток'],
        [11, 'попыток'],
        [12, 'попыток'],
        [14, 'попыток'],
        [21, 'попытка'],
        [22, 'попытки'],
        [25, 'попыток'],
        [101, 'попытка'],
        [111, 'попыток'],
        [0, 'попыток'],
    ])('%i → %s', (count, expected) => {
        expect(pluralRu(count, forms)).toBe(expected)
    })

    it('treats a negative count by its magnitude', () => {
        expect(pluralRu(-1, forms)).toBe('попытка')
    })

    it('uses the simpler English rule for English', () => {
        expect(pluralEn(1, { one: 'attempt', few: 'attempts', many: 'attempts' })).toBe('attempt')
        expect(pluralEn(5, { one: 'attempt', few: 'attempts', many: 'attempts' })).toBe('attempts')
        expect(plural(5, forms, 'ru')).toBe('попыток')
    })
})

describe('Error codes', () => {
    it('turns a code into a sentence', () => {
        expect(messageForCode('invalid_credentials')).toBe('Неверный логин или пароль')
    })

    // Two different sentences to the person reading them: one is a failed
    // sign-in, the other is failing to confirm it is you.
    it('distinguishes a wrong password from a failed sign-in', () => {
        expect(messageForCode('password_incorrect')).toBe('Неверный текущий пароль')
        expect(messageForCode('password_incorrect')).not.toBe(messageForCode('invalid_credentials'))
    })

    // A dictionary that has fallen behind the API must be visible, not silent.
    it('has nothing to say about a code it does not know', () => {
        expect(messageForCode('invented_code')).toBeNull()
    })

    it('covers every code the API declares', () => {
        // Mirrors apps/api/internal/shared/apperrors/codes.go.
        const apiCodes = [
            'not_found', 'unauthorized', 'forbidden', 'invalid_credentials',
            'token_invalid', 'token_expired', 'code_expired', 'too_many_attempts',
            'rate_limited', 'unsupported_media', 'password_policy', 'password_unchanged',
            'email_unavailable', 'conflict', 'gone', 'validation',
            'feature_unavailable', 'internal', 'password_incorrect',
        ]

        expect(knownErrorCodes().sort()).toEqual(apiCodes.sort())
    })
})

describe('Turning a failed request into something to read', () => {
    // The server names what happened; this side decides how to say it.
    it('prefers the code over the server’s own sentence', () => {
        const error = new ApiError(401, { code: 'invalid_credentials', message: 'Неверные учетные данные' })

        expect(messageFor(error)).toBe('Неверный логин или пароль')
    })

    // Handlers that have not been migrated still answer with prose, and their
    // users should read it rather than a generic apology.
    it('falls back to the server’s sentence for an unknown code', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
        const error = new ApiError(400, { code: 'not_in_this_client', message: 'Файл слишком большой' })

        expect(messageFor(error)).toBe('Файл слишком большой')
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('not_in_this_client'))

        warn.mockRestore()
    })

    it('still distinguishes a failed request from a failed response', () => {
        expect(messageFor(new NetworkError(new Error('offline')))).toContain('Нет связи')
    })
})

describe('Formatting for a reader', () => {
    it('writes a date the way the language writes dates', () => {
        const date = new Date('2026-03-01T10:00:00Z')

        expect(formatDate(date, 'ru')).toContain('март')
        expect(formatDate(date, 'en')).toContain('March')
    })

    it('uses the reader’s own separators', () => {
        // Non-breaking spaces in the Russian grouping, so the digits are
        // compared rather than the whitespace.
        expect(formatNumber(1234.5, 'ru').replace(/\s/g, ' ')).toBe('1 234,5')
        expect(formatNumber(1234.5, 'en')).toBe('1,234.5')
    })

    // While `en` resolves to the Russian dictionary, honouring the browser's
    // language would give a Russian sentence an English date. The user's own
    // setting is the only thing that decides.
    it('ignores the browser language until there is a second dictionary', () => {
        localStorage.clear()

        expect(currentLanguage()).toBe('ru')
    })

    it('honours the language stored in the profile', () => {
        localStorage.setItem('user', JSON.stringify({ settings: { language: 'en' } }))

        expect(currentLanguage()).toBe('en')

        localStorage.clear()
    })

    it('falls back when the stored profile is unreadable', () => {
        localStorage.setItem('user', 'not json')

        expect(currentLanguage()).toBe('ru')

        localStorage.clear()
    })
})
