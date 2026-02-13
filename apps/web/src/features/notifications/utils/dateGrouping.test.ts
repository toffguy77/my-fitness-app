/**
 * Unit tests for date grouping utility
 */

import { groupNotificationsByDate } from './dateGrouping';
import type { Notification } from '../types';

describe('groupNotificationsByDate', () => {
    // Helper function to create a notification with a specific date
    const createNotification = (id: string, hoursAgo: number): Notification => {
        const date = new Date();
        date.setHours(date.getHours() - hoursAgo);

        return {
            id,
            userId: 'user-1',
            category: 'main',
            type: 'general',
            title: `Notification ${id}`,
            content: `Content ${id}`,
            createdAt: date.toISOString(),
        };
    };

    // Helper to create notification with specific date
    const createNotificationWithDate = (id: string, date: Date): Notification => {
        return {
            id,
            userId: 'user-1',
            category: 'main',
            type: 'general',
            title: `Notification ${id}`,
            content: `Content ${id}`,
            createdAt: date.toISOString(),
        };
    };

    it('should return empty array for empty input', () => {
        const result = groupNotificationsByDate([]);
        expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined input', () => {
        const result1 = groupNotificationsByDate(null as any);
        expect(result1).toEqual([]);

        const result2 = groupNotificationsByDate(undefined as any);
        expect(result2).toEqual([]);
    });

    it('should group notifications from today under "Today"', () => {
        // Create dates explicitly for today to avoid midnight boundary issues
        const now = new Date();
        const today10am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
        const today14pm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);
        const today18pm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);

        const notifications = [
            createNotificationWithDate('1', today18pm),
            createNotificationWithDate('2', today14pm),
            createNotificationWithDate('3', today10am),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(1);
        expect(result[0].date).toBe('Today');
        expect(result[0].notifications).toHaveLength(3);
    });

    it('should group notifications from yesterday under "Yesterday"', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(12, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', yesterday),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(1);
        expect(result[0].date).toBe('Yesterday');
        expect(result[0].notifications).toHaveLength(1);
    });

    it('should group notifications from this week under "Last Week"', () => {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        threeDaysAgo.setHours(12, 0, 0, 0);

        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        fiveDaysAgo.setHours(12, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', threeDaysAgo),
            createNotificationWithDate('2', fiveDaysAgo),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(1);
        expect(result[0].date).toBe('Last Week');
        expect(result[0].notifications).toHaveLength(2);
    });

    it('should format older dates as readable date string', () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        tenDaysAgo.setHours(12, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', tenDaysAgo),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(1);

        // Verify format is readable (e.g., "January 18, 2026")
        const expectedDate = tenDaysAgo.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        expect(result[0].date).toBe(expectedDate);
    });

    it('should create separate groups for different date categories', () => {
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(12, 0, 0, 0);

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        threeDaysAgo.setHours(12, 0, 0, 0);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        tenDaysAgo.setHours(12, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', today),
            createNotificationWithDate('2', yesterday),
            createNotificationWithDate('3', threeDaysAgo),
            createNotificationWithDate('4', tenDaysAgo),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(4);
        expect(result[0].date).toBe('Today');
        expect(result[1].date).toBe('Yesterday');
        expect(result[2].date).toBe('Last Week');
        // Fourth group should be a readable date string
        expect(result[3].date).toContain(tenDaysAgo.getFullYear().toString());
    });

    it('should sort groups chronologically (newest first)', () => {
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(12, 0, 0, 0);

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        threeDaysAgo.setHours(12, 0, 0, 0);

        // Add notifications in random order
        const notifications = [
            createNotificationWithDate('3', threeDaysAgo),
            createNotificationWithDate('1', today),
            createNotificationWithDate('2', yesterday),
        ];

        const result = groupNotificationsByDate(notifications);

        // Should be sorted: Today, Yesterday, Last Week
        expect(result[0].date).toBe('Today');
        expect(result[1].date).toBe('Yesterday');
        expect(result[2].date).toBe('Last Week');
    });

    it('should sort notifications within each group by createdAt (newest first)', () => {
        // Use times guaranteed to be within today (minutes ago, not hours)
        const now = new Date();
        const notification1 = createNotificationWithDate('1', new Date(now.getTime() - 10 * 60 * 1000)); // 10 min ago
        const notification2 = createNotificationWithDate('2', new Date(now.getTime() - 30 * 60 * 1000)); // 30 min ago
        const notification3 = createNotificationWithDate('3', new Date(now.getTime() - 60 * 60 * 1000)); // 60 min ago
        const notifications = [notification1, notification2, notification3];

        const result = groupNotificationsByDate(notifications);

        // All should be in "Today" group
        expect(result[0].date).toBe('Today');
        expect(result[0].notifications[0].id).toBe('1'); // Most recent
        expect(result[0].notifications[1].id).toBe('2');
        expect(result[0].notifications[2].id).toBe('3'); // Oldest
    });

    it('should sort specific date groups by date (newest first)', () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        tenDaysAgo.setHours(12, 0, 0, 0);

        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);
        twentyDaysAgo.setHours(12, 0, 0, 0);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(12, 0, 0, 0);

        // Add in random order
        const notifications = [
            createNotificationWithDate('2', twentyDaysAgo),
            createNotificationWithDate('3', thirtyDaysAgo),
            createNotificationWithDate('1', tenDaysAgo),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(3);

        // Parse dates to verify order (dates are in readable format now)
        const date1 = new Date(result[0].date);
        const date2 = new Date(result[1].date);
        const date3 = new Date(result[2].date);

        expect(date1.getTime()).toBeGreaterThan(date2.getTime());
        expect(date2.getTime()).toBeGreaterThan(date3.getTime());
    });

    it('should handle notifications at midnight boundary correctly', () => {
        const justBeforeMidnight = new Date();
        justBeforeMidnight.setHours(23, 59, 59, 999);

        const justAfterMidnight = new Date();
        justAfterMidnight.setDate(justAfterMidnight.getDate() + 1);
        justAfterMidnight.setHours(0, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', justBeforeMidnight),
            createNotificationWithDate('2', justAfterMidnight),
        ];

        const result = groupNotificationsByDate(notifications);

        // Both should be in "Today" if justAfterMidnight is actually today
        // or one in today and one in yesterday depending on when test runs
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].date).toBe('Today');
    });

    it('should handle multiple notifications on the same specific date', () => {
        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        tenDaysAgo.setHours(10, 0, 0, 0);

        const tenDaysAgoLater = new Date();
        tenDaysAgoLater.setDate(tenDaysAgoLater.getDate() - 10);
        tenDaysAgoLater.setHours(15, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', tenDaysAgo),
            createNotificationWithDate('2', tenDaysAgoLater),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(1);
        expect(result[0].notifications).toHaveLength(2);
        // Later notification should come first
        expect(result[0].notifications[0].id).toBe('2');
        expect(result[0].notifications[1].id).toBe('1');
    });

    it('should handle edge case of exactly 7 days ago', () => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(12, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', sevenDaysAgo),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(1);
        // Should be in "Last Week" (within last 7 days)
        expect(result[0].date).toBe('Last Week');
    });

    it('should handle edge case of exactly 8 days ago', () => {
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
        eightDaysAgo.setHours(12, 0, 0, 0);

        const notifications = [
            createNotificationWithDate('1', eightDaysAgo),
        ];

        const result = groupNotificationsByDate(notifications);

        expect(result).toHaveLength(1);
        // Should be a readable date string (older than 7 days)
        expect(result[0].date).toContain(eightDaysAgo.getFullYear().toString());
    });
});
