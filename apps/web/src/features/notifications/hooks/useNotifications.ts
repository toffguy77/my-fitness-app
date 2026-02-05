/**
 * Custom hook for managing notifications for a specific category
 * Provides access to notifications state and actions from the Zustand store
 */

import { useEffect, useCallback } from 'react';
import { useNotificationsStore } from '../store/notificationsStore';
import type { NotificationCategory, Notification, NotificationError } from '../types';

export interface UseNotificationsReturn {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    error: NotificationError | null;
    hasMore: boolean;
    fetchMore: () => void;
    markAsRead: (id: string) => void;
    refresh: () => void;
}

/**
 * Hook to manage notifications for a specific category
 * Automatically fetches initial data on mount
 *
 * @param category - The notification category to manage ('main' or 'content')
 * @returns Notifications state and actions
 */
export function useNotifications(category: NotificationCategory): UseNotificationsReturn {
    // Select state from store
    const notifications = useNotificationsStore((state) => state.notifications[category]);
    const unreadCount = useNotificationsStore((state) => state.unreadCounts[category]);
    const isLoading = useNotificationsStore((state) => state.isLoading);
    const error = useNotificationsStore((state) => state.error);
    const hasMore = useNotificationsStore((state) => state.hasMore[category]);

    // Select actions from store
    const fetchNotifications = useNotificationsStore((state) => state.fetchNotifications);
    const markAsReadAction = useNotificationsStore((state) => state.markAsRead);

    // Fetch initial data on mount
    useEffect(() => {
        fetchNotifications(category, 0);
    }, [category, fetchNotifications]);

    // Fetch more notifications (pagination)
    const fetchMore = useCallback(() => {
        if (!isLoading && hasMore) {
            fetchNotifications(category, notifications.length);
        }
    }, [category, notifications.length, isLoading, hasMore, fetchNotifications]);

    // Mark notification as read
    const markAsRead = useCallback(
        (id: string) => {
            markAsReadAction(id, category);
        },
        [category, markAsReadAction]
    );

    // Refresh notifications (reload from beginning)
    const refresh = useCallback(() => {
        fetchNotifications(category, 0);
    }, [category, fetchNotifications]);

    return {
        notifications,
        unreadCount,
        isLoading,
        error,
        hasMore,
        fetchMore,
        markAsRead,
        refresh,
    };
}
