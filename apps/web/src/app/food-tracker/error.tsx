'use client'

import { useEffect, useState } from 'react'
import { ErrorState } from '@/shared/components/ErrorState'
import { reportError } from '@/shared/errors/reportError'

export default function SegmentError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const [errorId, setErrorId] = useState<string>('')

    useEffect(() => {
        setErrorId(reportError(error, { source: 'route-error', segment: 'food-tracker', digest: error.digest }))
    }, [error])

    return <ErrorState errorId={errorId} onRetry={reset} debugDetail={error.stack} />
}
