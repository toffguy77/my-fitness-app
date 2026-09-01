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
                <p className="text-sm text-gray-900">Не удалось завершить вход</p>
                <p className="text-sm text-gray-600">
                    Попытка входа могла устареть. Попробуйте ещё раз.
                </p>
                <button
                    onClick={() => router.replace('/auth')}
                    className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                    Вернуться ко входу
                </button>
            </main>
        )
    }

    return (
        <main className="flex min-h-screen items-center justify-center" aria-busy="true">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="sr-only">Завершаем вход</span>
        </main>
    )
}
