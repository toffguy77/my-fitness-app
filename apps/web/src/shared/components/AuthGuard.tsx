'use client'

/**
 * Renders its children only for somebody with a session.
 *
 * It used to ask `isAuthenticated()` once, in an effect, and send anybody
 * without a token to the sign-in page. That was right while the token lived in
 * localStorage and was there the instant the page loaded. It is wrong now: the
 * access token lives in memory, does not survive a reload, and is minted from
 * the cookie a moment later — so the honest first answer is "not yet known",
 * and treating it as "not signed in" bounced every signed-in person off every
 * page they reloaded.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { useSession } from '@/shared/hooks/useSession'
import { t } from '@/shared/i18n'
import { SegmentLoading } from './SegmentLoading'

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const session = useSession()

    useEffect(() => {
        if (session === 'anonymous') {
            router.replace('/auth')
        }
    }, [session, router])

    // Пока сессия не известна — тот же спиннер, что у загрузки сегмента:
    // один вид ожидания на всё приложение.
    if (session !== 'authenticated') {
        return <SegmentLoading label={t('common.loading')} />
    }

    return <>{children}</>
}
