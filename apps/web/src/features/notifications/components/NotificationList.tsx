/**
 * NotificationList Component
 *
 * Displays a list of notifications with date grouping, infinite scroll,
 * and virtual scrolling for performance optimization.
 */

import { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import type { Notification, NotificationCategory, NotificationError } from '../types';
import { NotificationItem } from './NotificationItem';
import { groupNotificationsByDate } from '../utils/dateGrouping';
import { cn } from '@/shared/utils/cn';
import { AlertCircle, Inbox } from 'lucide-react';

// Lazy load VirtualizedNotificationList for code splitting (Requirement 9.1)
const VirtualizedNotificationList = lazy(() =>
    import('./VirtualizedNotificationList')
);

export interface NotificationListProps {
    /** Category of notifications being displayed */
    category: NotificationCategory;
    /** Array of notifications to display */
    notifications: Notification[];
    /** Loading state indicator */
    isLoading: boolean;
    /** Error state */
    error: Error | NotificationError | null;
    /** Callback to load more notifications */
    onLoadMore: () => void;
    /** Whether there are more notifications to load */
    hasMore: boolean;
    /** Callback when a notification is marked as read */
    onMarkAsRead: (id: string) => void;
}

/**
 * NotificationList component renders a list of notifications with:
 * - Date grouping (Today, Yesterday, Last Week, specific dates)
 * - Infinite scroll pagination
 * - Virtual scrolling for lists > 100 items
 * - Loading, error, and empty states
 *
 * @example
 * <NotificationList
 *   category="main"
 *   notifications={notifications}
 *   isLoading={false}
 *   error={null}
 *   onLoadMore={() => fetchMore()}
 *   hasMore={true}
 *   onMarkAsRead={(id) => markAsRead(id)}
 * />
 */
export function NotificationList({
    category,
    notifications,
    isLoading,
    error,
    onLoadMore,
    hasMore,
    onMarkAsRead,
}: NotificationListProps) {
    const observerTarget = useRef<HTMLDivElement>(null);

    // Infinite scroll with Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoading) {
                    onLoadMore();
                }
            },
            { threshold: 0.1 }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasMore, isLoading, onLoadMore]);

    // Loading state
    if (isLoading && notifications.length === 0) {
        return (
            <div
                className={cn(
                    'flex items-center justify-center',
                    // Responsive padding (Requirement 6.1, 6.2, 6.3)
                    'py-8',         // Mobile
                    'sm:py-10',     // Tablet
                    'md:py-12'      // Desktop
                )}
                role="status"
                aria-label="Loading notifications"
            >
                <div className="flex flex-col items-center gap-3">
                    <svg
                        className={cn(
                            'animate-spin text-blue-600',
                            // Responsive icon sizing (Requirement 6.1, 6.2, 6.3)
                            'h-6 w-6',          // Mobile
                            'sm:h-7 sm:w-7',    // Tablet
                            'md:h-8 md:w-8'     // Desktop
                        )}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    <p className={cn(
                        'text-gray-600',
                        // Responsive text sizing (Requirement 6.1, 6.2, 6.3)
                        'text-xs',          // Mobile
                        'sm:text-sm',       // Tablet
                        'md:text-sm'        // Desktop
                    )}>Загрузка уведомлений...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div
                className={cn(
                    'flex flex-col items-center justify-center',
                    // Responsive padding (Requirement 6.1, 6.2, 6.3)
                    'py-8 px-4',        // Mobile
                    'sm:py-10 sm:px-6', // Tablet
                    'md:py-12 md:px-8'  // Desktop
                )}
                role="alert"
                aria-live="polite"
            >
                <AlertCircle className={cn(
                    'text-red-500 mb-4',
                    // Responsive icon sizing (Requirement 6.1, 6.2, 6.3)
                    'h-10 w-10',        // Mobile
                    'sm:h-11 sm:w-11',  // Tablet
                    'md:h-12 md:w-12'   // Desktop
                )} aria-hidden="true" />
                <h3 className={cn(
                    'font-semibold text-gray-900 mb-2',
                    // Responsive text sizing (Requirement 6.1, 6.2, 6.3)
                    'text-base',        // Mobile
                    'sm:text-lg',       // Tablet
                    'md:text-lg'        // Desktop
                )}>
                    Ошибка загрузки уведомлений
                </h3>
                <p className={cn(
                    'text-gray-600 mb-4 text-center max-w-md',
                    // Responsive text sizing (Requirement 6.1, 6.2, 6.3)
                    'text-xs',          // Mobile
                    'sm:text-sm',       // Tablet
                    'md:text-sm'        // Desktop
                )}>
                    {error.message || 'Не удалось загрузить уведомления. Пожалуйста, попробуйте снова.'}
                </p>
                <button
                    onClick={onLoadMore}
                    className={cn(
                        'rounded-lg font-medium transition-colors',
                        'bg-blue-600 text-white hover:bg-blue-700',
                        // Enhanced focus-visible styles (Requirement 6.4, 6.7)
                        'focus:outline-none',
                        'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                        'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_#3b82f6]',
                        // Responsive button sizing (Requirement 6.1, 6.2, 6.3)
                        'px-4 py-2 text-sm',        // Mobile: touch-friendly
                        'sm:px-5 sm:py-2.5',        // Tablet: larger
                        'md:px-6 md:py-3 md:text-base', // Desktop: optimal
                        // Minimum touch target (Requirement 6.4)
                        'min-h-[44px]'
                    )}
                    aria-label="Retry loading notifications"
                    type="button"
                >
                    Повторить попытку
                </button>
            </div>
        );
    }

    // Empty state
    if (notifications.length === 0) {
        return (
            <div
                className={cn(
                    'flex flex-col items-center justify-center',
                    // Responsive padding (Requirement 6.1, 6.2, 6.3)
                    'py-8 px-4',        // Mobile
                    'sm:py-10 sm:px-6', // Tablet
                    'md:py-12 md:px-8'  // Desktop
                )}
                role="status"
                aria-label="No notifications"
            >
                <Inbox className={cn(
                    'text-gray-400 mb-4',
                    // Responsive icon sizing (Requirement 6.1, 6.2, 6.3)
                    'h-12 w-12',        // Mobile
                    'sm:h-14 sm:w-14',  // Tablet
                    'md:h-16 md:w-16'   // Desktop
                )} aria-hidden="true" />
                <h3 className={cn(
                    'font-semibold text-gray-900 mb-2',
                    // Responsive text sizing (Requirement 6.1, 6.2, 6.3)
                    'text-base',        // Mobile
                    'sm:text-lg',       // Tablet
                    'md:text-lg'        // Desktop
                )}>
                    Нет уведомлений
                </h3>
                <p className={cn(
                    'text-gray-600 text-center max-w-md',
                    // Responsive text sizing (Requirement 6.1, 6.2, 6.3)
                    'text-xs',          // Mobile
                    'sm:text-sm',       // Tablet
                    'md:text-sm'        // Desktop
                )}>
                    {category === 'main'
                        ? 'У вас пока нет личных уведомлений'
                        : 'У вас пока нет уведомлений о контенте'}
                </p>
            </div>
        );
    }

    // Group notifications by date
    const groupedNotifications = groupNotificationsByDate(notifications);

    // Use virtual scrolling for large lists (> 100 items)
    const useVirtualScrolling = notifications.length > 100;

    if (useVirtualScrolling) {
        return (
            <Suspense fallback={
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
            }>
                <VirtualizedNotificationList
                    groupedNotifications={groupedNotifications}
                    onMarkAsRead={onMarkAsRead}
                    isLoading={isLoading}
                    hasMore={hasMore}
                    observerTarget={observerTarget}
                />
            </Suspense>
        );
    }

    // Regular rendering for smaller lists
    return (
        <div className={cn(
            'space-y-6',
            // Responsive spacing (Requirement 6.1, 6.2, 6.3)
            'space-y-4',        // Mobile: tighter spacing
            'sm:space-y-5',     // Tablet: medium spacing
            'md:space-y-6'      // Desktop: optimal spacing
        )}>
            {groupedNotifications.map((group) => (
                <div key={group.date}>
                    {/* Date header */}
                    <h2 className={cn(
                        'font-semibold text-gray-500 uppercase tracking-wide mb-3',
                        // Responsive sizing and spacing (Requirement 6.1, 6.2, 6.3)
                        'text-xs px-3',         // Mobile: compact
                        'sm:text-xs sm:px-4',   // Tablet: standard
                        'md:text-sm md:px-4'    // Desktop: slightly larger
                    )}>
                        {group.date}
                    </h2>

                    {/* Notifications in this group */}
                    <div className={cn(
                        'space-y-2',
                        // Responsive spacing between items (Requirement 6.1, 6.2, 6.3)
                        'space-y-1',        // Mobile: tight
                        'sm:space-y-2',     // Tablet: standard
                        'md:space-y-2'      // Desktop: standard
                    )}>
                        {group.notifications.map((notification) => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onMarkAsRead={onMarkAsRead}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* Infinite scroll trigger */}
            {hasMore && (
                <div ref={observerTarget} className={cn(
                    'text-center',
                    // Responsive padding (Requirement 6.1, 6.2, 6.3)
                    'py-3',         // Mobile
                    'sm:py-4',      // Tablet
                    'md:py-6'       // Desktop
                )}>
                    {isLoading && (
                        <div className="flex items-center justify-center gap-2">
                            <svg
                                className={cn(
                                    'animate-spin text-blue-600',
                                    // Responsive icon sizing (Requirement 6.1, 6.2, 6.3)
                                    'h-4 w-4',          // Mobile
                                    'sm:h-5 sm:w-5',    // Tablet
                                    'md:h-6 md:w-6'     // Desktop
                                )}
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                    fill="none"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                            <span className={cn(
                                'text-gray-600',
                                // Responsive text sizing (Requirement 6.1, 6.2, 6.3)
                                'text-xs',          // Mobile
                                'sm:text-sm',       // Tablet
                                'md:text-sm'        // Desktop
                            )}>Загрузка...</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
