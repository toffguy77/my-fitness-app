'use client'

import { callCounter, counterAllowed } from './counter'

/**
 * Where the visitor came from — the first time.
 *
 * Campaign tags answer "which advertisement", but search and Dzen put no tags
 * on their links: a visitor from there arrives with an empty query string and
 * used to be attributed to nobody. So the external referrer is kept too, and
 * the page they landed on.
 *
 * And it is the first arrival that is kept, for thirty days. A reader who
 * finds an article through Dzen and comes back the next day by typing the
 * address registers "from nowhere" if only the current visit counts — which is
 * the ordinary path from content to a sign-up.
 */

/** Read by the server too, on every way into an account (leads.FirstTouchCookie). */
const COOKIE_NAME = 'first_touch'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60
/** The cookie travels with every request; it is kept small. */
const COOKIE_MAX_LENGTH = 1024

/** Campaign tags, the identifier the ad network puts on a paid click, and where the visit began. */
export interface Attribution {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
    yandex_click_id?: string
    /** The external page they followed a link from: origin and path, no query. */
    referrer?: string
    /** The first page they opened here. */
    landing_page?: string
}

/** What a page knows about how it was reached. */
export interface Arrival {
    search: string
    referrer: string
    path: string
    host: string
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** Trims the values a query string can carry into a record without surprises. */
const LIMIT = 200

/**
 * The page they came from, if it is somebody else's.
 *
 * Origin and path only: a query string can carry a search phrase or an email
 * address, and the path already tells a Dzen article from Dzen's front page.
 */
function externalReferrer(referrer: string, host: string): string | undefined {
    if (!referrer) return undefined
    try {
        const url = new URL(referrer)
        if (url.host === host) return undefined
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
        return `${url.origin}${url.pathname === '/' ? '/' : url.pathname}`.slice(0, LIMIT)
    } catch {
        return undefined
    }
}

function readArrival(arrival: Arrival): Attribution {
    const params = new URLSearchParams(arrival.search)
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

    const referrer = externalReferrer(arrival.referrer, arrival.host)
    if (referrer) found.referrer = referrer
    if (arrival.path) found.landing_page = arrival.path.slice(0, LIMIT)

    return found
}

function encode(record: Attribution): string {
    return encodeURIComponent(JSON.stringify(record))
}

/**
 * Shortens the longest value until the cookie fits. Cyrillic costs six bytes a
 * letter once encoded, so a limit per value is not enough on its own.
 */
function fitCookie(record: Attribution): Attribution {
    const fitted: Attribution = { ...record }
    while (encode(fitted).length > COOKIE_MAX_LENGTH) {
        const keys = Object.keys(fitted) as (keyof Attribution)[]
        const longest = keys.reduce((a, b) => ((fitted[a]?.length ?? 0) >= (fitted[b]?.length ?? 0) ? a : b))
        const value = fitted[longest] ?? ''
        if (value.length <= 1) {
            delete fitted[longest]
        } else {
            fitted[longest] = value.slice(0, Math.floor(value.length / 2))
        }
    }
    return fitted
}

function readCookie(): Attribution | null {
    const raw = document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${COOKIE_NAME}=`))
        ?.slice(COOKIE_NAME.length + 1)
    if (!raw) return null
    try {
        const parsed: unknown = JSON.parse(decodeURIComponent(raw))
        return parsed && typeof parsed === 'object' ? (parsed as Attribution) : null
    } catch {
        return null
    }
}

function writeCookie(record: Attribution): void {
    const secure = window.location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${COOKIE_NAME}=${encode(record)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`
}

function currentArrival(): Arrival {
    return {
        search: window.location.search,
        referrer: document.referrer,
        path: window.location.pathname,
        host: window.location.host,
    }
}

/**
 * Records the first touch if there is none, and returns what is known.
 *
 * Called on every page; only the first arrival in thirty days stores anything.
 * When the cookie cannot be kept, the tags of this arrival are still returned,
 * so a lead saved right now is not attributed to nobody.
 */
export function captureAttribution(arrival?: Arrival): Attribution {
    if (typeof window === 'undefined') return {}

    const existing = readCookie()
    if (existing) return existing

    const found = fitCookie(readArrival(arrival ?? currentArrival()))
    writeCookie(found)
    return found
}

/** The first touch, without recording anything. */
export function storedAttribution(): Attribution {
    if (typeof window === 'undefined') return {}
    return readCookie() ?? {}
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
    // Согласие проверяется здесь, а не только внутри callCounter. Без него
    // скрипта счётчика на странице нет, и вызов и так ничего бы не сделал —
    // но спрашивать счётчик об идентификаторе браузера это ровно то, чем
    // согласие и управляет, и опираться на «скрипта всё равно нет» значит
    // держать это правило неявным.
    if (!counterAllowed()) return Promise.resolve(undefined)

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

/** Test seam: forgets the first touch. */
export function resetAttributionForTests(): void {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`
}
