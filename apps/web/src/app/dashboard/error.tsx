'use client'

import { useEffect, useMemo } from 'react'
import { ErrorState } from '@/shared/components/ErrorState'
import { generateErrorId } from '@/shared/errors/errorId'
import { reportError } from '@/shared/errors/reportError'

export default function SegmentError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    // Derived during render so the effect only reports; setting state inside
    // the effect would trigger a cascading re-render.
    // A new id for a new error: the dependency is the error's identity, not
    // anything the callback reads, which is why the rule calls it unnecessary.
    // A second failure inside the same boundary is a separate incident and gets
    // its own id to report.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `error` is the key, deliberately
    const errorId = useMemo(() => generateErrorId(), [error])

    useEffect(() => {
        reportError(error, { source: 'route-error', segment: 'dashboard', errorId, digest: error.digest })
    }, [error, errorId])

    return <ErrorState errorId={errorId} onRetry={reset} debugDetail={error.stack} />
}
