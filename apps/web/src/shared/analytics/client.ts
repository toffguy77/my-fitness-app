'use client'

/**
 * Sending product events.
 *
 * Events accumulate and leave in batches: one request for a dozen events rather
 * than a dozen requests. The last batch leaves through `sendBeacon`, because a
 * page that is closing does not stay alive for a fetch — and the events worth
 * having most are the ones just before somebody leaves.
 */

import type { EventName, EventProperties } from './events'

const VISITOR_KEY = 'analytics_visitor_id'
const ENDPOINT = '/api/v1/public/analytics/events'

/** How long events wait for company before being sent. */
const FLUSH_INTERVAL_MS = 10_000
/** A full batch leaves immediately; the server refuses anything larger. */
const MAX_BATCH = 50

interface QueuedEvent {
    name: EventName
    occurred_at: string
    properties?: EventProperties
}

let queue: QueuedEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let started = false

/**
 * This browser's identifier. Not personal data and not a secret: it exists so
 * the funnel does not break where it matters most — an anonymous visitor
 * becoming a registered user.
 */
export function visitorId(): string {
    if (typeof window === 'undefined') return ''

    try {
        const existing = localStorage.getItem(VISITOR_KEY)
        if (existing) return existing

        const created = crypto.randomUUID()
        localStorage.setItem(VISITOR_KEY, created)
        return created
    } catch {
        // Private browsing refuses storage; events from this visit simply do
        // not join up with any other, which is better than not sending them.
        return crypto.randomUUID()
    }
}

/** Records one event. Never throws: analytics must not break a screen. */
export function track(name: EventName, properties?: EventProperties): void {
    if (typeof window === 'undefined') return

    queue.push({ name, occurred_at: new Date().toISOString(), properties })

    if (queue.length >= MAX_BATCH) {
        flush()
        return
    }
    if (timer === null) {
        timer = setTimeout(flush, FLUSH_INTERVAL_MS)
    }
}

/** Sends whatever has accumulated. */
export function flush(): void {
    if (timer !== null) {
        clearTimeout(timer)
        timer = null
    }
    if (queue.length === 0 || typeof window === 'undefined') return

    const batch = {
        visitor_id: visitorId(),
        platform: 'web',
        app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
        events: queue,
    }
    queue = []

    const payload = JSON.stringify(batch)

    try {
        // Beacon first: it survives the page going away, which is exactly when
        // the most interesting events have just happened.
        if (navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: 'application/json' }))) {
            return
        }
        void fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
        }).catch(() => {})
    } catch {
        // A blocked or failed send costs a few events, nothing else.
    }
}

/** Starts the batching. Safe to call more than once. */
export function startAnalytics(): void {
    if (started || typeof window === 'undefined') return
    started = true

    // Both events: `pagehide` is the one that fires on mobile Safari, where
    // `beforeunload` does not.
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush()
    })
}

/** Test seam: forgets what has accumulated. */
export function resetAnalyticsForTests(): void {
    queue = []
    if (timer !== null) {
        clearTimeout(timer)
        timer = null
    }
    started = false
}
