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
    const errorId = useMemo(() => generateErrorId(), [error])

    useEffect(() => {
        reportError(error, { source: 'route-error', segment: 'admin', errorId, digest: error.digest })
    }, [error, errorId])

    return <ErrorState errorId={errorId} onRetry={reset} debugDetail={error.stack} />
}
