import { forwardRef } from 'react'
import { AppLogo } from '@/shared/components/ui/AppLogo'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { NotificationIcon } from '@/shared/components/ui/NotificationIcon'
import { cn } from '@/shared/utils/cn'

export interface DashboardHeaderProps {
    userName: string
    avatarUrl?: string
    notificationCount?: number
    onLogoClick?: () => void
    onAvatarClick: () => void
    onNotificationClick: () => void
    className?: string
}

export const DashboardHeader = forwardRef<HTMLElement, DashboardHeaderProps>(
    ({ userName, avatarUrl, notificationCount, onLogoClick, onAvatarClick, onNotificationClick, className }, ref) => {
        return (
            <header
                ref={ref}
                className={cn(
                    'fixed top-0 left-0 right-0 z-50',
                    'flex items-center justify-between',
                    'h-16 px-4',
                    'bg-white border-b border-gray-200',
                    'shadow-sm',
                    className
                )}
                data-testid="dashboard-header"
            >
                {/* Left: App Logo */}
                <div className="flex items-center">
                    <AppLogo size="sm" onClick={onLogoClick} />
                </div>

                {/* Right: User Avatar and Notifications */}
                <div className="flex items-center gap-3">
                    <NotificationIcon
                        count={notificationCount}
                        onClick={onNotificationClick}
                    />
                    <UserAvatar
                        name={userName}
                        avatarUrl={avatarUrl}
                        size="md"
                        onClick={onAvatarClick}
                    />
                </div>
            </header>
        )
    }
)

DashboardHeader.displayName = 'DashboardHeader'
