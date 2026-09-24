'use client'

import { useEffect } from 'react'
import { captureAttribution } from './attribution'

/**
 * Captures the campaign tags of this arrival, once, on whatever page it lands.
 *
 * Mounted in the root layout rather than on the landing page: a paid link can
 * point anywhere, and by the time the wizard reaches its contact step the query
 * string is long gone from the address bar.
 *
 * Not gated on consent. The tags go to session storage and to our own
 * database; nothing is sent to a third party, and nothing here identifies a
 * person — it says which advertisement they followed.
 */
export function AttributionCapture() {
    useEffect(() => {
        captureAttribution()
    }, [])

    return null
}
