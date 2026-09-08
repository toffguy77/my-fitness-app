import type { Dictionary } from './ru'

/** Every branch optional: a translation arrives key by key, not all at once. */
type Partial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] }

/**
 * English.
 *
 * Empty on purpose. Nothing here has been translated yet, and every key falls
 * back to the Russian one, so the interface stays readable rather than turning
 * into blank space while the work is done.
 *
 * Filling a key in is the whole procedure: no component changes, no
 * registration step. i18nReadiness.test.ts holds that promise.
 */
export const en: Partial<Dictionary> = {}
