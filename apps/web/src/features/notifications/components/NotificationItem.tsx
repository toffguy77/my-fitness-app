/**
 * NotificationItem Component
 *
 * Displays a single notification with icon, title, content preview, and timestamp.
 * Supports read/unread styling and click-to-mark-as-read interaction.
 */

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
    const isUnread = !notification.readAt;

    const handleClick = () => {
        if (isUnread) {
            onMarkAsRead(notification.id);
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        // Support Enter and Space keys for keyboard interaction
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            aria-label={`${notification.title}. ${isUnread ? 'Unread notification' : 'Read notification'}. ${formatRelativeTime(notification.createdAt)}`}
            aria-describedby={`notification-content-${notification.id}`}
            className={cn(
                'flex gap-3 rounded-lg transition-colors',
                // Responsive padding and spacing (Requirement 6.1, 6.2, 6.3)
                'p-3',              // Mobile: compact padding
                'sm:p-4',           // Tablet: more padding
                'md:p-5',           // Desktop: optimal padding
                // Touch-friendly on mobile (Requirement 6.1, 6.4)
                'min-h-[80px]',     // Mobile: minimum touch target
                'sm:min-h-[90px]',  // Tablet: larger touch target
                // Cursor and interaction states
                'cursor-pointer',
                // Desktop hover states (Requirement 6.3)
                'hover:bg-gray-50 md:hover:bg-gray-100',
                // Enhanced focus-visible styles (Requirement 6.4, 6.7)
                'focus:outline-none',
                'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_#3b82f6]',
                'focus-visible:z-10',
                // Read/unread styling with high contrast (Requirement 6.6)
                isUnread && 'bg-blue-50 hover:bg-blue-100 md:hover:bg-blue-200',
                !isUnread && 'opacity-70'
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
            <div className="flex-1 min-w-0">
                {/* Title */}
                <h3
                    className={cn(
                        'mb-1',
                        // Responsive font sizing (Requirement 6.1, 6.2, 6.3)
                        'text-sm',          // Mobile
                        'sm:text-base',     // Tablet
                        'md:text-base',     // Desktop
                        // High contrast text (Requirement 6.6)
                        isUnread ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'
                    )}
                >
                    {notification.title}
                </h3>

                {/* Content preview */}
                <p
                    id={`notification-content-${notification.id}`}
                    className={cn(
                        'line-clamp-2',
                        // Responsive font sizing (Requirement 6.1, 6.2, 6.3)
                        'text-xs',          // Mobile: smaller for space
                        'sm:text-sm',       // Tablet: standard
                        'md:text-sm',       // Desktop: standard
                        // High contrast text (Requirement 6.6)
                        isUnread ? 'text-gray-700' : 'text-gray-500'
                    )}
                >
                    {notification.content}
                </p>

                {/* Timestamp */}
                <time
                    dateTime={notification.createdAt}
                    className={cn(
                        'text-gray-500 mt-1 block',
                        // Responsive font sizing (Requirement 6.1, 6.2, 6.3)
                        'text-xs',          // Mobile
                        'sm:text-xs',       // Tablet
                        'md:text-sm'        // Desktop: slightly larger
                    )}
                    aria-label={`Notification time: ${formatRelativeTime(notification.createdAt)}`}
                >
                    {formatRelativeTime(notification.createdAt)}
                </time>
            </div>

            {/* Unread indicator dot */}
            {isUnread && (
                <div
                    className="flex-shrink-0 mt-1"
                    aria-hidden="true"
                    role="presentation"
                >
                    <div className={cn(
                        'rounded-full bg-blue-600',
                        // Responsive dot sizing (Requirement 6.1, 6.2, 6.3)
                        'h-2 w-2',          // Mobile
                        'sm:h-2.5 sm:w-2.5', // Tablet
                        'md:h-3 md:w-3'     // Desktop
                    )} />
                </div>
            )}
        </div>
    );
}
