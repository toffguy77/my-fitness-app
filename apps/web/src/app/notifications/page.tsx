/**
 * Notifications Page
 *
 * Displays user notifications in two categories: Main (personal) and Content (system).
 * Requires authentication - redirects to login if not authenticated.
 * Uses dynamic imports for code splitting and bundle optimization.
 *
 * Requirements: 10.1, 10.2, 9.1
 */

'use client'

import dynamic from 'next/dynamic'
import { useSession } from '@/shared/hooks/useSession'

import { t } from '@/shared/i18n'
// Dynamically import NotificationsPage component for code splitting (Requirement 9.1)
const NotificationsPageComponent = dynamic(
    () => import('@/features/notifications/components/NotificationsPage').then(mod => ({ default: mod.NotificationsPage })),
    {
        loading: () => (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true"></div>
                    <p className="text-sm text-fg-muted">{t('notifications.loadingList')}</p>
                </div>
            </div>
        ),
        ssr: false, // Disable SSR for this component since it requires client-side auth
    }
)

export default function NotificationsPage() {
    // Signed-out visitors are redirected by proxy.ts before this page
    // renders. What is left is the wait while the session is minted from the
    // cookie — a real state, and showing the sign-in screen during it would
    // flash it at somebody who is signed in.
    const session = useSession()

    if (session === 'restoring') {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true"></div>
                    <p className="text-sm text-fg-muted">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    if (session !== 'authenticated') {
        return null
    }

    return <NotificationsPageComponent />
}
