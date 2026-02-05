/**
 * Notifications Layout
 *
 * Provides consistent layout structure for the notifications page.
 * Includes footer navigation for consistency with other authenticated pages.
 *
 * Requirements: 1.1
 */

'use client'

import { FooterNavigation } from '@/features/dashboard/components/FooterNavigation'
import type { NavigationItemId } from '@/features/dashboard/types'

export default function NotificationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const handleNavigate = (itemId: NavigationItemId) => {
        // Navigation is handled by the FooterNavigation component
    }

    return (
        <div className="flex flex-col min-h-screen">
            {/* Main content area with bottom padding for fixed footer */}
            <div className="flex-1 pb-16">
                {children}
            </div>

            {/* Fixed Footer Navigation (consistent with dashboard) */}
            <FooterNavigation
                activeItem="dashboard" // No specific notifications nav item yet
                onNavigate={handleNavigate}
            />
        </div>
    )
}
