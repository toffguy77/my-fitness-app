/**
 * Saying things to people, in their language.
 *
 * The API no longer decides how a failure is phrased — it names what happened
 * and this turns the name into a sentence. That is what lets a second client
 * exist at all.
 */

import { ru, type Dictionary } from './dictionaries/ru'
import { pluralRu, pluralEn, type PluralForms } from './plural'

export type Language = 'ru' | 'en'

const dictionaries: Record<Language, Dictionary> = {
    ru,
    // English has no dictionary yet. It resolves to the Russian one rather
    // than to blank strings: an untranslated interface is usable, an empty one
    // is not.
    en: ru,
}

export const DEFAULT_LANGUAGE: Language = 'ru'

/** The language this browser should be spoken to in. */
export function currentLanguage(): Language {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE

    try {
        const stored = JSON.parse(localStorage.getItem('user') ?? '{}')
        const preference = stored?.settings?.language
        if (preference === 'ru' || preference === 'en') return preference
    } catch {
        // No stored profile, or unreadable storage.
    }

    const browser = typeof navigator !== 'undefined' ? navigator.language : ''
    return browser.startsWith('en') ? 'en' : DEFAULT_LANGUAGE
}

/** The message for an error code the API returned. */
export function messageForCode(code: string, language: Language = currentLanguage()): string | null {
    const errors = dictionaries[language].errors as Record<string, string>
    return errors[code] ?? null
}

/** Every code this client can render, for the completeness check. */
export function knownErrorCodes(): string[] {
    return Object.keys(ru.errors)
}

export function plural(count: number, forms: PluralForms, language: Language = currentLanguage()): string {
    return language === 'ru' ? pluralRu(count, forms) : pluralEn(count, forms)
}

/** A date, written the way the reader's language writes dates. */
export function formatDate(
    value: Date | string,
    language: Language = currentLanguage(),
    options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
): string {
    const date = typeof value === 'string' ? new Date(value) : value
    return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', options).format(date)
}

/** A number, with the reader's own separators. */
export function formatNumber(
    value: number,
    language: Language = currentLanguage(),
    options?: Intl.NumberFormatOptions
): string {
    return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-GB', options).format(value)
}

export { pluralRu, pluralEn }
export type { PluralForms, Dictionary }
