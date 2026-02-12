/**
 * VirtualizedNotificationList Component
 *
 * Renders notifications using react-window for performance with large lists.
 * This component is lazy-loaded to optimize bundle size.
 */

import { useRef, useCallback } from 'react';
import { List } from 'react-window';
import type { Notification } from '../types';
import { NotificationItem } from './NotificationItem';

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
    const listRef = useRef<any>(null);

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
                            <div style={style}>
                                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 px-4">
                                    {item.date}
                                </h2>
                            </div>
                        );
                    }
                    return (
                        <div style={style}>
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
                            <svg
                                className="h-5 w-5 animate-spin text-blue-600"
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
                            <span className="text-sm text-gray-600">Загрузка...</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
