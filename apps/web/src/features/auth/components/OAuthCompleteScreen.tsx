'use client'

/**
 * The last step of an external sign-in.
 *
 * The callback set an HttpOnly refresh cookie — deliberately unreadable here —
 * so this screen exchanges it for a session the app can use.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { providersApi } from '@/features/auth/api/providers'
import { storeSession, destinationFor } from '@/features/auth/utils/session'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'
import { AuthShell } from './AuthShell'

export function OAuthCompleteScreen() {
    const router = useRouter()
    const [failed, setFailed] = useState(false)
    // React runs effects twice in development; exchanging the cookie twice
    // would spend a single-use token on nothing.
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true

        providersApi
            .complete()
            .then((response) => {
                storeSession(response)
                router.replace(destinationFor(response.user))
            })
            .catch(() => setFailed(true))
    }, [router])

    if (failed) {
        return (
            <AuthShell centered className="text-center">
                <p className="type-title-2 text-fg">{t('auth.oauth.completeFailedTitle')}</p>
                <p className="mt-3 type-body text-fg-muted">
                    {t('auth.oauth.completeFailedHint')}
                </p>
                <Button onClick={() => router.replace('/auth')} size="lg" block className="mt-8">
                    {t('auth.oauth.backToSignIn')}
                </Button>
            </AuthShell>
        )
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-canvas" aria-busy="true">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
            <span className="sr-only">{t('auth.oauth.completing')}</span>
        </main>
    )
}
