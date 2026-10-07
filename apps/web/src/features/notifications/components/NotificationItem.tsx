/**
 * NotificationItem Component
 *
 * Displays a single notification with icon, title, content preview, and timestamp.
 * Supports read/unread styling and click-to-mark-as-read interaction.
 */

import { useRouter } from 'next/navigation';
import type { Notification } from '../types';
import { NotificationIcon } from './NotificationIcon';
import { formatRelativeTime } from '../utils/formatTimestamp';
import { cn } from '@/shared/utils/cn';

export interface NotificationItemProps {
    /** Notification data to display */
    notification: Notification;
    /** Callback when notification is clicked to mark as read */
    onMarkAsRead: (id: string) => void;
}

/**
 * NotificationItem component renders a single notification entry
 *
 * Features:
 * - Displays icon, title, content preview, and timestamp
 * - Visual distinction between read and unread notifications
 * - Click handler to mark as read
 * - Keyboard interaction support (Enter/Space)
 * - ARIA attributes for accessibility
 *
 * @example
 * <NotificationItem
 *   notification={notification}
 *   onMarkAsRead={(id) => {}}
 * />
 */
export function NotificationItem({
    notification,
    onMarkAsRead,
}: NotificationItemProps) {
    const router = useRouter();
    const isUnread = !notification.readAt;

    const handleClick = () => {
        if (isUnread) {
            onMarkAsRead(notification.id);
        }
        if (notification.actionUrl) {
            router.push(notification.actionUrl);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        // Support Enter and Space keys for keyboard interaction
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
        }
    };

    // Строка списка: ≥ 56 px, без подложки. Непрочитанное отличает маленькая
    // терракотовая точка и полужирный заголовок, а не заливка всей строки:
    // терракота — только у главного действия и активного, а прочитанное не
    // бледнеет прозрачностью (она роняла контраст ниже 4.5:1), а переходит
    // во вторичный цвет текста.
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            aria-label={`${notification.title}. ${isUnread ? 'Unread notification' : 'Read notification'}. ${formatRelativeTime(notification.createdAt)}`}
            aria-describedby={`notification-content-${notification.id}`}
            data-unread={isUnread || undefined}
            className={cn(
                'group flex min-h-14 cursor-pointer gap-3 px-4 py-3.5 transition-colors',
                'hover:bg-subtle/60',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
            )}
        >
            {/* Icon */}
            <div className="flex-shrink-0" aria-hidden="true">
                <NotificationIcon
                    type={notification.type}
                    iconUrl={notification.iconUrl}
                />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
                {/* Title */}
                <h3
                    className={cn(
                        'text-[15px] leading-[22px] text-fg',
                        isUnread ? 'font-semibold' : 'font-normal',
                    )}
                >
                    {notification.title}
                </h3>

                {/* Content preview */}
                <p
                    id={`notification-content-${notification.id}`}
                    className={cn(
                        'mt-0.5 line-clamp-2 text-sm',
                        isUnread ? 'text-fg' : 'text-fg-muted',
                    )}
                >
                    {notification.content}
                </p>

                {/* Timestamp */}
                <time
                    dateTime={notification.createdAt}
                    className="mt-1 block text-xs text-fg-subtle tabular-nums"
                    aria-label={`Notification time: ${formatRelativeTime(notification.createdAt)}`}
                >
                    {formatRelativeTime(notification.createdAt)}
                </time>
            </div>

            {/* Unread indicator dot */}
            {isUnread && (
                <div
                    className="flex-shrink-0 pt-2"
                    aria-hidden="true"
                    role="presentation"
                >
                    <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
            )}
        </div>
    );
}
