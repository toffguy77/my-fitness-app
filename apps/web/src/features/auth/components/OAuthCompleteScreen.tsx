'use client'

/**
 * The last step of an external sign-in.
 *
 * The callback set an HttpOnly refresh cookie — deliberately unreadable here —
 * so this screen exchanges it for a session the app can use.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { providersApi } from '@/features/auth/api/providers'
import { storeSession, destinationFor } from '@/features/auth/utils/session'
import { t } from '@/shared/i18n'

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
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-sm text-fg">{t('auth.oauth.completeFailedTitle')}</p>
                <p className="text-sm text-fg-muted">
                    {t('auth.oauth.completeFailedHint')}
                </p>
                <button
                    onClick={() => router.replace('/auth')}
                    className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
                >
                    {t('auth.oauth.backToSignIn')}
                </button>
            </main>
        )
    }

    return (
        <main className="flex min-h-screen items-center justify-center" aria-busy="true">
            <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
            <span className="sr-only">{t('auth.oauth.completing')}</span>
        </main>
    )
}
