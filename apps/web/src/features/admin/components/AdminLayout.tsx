'use client'

import { forwardRef } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader'
import { AdminFooterNavigation } from './AdminFooterNavigation'
import { cn } from '@/shared/utils/cn'
import type { AdminNavigationItemId } from '../types'

export interface AdminLayoutProps {
    children: React.ReactNode
    userName: string
    avatarUrl?: string
    activeNavItem?: AdminNavigationItemId
    onNavigate?: (itemId: AdminNavigationItemId) => void
    className?: string
}

export const AdminLayout = forwardRef<HTMLDivElement, AdminLayoutProps>(
    ({
        children,
        userName,
        avatarUrl,
        activeNavItem = 'dashboard',
        onNavigate,
        className
    }, ref) => {
        const router = useRouter()

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
                    'min-h-screen',
                    'w-full max-w-full overflow-x-hidden',
                    'bg-gray-50',
                    'transition-all duration-300 ease-in-out',
                    className
                )}
                data-testid="admin-layout"
            >
                <DashboardHeader
                    userName={userName}
                    avatarUrl={avatarUrl}
                    onAvatarClick={handleAvatarClick}
                    onNotificationClick={handleNotificationClick}
                />

                <main
                    className="min-h-screen pt-16"
                    style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
                    data-testid="admin-main-content"
                >
                    {children}
                </main>

                <AdminFooterNavigation
                    activeItem={activeNavItem}
                    onNavigate={onNavigate}
                />
            </div>
        )
    }
)

AdminLayout.displayName = 'AdminLayout'
