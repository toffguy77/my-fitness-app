/**
 * NotificationList Component
 *
 * Displays a list of notifications with date grouping, infinite scroll,
 * and virtual scrolling for performance optimization.
 */

import { useEffect, useRef, lazy, Suspense } from 'react';
import type { Notification, NotificationCategory, NotificationError } from '../types';
import { NotificationItem } from './NotificationItem';
import { groupNotificationsByDate } from '../utils/dateGrouping';
import { AlertCircle, Inbox } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

import { t } from '@/shared/i18n'
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
                className="flex items-center justify-center py-12"
                role="status"
                aria-label="Loading notifications"
            >
                <div className="flex flex-col items-center gap-3">
                    <span
                        className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary"
                        aria-hidden="true"
                        data-testid="notifications-spinner"
                    />
                    <p className="text-sm text-fg-muted">{t('notifications.loadingList')}</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div
                className="flex flex-col items-center justify-center px-6 py-12 text-center"
                role="alert"
                aria-live="polite"
            >
                <span
                    className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft"
                    aria-hidden="true"
                >
                    <AlertCircle className="h-6 w-6 text-danger-fg" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="mb-2 type-title-3 text-fg">
                    {t('notifications.loadError')}
                </h3>
                <p className="mb-5 max-w-md text-center text-sm text-fg-muted">
                    {error.message || t('notifications.loadErrorHint')}
                </p>
                <Button
                    variant="secondary"
                    onClick={onLoadMore}
                    aria-label="Retry loading notifications"
                    type="button"
                >
                    {t('notifications.retry')}
                </Button>
            </div>
        );
    }

    // Empty state — спокойно: нейтральная плитка и заголовок засечками.
    if (notifications.length === 0) {
        return (
            <div
                className="flex flex-col items-center justify-center px-6 py-12 text-center"
                role="status"
                aria-label="No notifications"
            >
                <span
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-subtle"
                    aria-hidden="true"
                >
                    <Inbox className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="mb-2 type-title-3 text-fg">
                    {t('notifications.empty')}
                </h3>
                <p className="max-w-md text-center text-sm text-fg-muted">
                    {category === 'main'
                        ? t('notifications.emptyPersonal')
                        : t('notifications.emptyContent')}
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
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
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
        <div className="space-y-6">
            {groupedNotifications.map((group) => (
                <section key={group.date}>
                    {/* Date header */}
                    <h2 className="mb-2 px-4 type-overline text-fg-subtle sm:px-0">
                        {group.date}
                    </h2>

                    {/* Notifications in this group — одной карточкой, строки через линию */}
                    <div className="divide-y divide-line overflow-hidden border-y border-line bg-surface sm:rounded-card sm:border">
                        {group.notifications.map((notification) => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onMarkAsRead={onMarkAsRead}
                            />
                        ))}
                    </div>
                </section>
            ))}

            {/* Infinite scroll trigger */}
            {hasMore && (
                <div ref={observerTarget} className="py-4 text-center">
                    {isLoading && (
                        <div className="flex items-center justify-center gap-2">
                            <span
                                className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary"
                                aria-hidden="true"
                            />
                            <span className="text-sm text-fg-muted">{t('common.loading')}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
