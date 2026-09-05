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

/**
 * The language this browser should be spoken to in.
 *
 * The user's own setting decides. The browser's language deliberately does
 * not: while `en` resolves to the Russian dictionary, honouring it would give
 * a Russian sentence an English date — the interface would be inconsistent
 * with itself for anyone whose browser is in English. When a real second
 * dictionary exists, `Accept-Language` becomes a sensible default and this is
 * the place to add it.
 */
export function currentLanguage(): Language {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE

    try {
        const stored = JSON.parse(localStorage.getItem('user') ?? '{}')
        const preference = stored?.settings?.language
        if (preference === 'ru' || preference === 'en') return preference
    } catch {
        // No stored profile, or unreadable storage.
    }

    return DEFAULT_LANGUAGE
}

/**
 * The text for a key, with any values it interpolates.
 *
 * A missing key returns the key itself and complains: a blank space where a
 * sentence should be is the one outcome that helps nobody — not the reader,
 * not the person who forgot to add it.
 */
export function t(
    key: string,
    params?: Record<string, string | number>,
    language: Language = currentLanguage()
): string {
    const value = key.split('.').reduce<unknown>(
        (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
        dictionaries[language]
    )

    if (typeof value !== 'string') {
        console.warn(`[i18n] missing key "${key}"`)
        return key
    }

    if (!params) return value

    return value.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in params ? String(params[name]) : whole
    )
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
