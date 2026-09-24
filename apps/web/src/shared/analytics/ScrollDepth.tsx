'use client'

import { useEffect, useRef } from 'react'
import { startAnalytics, track } from './client'
import { EVENTS } from './events'

/**
 * How far down the page people actually get.
 *
 * This replaces Metrika's scroll map, which went out with the session
 * recording — one option carried both, and the recording wrote what is typed
 * into the onboarding fields.
 *
 * The replacement is better in the way that matters: the answer lands in our
 * own table, where it can be grouped by source and cohort, and it does not
 * depend on anybody agreeing to a third party's cookies.
 */

/**
 * Four of them, not a percentage. A report groups by a handful of values; a
 * raw number would be a hundred rows nobody reads. The server refuses anything
 * outside this set, and this is the list it refuses against.
 */
const THRESHOLDS = [25, 50, 75, 100] as const

/** How far down the page the viewport currently reaches, as a percentage. */
function depthReached(): number {
    const scrollable = document.documentElement.scrollHeight
    if (scrollable <= 0) return 100

    const seen = window.scrollY + window.innerHeight

    // A page that fits on the screen has been read to the end the moment it is
    // shown. Reporting nothing for it would read as "nobody got past the top",
    // which is the opposite of what happened.
    if (seen >= scrollable) return 100

    return (seen / scrollable) * 100
}

export function TrackScrollDepth() {
    const sent = useRef(new Set<number>())

    useEffect(() => {
        startAnalytics()

        const reached = sent.current

        const report = () => {
            const depth = depthReached()

            for (const threshold of THRESHOLDS) {
                if (depth >= threshold && !reached.has(threshold)) {
                    reached.add(threshold)
                    track(EVENTS.landingScrollDepth, { depth: threshold })
                }
            }
        }

        // Once before any scrolling: otherwise a page that fits on the screen,
        // or one somebody lands on already scrolled, reports nothing at all.
        report()

        window.addEventListener('scroll', report, { passive: true })
        window.addEventListener('resize', report, { passive: true })

        return () => {
            window.removeEventListener('scroll', report)
            window.removeEventListener('resize', report)
        }
    }, [])

    return null
}
