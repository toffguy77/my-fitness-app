'use client'

import { forwardRef } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader'
import { WebSocketProvider } from '@/features/chat'
import { CuratorFooterNavigation } from './CuratorFooterNavigation'
import { cn } from '@/shared/utils/cn'
import type { CuratorNavigationItemId } from '../types'

export interface CuratorLayoutProps {
    children: React.ReactNode
    userName: string
    avatarUrl?: string
    activeNavItem?: CuratorNavigationItemId
    onNavigate?: (itemId: CuratorNavigationItemId) => void
    className?: string
}

/**
 * CuratorLayout component
 *
 * Container layout for coordinator-role users.
 * Reuses DashboardHeader and provides curator-specific footer navigation.
 */
export const CuratorLayout = forwardRef<HTMLDivElement, CuratorLayoutProps>(
    ({
        children,
        userName,
        avatarUrl,
        activeNavItem = 'clients',
        onNavigate,
        className
    }, ref) => {
        const router = useRouter()

        const handleLogoClick = () => {
            router.push('/curator')
        }

        const handleAvatarClick = () => {
            router.push('/profile')
        }

        const handleNotificationClick = () => {
            router.push('/notifications')
        }

        return (
            <WebSocketProvider>
                <div
                    ref={ref}
                    className={cn(
                        'min-h-screen',
                        'w-full max-w-full overflow-x-hidden',
                        'bg-gray-50',
                        'transition-all duration-300 ease-in-out',
                        className
                    )}
                    data-testid="curator-layout"
                >
                    <DashboardHeader
                        userName={userName}
                        avatarUrl={avatarUrl}
                        onLogoClick={handleLogoClick}
                        onAvatarClick={handleAvatarClick}
                        onNotificationClick={handleNotificationClick}
                    />

                    <main
                        className="min-h-screen pt-16"
                        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
                        data-testid="curator-main-content"
                    >
                        {children}
                    </main>

                    <CuratorFooterNavigation
                        activeItem={activeNavItem}
                        onNavigate={onNavigate}
                    />
                </div>
            </WebSocketProvider>
        )
    }
)

CuratorLayout.displayName = 'CuratorLayout'
