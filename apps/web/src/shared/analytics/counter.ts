'use client'

import { analyticsChoice, CONSENT_EVENT } from '@/shared/components/CookieConsent'

/**
 * The web analytics counter: whether there is one, and how to talk to it.
 *
 * One place rather than three, because three components need the same two
 * answers and the wrong answer in any of them means either a counter that
 * never loads or one that loads without being allowed to.
 */

/**
 * The counter id, or undefined where there is none.
 *
 * Read inside a function on purpose. Next inlines `process.env.NEXT_PUBLIC_*`
 * wherever the literal appears, so this behaves exactly as a module constant in
 * a build — but under test it can be set, and `.env.local` is not loaded when
 * NODE_ENV is `test`.
 */
export function counterId(): string | undefined {
    return process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || undefined
}

/**
 * Whether the counter may run: there is one, and the visitor agreed to it.
 *
 * The consent itself lives in CookieConsent, which already gates the counter
 * script. This is the same question asked from the places that talk to the
 * counter directly — a page view on navigation, a goal, the browser id.
 *
 * Dev carries no counter id at all, which is what keeps E2E runs out of the
 * production statistics.
 */
export function counterAllowed(): boolean {
    return Boolean(counterId()) && analyticsChoice() === 'granted'
}

type Ym = (id: string | number, action: string, ...rest: unknown[]) => void

/**
 * Calls the counter if it is there.
 *
 * Never throws: an ad blocker, a refusal and a slow script all look the same
 * from here, and none of them is a reason for a screen to break.
 */
export function callCounter(action: string, ...rest: unknown[]): void {
    const id = counterId()
    if (!id) return

    const ym = (window as unknown as { ym?: Ym }).ym
    if (typeof ym !== 'function') return

    try {
        ym(id, action, ...rest)
    } catch {
        // Analytics does not get to break a page.
    }
}

/**
 * Fired by the counter snippet right after `ym(id, "init")`: from then on a
 * goal lands in the counter's own queue behind the init, whether or not
 * tag.js has arrived yet.
 */
export const METRIKA_READY_EVENT = 'burcev:metrika-ready'

/** A page does not reach this many goals; the cap is against a loop. */
const MAX_PENDING_GOALS = 20

let pendingGoals: string[] = []

function counterReady(): boolean {
    return (
        counterAllowed() &&
        typeof (window as unknown as { ym?: unknown }).ym === 'function'
    )
}

/**
 * Reports a goal to the counter — now, or as soon as it may run.
 *
 * Goals used to be called straight into `window.ym` and dropped when it was
 * not there, and it almost never was: the page's first effects run a few
 * milliseconds before the counter snippet (next/script, afterInteractive), and
 * on a first visit before the person has answered the consent banner at all.
 * landing_viewed reached the counter once or twice a week while the event
 * itself arrived in our own batches on every visit.
 *
 * So a goal that comes too early waits here — in memory, for this page only,
 * never in storage — and leaves when the snippet says the counter is up. Until
 * the person agrees, nothing is sent; if they refuse, the queue is dropped.
 */
export function reachGoal(name: string): void {
    if (typeof window === 'undefined' || !counterId()) return
    if (analyticsChoice() === 'denied') return

    if (counterReady()) {
        callCounter('reachGoal', name)
        return
    }
    if (pendingGoals.length < MAX_PENDING_GOALS) pendingGoals.push(name)
}

function sendPendingGoals(): void {
    if (!counterReady()) return
    const goals = pendingGoals
    pendingGoals = []
    for (const name of goals) callCounter('reachGoal', name)
}

function dropPendingGoalsOnRefusal(): void {
    if (analyticsChoice() === 'denied') pendingGoals = []
}

if (typeof window !== 'undefined') {
    window.addEventListener(METRIKA_READY_EVENT, sendPendingGoals)
    window.addEventListener(CONSENT_EVENT, dropPendingGoalsOnRefusal)
}

/** Test seam: forgets goals waiting for the counter. */
export function resetPendingGoalsForTests(): void {
    pendingGoals = []
}
