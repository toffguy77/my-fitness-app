'use client'

import { analyticsChoice } from '@/shared/components/CookieConsent'

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
