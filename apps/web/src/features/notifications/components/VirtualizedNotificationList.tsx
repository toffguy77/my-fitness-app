/**
 * VirtualizedNotificationList Component
 *
 * Renders notifications using react-window for performance with large lists.
 * This component is lazy-loaded to optimize bundle size.
 */

import { useRef } from 'react';
import { List, type ListImperativeAPI } from 'react-window';
import type { Notification } from '../types';
import { NotificationItem } from './NotificationItem';

import { t } from '@/shared/i18n'
export interface VirtualizedNotificationListProps {
    groupedNotifications: Array<{ date: string; notifications: Notification[] }>;
    onMarkAsRead: (id: string) => void;
    isLoading: boolean;
    hasMore: boolean;
    observerTarget: React.RefObject<HTMLDivElement | null>;
}

export default function VirtualizedNotificationList({
    groupedNotifications,
    onMarkAsRead,
    isLoading,
    hasMore,
    observerTarget,
}: VirtualizedNotificationListProps) {
    const listRef = useRef<ListImperativeAPI>(null);

    // Flatten groups into a single array with headers
    const items = groupedNotifications.flatMap((group) => [
        { type: 'header' as const, date: group.date },
        ...group.notifications.map((notification) => ({
            type: 'notification' as const,
            notification,
        })),
    ]);

    // Fixed row height for simplicity (react-window uses fixed heights)
    const rowHeight = 100;

    type RowProps = {
        items: typeof items;
        onMarkAsRead: (id: string) => void;
    };

    return (
        <div className="h-[calc(100vh-200px)]" data-testid="virtual-list">
            <List<RowProps>
                listRef={listRef}
                defaultHeight={typeof window !== 'undefined' ? window.innerHeight - 200 : 600}
                rowCount={items.length}
                rowHeight={rowHeight}
                rowProps={{ items, onMarkAsRead }}
                rowComponent={({ index, style, items: rowItems, onMarkAsRead: markAsRead }) => {
                    const item = rowItems[index];
                    if (item.type === 'header') {
                        return (
                            <div style={style} className="flex items-end pb-2">
                                <h2 className="px-4 type-overline text-fg-subtle">
                                    {item.date}
                                </h2>
                            </div>
                        );
                    }
                    return (
                        <div style={style} className="border-b border-line bg-surface">
                            <NotificationItem
                                notification={item.notification}
                                onMarkAsRead={markAsRead}
                            />
                        </div>
                    );
                }}
            />

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
