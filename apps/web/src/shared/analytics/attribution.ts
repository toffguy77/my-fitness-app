'use client'

import { callCounter, counterId } from './counter'

/**
 * Where the visitor came from.
 *
 * `document.referrer` used to answer this and never could: empty for a direct
 * visit, the ad network's own domain for a paid click. The question actually
 * asked is "which campaign", and the answer is in the query string of the link
 * they followed.
 */

const STORAGE_KEY = 'analytics_attribution'

/** Campaign tags, plus the identifier the ad network puts on a paid click. */
export interface Attribution {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
    yandex_click_id?: string
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** Trims the values a query string can carry into a record without surprises. */
const LIMIT = 200

function readFromQuery(search: string): Attribution {
    const params = new URLSearchParams(search)
    const found: Attribution = {}

    for (const key of UTM_KEYS) {
        const value = params.get(key)?.trim()
        if (value) found[key] = value.slice(0, LIMIT)
    }

    // Separate from the tags on purpose: anybody can put a utm_ on a link,
    // including us in our own letters. `yclid` is set by the ad network, and it
    // is what ties a conversion back to a click that was paid for.
    const yclid = params.get('yclid')?.trim()
    if (yclid) found.yandex_click_id = yclid.slice(0, LIMIT)

    return found
}

/**
 * Remembers the tags of this arrival, and returns what is known.
 *
 * Session storage rather than local: the tags belong to one arrival on the
 * site. In local storage they would outlive it by a month and attach last
 * month's campaign to a lead saved today.
 *
 * Called on every page; only the first call of an arrival stores anything, so
 * the tags survive the client-side navigations of the wizard — by the contact
 * step the query string is long gone from the address bar, and without this
 * everybody who got past the first screen would be attributed to nobody.
 */
export function captureAttribution(search?: string): Attribution {
    if (typeof window === 'undefined') return {}

    const fromQuery = readFromQuery(search ?? window.location.search)

    try {
        const stored = sessionStorage.getItem(STORAGE_KEY)
        if (stored) return JSON.parse(stored) as Attribution

        if (Object.keys(fromQuery).length > 0) {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromQuery))
        }
        return fromQuery
    } catch {
        // Private browsing refuses storage. The lead is still saved, without
        // attribution — the contact matters more than knowing where it came
        // from.
        return fromQuery
    }
}

/** What was captured for this arrival, without touching the query string. */
export function storedAttribution(): Attribution {
    if (typeof window === 'undefined') return {}

    try {
        const stored = sessionStorage.getItem(STORAGE_KEY)
        return stored ? (JSON.parse(stored) as Attribution) : {}
    } catch {
        return {}
    }
}

/**
 * Asks the counter for this browser's identifier.
 *
 * Asynchronous, through a callback, and the callback never fires when the
 * counter is blocked or was never allowed — so this resolves to undefined
 * rather than waiting. Nothing may depend on it arriving: a lead that waited
 * for it would not be saved at all for anybody running an ad blocker.
 */
export function counterClientId(timeoutMs = 3000): Promise<string | undefined> {
    if (!counterId()) return Promise.resolve(undefined)

    return new Promise((resolve) => {
        let settled = false
        const finish = (value?: string) => {
            if (settled) return
            settled = true
            resolve(value)
        }

        const timer = setTimeout(() => finish(undefined), timeoutMs)

        callCounter('getClientID', (clientId: unknown) => {
            clearTimeout(timer)
            finish(typeof clientId === 'string' && clientId ? clientId : undefined)
        })
    })
}

/** Test seam: forgets this arrival's tags. */
export function resetAttributionForTests(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY)
    } catch {
        // Nothing stored, nothing to forget.
    }
}
