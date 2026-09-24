'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { callCounter, counterAllowed } from '@/shared/analytics/counter'

/**
 * Reports client-side navigations to the counter.
 *
 * The counter does not see them by itself. It sends one page view when it
 * initialises and nothing afterwards, so in an App Router application every
 * screen a person reaches without a reload was invisible: the report held the
 * landing page, the sign-in page and the wizard as if nobody ever moved
 * between them, and a visit of three screens counted as a bounce.
 *
 * One component watching the path, rather than a call on each page: a call per
 * page would be forgotten by the first page added after this one, and the
 * funnel would break again in exactly the way it is being fixed.
 */
export function MetrikaRouteHits() {
    const pathname = usePathname()

    // The first path is the one the counter already reported when it
    // initialised. Sending it again would give every landing two views for one
    // visit, halve the bounce rate for no reason, and leave the next person to
    // read the report believing something had improved.
    const reported = useRef<string | null>(null)

    useEffect(() => {
        if (!pathname) return

        if (reported.current === null) {
            reported.current = pathname
            return
        }

        if (reported.current === pathname) return
        reported.current = pathname

        if (!counterAllowed()) return

        // The query string is read here rather than through useSearchParams:
        // that hook would require a Suspense boundary around a component that
        // lives in the root layout, and this needs no boundary to get the same
        // value. Campaign tags live in the query, so the hit carries it.
        callCounter('hit', pathname + window.location.search)
    }, [pathname])

    return null
}
