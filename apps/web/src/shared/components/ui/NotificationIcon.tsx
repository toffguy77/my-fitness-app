import { forwardRef } from 'react'
import { Bell } from 'lucide-react'
import { cn } from '@/shared/utils/cn'

export interface NotificationIconProps {
    count?: number
    onClick?: () => void
    className?: string
}

/**
 * Колокольчик в шапке — кнопка-иконка 44 px, как `IconButton` без подложки.
 *
 * Непрочитанное — точкой бренда с числом: это единственный «зовущий» элемент
 * шапки. Красный здесь сообщал бы об ошибке, которой нет.
 */
export const NotificationIcon = forwardRef<HTMLButtonElement, NotificationIconProps>(
    ({ count = 0, onClick, className }, ref) => {
        const baseStyles = cn(
            'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus',
        )
        const interactiveStyles = onClick ? 'cursor-pointer touch-manipulation hover:bg-subtle' : ''

        const content = (
            <>
                <Bell className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" />
                {count > 0 && (
                    <span
                        className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none tabular-nums text-on-primary ring-2 ring-canvas"
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
                    type="button"
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
