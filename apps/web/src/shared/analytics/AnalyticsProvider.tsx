'use client'

import { useEffect } from 'react'
import { startAnalytics, track } from './client'
import type { EventName, EventProperties } from './events'

/**
 * Starts the batching and records one event for the screen that mounted it.
 *
 * A component rather than a hook call in each page so that "this screen was
 * seen" is one line wherever it is needed.
 */
export function TrackView({
    event,
    properties,
}: {
    event: EventName
    properties?: EventProperties
}) {
    useEffect(() => {
        startAnalytics()
        track(event, properties)
        // The view is recorded once per mount, not on every property change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event])

    return null
}
