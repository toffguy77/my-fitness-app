/**
 * Adding a second language must be a matter of filling in a dictionary.
 *
 * Not of touching components: by the time a translator arrives, every screen
 * already asks for its text by key. This holds that promise, so it cannot
 * quietly stop being true.
 */

import { t, messageForCode, DEFAULT_LANGUAGE } from '../index'
import { ru } from '../dictionaries/ru'
import { en } from '../dictionaries/en'

describe('readiness for a second language', () => {
    it('answers in the asked-for language when the key is translated', () => {
        // Standing in for a translator's first commit. The cast is the test's,
        // not the product's: en is deliberately empty in the repository.
        ;(en as Record<string, unknown>).common = { save: 'Save' }

        expect(t('common.save', undefined, 'en')).toBe('Save')
        expect(t('common.save', undefined, 'ru')).toBe(ru.common.save)

        delete (en as Record<string, unknown>).common
    })

    it('falls back key by key, so a half-finished translation stays readable', () => {
        ;(en as Record<string, unknown>).common = { save: 'Save' }

        // Translated.
        expect(t('common.save', undefined, 'en')).toBe('Save')
        // Not yet — and readable rather than blank.
        expect(t('common.cancel', undefined, 'en')).toBe(ru.common.cancel)

        delete (en as Record<string, unknown>).common
    })

    it('interpolates in whichever language answered', () => {
        ;(en as Record<string, unknown>).foodTracker = {
            entryModal: { batchProgress: 'Adding {current} of {total}' },
        }

        expect(t('foodTracker.entryModal.batchProgress', { current: 2, total: 5 }, 'en'))
            .toBe('Adding 2 of 5')

        delete (en as Record<string, unknown>).foodTracker
    })

    it('resolves the API error codes the same way', () => {
        ;(en as Record<string, unknown>).errors = { not_found: 'Not found' }

        expect(messageForCode('not_found', 'en')).toBe('Not found')
        expect(messageForCode('forbidden', 'en')).toBe(ru.errors.forbidden)

        delete (en as Record<string, unknown>).errors
    })

    it('ships with English empty, so nothing claims to be translated that is not', () => {
        expect(Object.keys(en)).toHaveLength(0)
        expect(DEFAULT_LANGUAGE).toBe('ru')
    })

    it('still reports a key that exists in no dictionary', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

        expect(t('nothing.like.this', undefined, 'en')).toBe('nothing.like.this')
        expect(warn).toHaveBeenCalled()

        warn.mockRestore()
    })
})
