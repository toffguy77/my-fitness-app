import { forwardRef } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/shared/utils/cn'

export interface NotificationIconProps {
    count?: number
    onClick?: () => void
    className?: string
}

export const NotificationIcon = forwardRef<HTMLButtonElement, NotificationIconProps>(
    ({ count = 0, onClick, className }, ref) => {
        const baseStyles = 'relative inline-flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600'
        const interactiveStyles = onClick ? 'cursor-pointer hover:bg-gray-100' : ''

        const content = (
            <>
                <Bell className="h-6 w-6 text-gray-700" aria-hidden="true" />
                {count > 0 && (
                    <span
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
                        data-testid="notification-badge"
                        aria-label={`${count} unread notifications`}
                    >
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </>
        )

        if (onClick) {
            return (
                <button
                    ref={ref}
                    onClick={onClick}
                    className={cn(baseStyles, interactiveStyles, className)}
                    aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'}
                    data-testid="notification-icon"
                >
                    {content}
                </button>
            )
        }

        return (
            <div
                className={cn(baseStyles, className)}
                aria-label="Notifications"
                data-testid="notification-icon"
            >
                {content}
            </div>
        )
    }
)

NotificationIcon.displayName = 'NotificationIcon'
