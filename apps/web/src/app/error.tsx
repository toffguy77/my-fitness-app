'use client'

import { useEffect, useMemo } from 'react'
import { ErrorState } from '@/shared/components/ErrorState'
import { generateErrorId } from '@/shared/errors/errorId'
import { reportError } from '@/shared/errors/reportError'

export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const errorId = useMemo(() => generateErrorId(), [error])

    useEffect(() => {
        reportError(error, { source: 'route-error', errorId, digest: error.digest })
    }, [error, errorId])

    return <ErrorState errorId={errorId} onRetry={reset} debugDetail={error.stack} />
}
