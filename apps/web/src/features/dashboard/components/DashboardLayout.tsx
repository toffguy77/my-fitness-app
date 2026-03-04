'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from './DashboardHeader'
import { FooterNavigation } from './FooterNavigation'
import { OfflineIndicator } from './OfflineIndicator'
import { cn } from '@/shared/utils/cn'
import { WebSocketProvider } from '@/features/chat'
import { useNotificationsStore } from '@/features/notifications'
import { useContentNotificationWS } from '@/features/notifications/hooks/useContentNotificationWS'
import { NotificationDropdown } from '@/features/notifications/components/NotificationDropdown'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
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
 * and scrollable main content area. Handles orientation changes smoothly.
 *
 * Requirements: 3.1, 4.1, 4.2, 4.3, 12.6
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

        // Monitor online/offline status
        useOnlineStatus()

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

        // Listen for content notification WebSocket events
        useContentNotificationWS()

        // Handle orientation changes (Requirement 12.6)
        useEffect(() => {
            let timeoutId: NodeJS.Timeout

            const handleOrientationChange = () => {
                // Add a small delay to allow the browser to complete the orientation change
                // This ensures smooth adaptation within 300ms
                timeoutId = setTimeout(() => {
                    // Force a reflow to ensure layout adapts properly
                    window.dispatchEvent(new Event('resize'))
                }, 50)
            }

            // Listen for orientation change events
            window.addEventListener('orientationchange', handleOrientationChange)
            // Also listen for resize as a fallback
            window.addEventListener('resize', handleOrientationChange)

            return () => {
                window.removeEventListener('orientationchange', handleOrientationChange)
                window.removeEventListener('resize', handleOrientationChange)
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
            }
        }, [])

        const handleLogoClick = () => {
            router.push('/dashboard')
        }

        const handleAvatarClick = () => {
            router.push('/profile')
        }

        const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)

        const handleNotificationClick = () => {
            setShowNotificationDropdown((prev) => !prev)
        }

        return (
            <WebSocketProvider>
                <div
                    ref={ref}
                    className={cn(
                        // Minimum full viewport height (Requirement 3.1, 4.1)
                        'min-h-screen',
                        // Ensure full width and prevent horizontal scrolling (Requirement 12.5)
                        'w-full max-w-full overflow-x-hidden',
                        // Background color
                        'bg-gray-50',
                        // Smooth transitions for orientation changes (Requirement 12.6)
                        'transition-all duration-300 ease-in-out',
                        className
                    )}
                    data-testid="dashboard-layout"
                >
                    {/* Fixed Header at top (Requirement 3.1) */}
                    <div className="relative">
                        <DashboardHeader
                            userName={userName}
                            avatarUrl={avatarUrl}
                            notificationCount={totalUnreadCount}
                            onLogoClick={handleLogoClick}
                            onAvatarClick={handleAvatarClick}
                            onNotificationClick={handleNotificationClick}
                        />
                        {showNotificationDropdown && (
                            <NotificationDropdown onClose={() => setShowNotificationDropdown(false)} />
                        )}
                    </div>

                    {/* Main Content Area (Requirement 3.1, 4.3) */}
                    {/* Padding top/bottom to account for fixed header (64px) and footer (64px + safe area) */}
                    <main
                        className="min-h-screen pt-16"
                        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
                        data-testid="main-content"
                    >
                        {children}
                    </main>

                    {/* Fixed Footer Navigation at bottom (Requirement 3.1) */}
                    <FooterNavigation
                        activeItem={activeNavItem}
                        onNavigate={onNavigate}
                    />

                    {/* Offline Indicator (Requirement 13.4, 13.5) */}
                    <OfflineIndicator />
                </div>
            </WebSocketProvider>
        )
    }
)

DashboardLayout.displayName = 'DashboardLayout'
