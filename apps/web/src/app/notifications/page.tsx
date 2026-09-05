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

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSession } from '@/shared/hooks/useSession'

// Dynamically import NotificationsPage component for code splitting (Requirement 9.1)
const NotificationsPageComponent = dynamic(
    () => import('@/features/notifications/components/NotificationsPage').then(mod => ({ default: mod.NotificationsPage })),
    {
        loading: () => (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                    <p className="text-gray-600">Загрузка уведомлений...</p>
                </div>
            </div>
        ),
        ssr: false, // Disable SSR for this component since it requires client-side auth
    }
)

export default function NotificationsPage() {
    // Signed-out visitors are redirected by middleware.ts before this page
    // renders. What is left is the wait while the session is minted from the
    // cookie — a real state, and showing the sign-in screen during it would
    // flash it at somebody who is signed in.
    const session = useSession()

    if (session === 'restoring') {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                    <p className="text-gray-600">Загрузка...</p>
                </div>
            </div>
        )
    }

    if (session !== 'authenticated') {
        return null
    }

    return <NotificationsPageComponent />
}
