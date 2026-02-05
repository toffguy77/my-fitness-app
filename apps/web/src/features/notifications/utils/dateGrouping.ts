/**
 * Date grouping utility for notifications
 * Groups notifications by date categories for better organization
 */

import type { Notification, NotificationGroup } from '../types';

/**
 * Groups notifications by date into categories: Today, Yesterday, Last Week, or specific dates
 * @param notifications - Array of notifications to group
 * @returns Array of notification groups sorted chronologically (newest first)
 */
export function groupNotificationsByDate(notifications: Notification[]): NotificationGroup[] {
    if (!notifications || notifications.length === 0) {
        return [];
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Group notifications by date category
    const groups = new Map<string, Notification[]>();

    for (const notification of notifications) {
        const createdAt = new Date(notification.createdAt);
        const notificationDate = new Date(
            createdAt.getFullYear(),
            createdAt.getMonth(),
            createdAt.getDate()
        );

        let groupKey: string;

        if (notificationDate.getTime() === today.getTime()) {
            groupKey = 'Today';
        } else if (notificationDate.getTime() === yesterday.getTime()) {
            groupKey = 'Yesterday';
        } else if (notificationDate >= lastWeekStart && notificationDate < yesterday) {
            groupKey = 'Last Week';
        } else {
            // Format as readable date (e.g., "January 15, 2024")
            groupKey = createdAt.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        }

        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(notification);
    }

    // Convert to array and sort groups chronologically (newest first)
    const groupArray: NotificationGroup[] = [];
    const groupOrder = ['Today', 'Yesterday', 'Last Week'];

    // Add special groups first (in order)
    for (const key of groupOrder) {
        if (groups.has(key)) {
            groupArray.push({
                date: key,
                notifications: groups.get(key)!.sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                ),
            });
            groups.delete(key);
        }
    }

    // Add remaining date groups sorted by date (newest first)
    const remainingGroups = Array.from(groups.entries())
        .map(([date, notifications]) => ({
            date,
            notifications: notifications.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ),
            // Store the actual date for sorting
            sortDate: new Date(notifications[0].createdAt),
        }))
        .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
        .map(({ date, notifications }) => ({ date, notifications }));

    groupArray.push(...remainingGroups);

    return groupArray;
}
