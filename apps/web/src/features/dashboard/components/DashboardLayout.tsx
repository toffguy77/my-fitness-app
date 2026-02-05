'use client'

import { forwardRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from './DashboardHeader'
import { MainContent } from './MainContent'
import { FooterNavigation } from './FooterNavigation'
import { cn } from '@/shared/utils/cn'
import { useNotificationsStore } from '@/features/notifications'
import type { NavigationItemId } from '../types'

export interface DashboardLayoutProps {
    children: React.ReactNode
    userName: string
    avatarUrl?: string
    notificationCount?: number
    activeNavItem?: NavigationItemId
    onNavigate?: (itemId: NavigationItemId) => void
    className?: string
}

/**
 * DashboardLayout component
 *
 * Container component that orchestrates the header, main content, and footer navigation.
 * Implements a full viewport height flexbox layout with fixed header and footer,
 * and scrollable main content area.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.3
 */
export const DashboardLayout = forwardRef<HTMLDivElement, DashboardLayoutProps>(
    ({
        children,
        userName,
        avatarUrl,
        notificationCount,
        activeNavItem = 'dashboard',
        onNavigate,
        className
    }, ref) => {
        const router = useRouter()
        const { unreadCounts, fetchUnreadCounts, startPolling, stopPolling } = useNotificationsStore()

        // Calculate total unread count
        const totalUnreadCount = unreadCounts.main + unreadCounts.content

        // Fetch unread counts on mount and start polling
        useEffect(() => {
            fetchUnreadCounts()
            startPolling()

            return () => {
                stopPolling()
            }
        }, [fetchUnreadCounts, startPolling, stopPolling])

        const handleAvatarClick = () => {
            router.push('/profile')
        }

        const handleNotificationClick = () => {
            router.push('/notifications')
        }

        return (
            <div
                ref={ref}
                className={cn(
                    // Full viewport height flexbox layout (Requirement 3.1, 4.1)
                    'flex flex-col',
                    'min-h-screen h-screen',
                    // Prevent overflow on the container
                    'overflow-hidden',
                    className
                )}
                data-testid="dashboard-layout"
            >
                {/* Fixed Header at top (Requirement 3.1) */}
                <DashboardHeader
                    userName={userName}
                    avatarUrl={avatarUrl}
                    notificationCount={totalUnreadCount}
                    onAvatarClick={handleAvatarClick}
                    onNotificationClick={handleNotificationClick}
                />

                {/* Scrollable Main Content Area (Requirement 3.1, 4.3) */}
                {/* Add top padding to account for fixed header (64px = h-16) */}
                {/* Add bottom padding to account for fixed footer (64px = h-16) */}
                <div className="flex-grow overflow-hidden pt-16 pb-16">
                    <MainContent>
                        {children}
                    </MainContent>
                </div>

                {/* Fixed Footer Navigation at bottom (Requirement 3.1) */}
                <FooterNavigation
                    activeItem={activeNavItem}
                    onNavigate={onNavigate}
                />
            </div>
        )
    }
)

DashboardLayout.displayName = 'DashboardLayout'
