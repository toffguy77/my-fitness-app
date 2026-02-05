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
    const router = useRouter()
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        // Check authentication (Requirement 10.1)
        const checkAuth = () => {
            // Check if token exists
            const token = typeof window !== 'undefined'
                ? localStorage.getItem('auth_token')
                : null

            // Redirect to login if not authenticated (Requirement 10.2)
            if (!token) {
                router.push('/auth')
                return
            }

            setIsAuthenticated(true)
            setIsLoading(false)
        }

        checkAuth()
    }, [router])

    // Show loading state while checking authentication
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                    <p className="text-gray-600">Загрузка...</p>
                </div>
            </div>
        )
    }

    // Don't render if not authenticated (will redirect)
    if (!isAuthenticated) {
        return null
    }

    return <NotificationsPageComponent />
}
