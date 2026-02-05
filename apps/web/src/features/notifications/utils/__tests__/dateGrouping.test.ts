/**
 * Property-based tests for date grouping utility
 * Feature: notifications-page, Property 7: Date Grouping
 * Validates: Requirements 2.6
 */

import fc from 'fast-check';
import { groupNotificationsByDate } from '../dateGrouping';
import { notificationArrayGenerator } from '../../testing/generators';
import type { Notification } from '../../types';

describe('dateGrouping', () => {
    describe('Property 7: Date Grouping', () => {
        it('should group notifications by date categories in chronological order', () => {
            fc.assert(
                fc.property(
                    notificationArrayGenerator(1, 100),
                    (notifications) => {
                        const groups = groupNotificationsByDate(notifications);

                        // Property 1: All notifications should be included in groups
                        const totalNotificationsInGroups = groups.reduce(
                            (sum, group) => sum + group.notifications.length,
                            0
                        );
                        expect(totalNotificationsInGroups).toBe(notifications.length);

                        // Property 2: Each notification should appear exactly once
                        const allGroupedIds = groups.flatMap((group) =>
                            group.notifications.map((n) => n.id)
                        );
                        const uniqueIds = new Set(allGroupedIds);
                        expect(allGroupedIds.length).toBe(uniqueIds.size);

                        // Property 3: Groups should be in chronological order (newest first)
                        const groupOrder = ['Today', 'Yesterday', 'Last Week'];
                        let lastSpecialGroupIndex = -1;

                        for (let i = 0; i < groups.length; i++) {
                            const currentGroup = groups[i];
                            const specialIndex = groupOrder.indexOf(currentGroup.date);

                            if (specialIndex !== -1) {
                                // Special groups should appear in order
                                expect(specialIndex).toBeGreaterThan(lastSpecialGroupIndex);
                                lastSpecialGroupIndex = specialIndex;
                            }
                        }

                        // Property 4: Notifications within each group should be sorted by date (newest first)
                        for (const group of groups) {
                            for (let i = 0; i < group.notifications.length - 1; i++) {
                                const current = new Date(group.notifications[i].createdAt).getTime();
                                const next = new Date(group.notifications[i + 1].createdAt).getTime();
                                expect(current).toBeGreaterThanOrEqual(next);
                            }
                        }

                        // Property 5: Notifications in the same date group should have the same date (day)
                        for (const group of groups) {
                            if (group.notifications.length > 1) {
                                const firstDate = new Date(group.notifications[0].createdAt);
                                const firstDay = new Date(
                                    firstDate.getFullYear(),
                                    firstDate.getMonth(),
                                    firstDate.getDate()
                                );

                                for (const notification of group.notifications) {
                                    const notifDate = new Date(notification.createdAt);
                                    const notifDay = new Date(
                                        notifDate.getFullYear(),
                                        notifDate.getMonth(),
                                        notifDate.getDate()
                                    );

                                    // For special groups (Today, Yesterday, Last Week), check date ranges
                                    if (group.date === 'Today' || group.date === 'Yesterday') {
                                        expect(notifDay.getTime()).toBe(firstDay.getTime());
                                    } else if (group.date === 'Last Week') {
                                        // All notifications in Last Week should be within the same week range
                                        const now = new Date();
                                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                        const yesterday = new Date(today);
                                        yesterday.setDate(yesterday.getDate() - 1);
                                        const lastWeekStart = new Date(today);
                                        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

                                        expect(notifDay.getTime()).toBeGreaterThanOrEqual(lastWeekStart.getTime());
                                        expect(notifDay.getTime()).toBeLessThan(yesterday.getTime());
                                    }
                                }
                            }
                        }

                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle empty array', () => {
            const result = groupNotificationsByDate([]);
            expect(result).toEqual([]);
        });

        it('should handle single notification', () => {
            fc.assert(
                fc.property(
                    notificationArrayGenerator(1, 1),
                    (notifications) => {
                        const groups = groupNotificationsByDate(notifications);
                        expect(groups.length).toBeGreaterThan(0);
                        expect(groups[0].notifications.length).toBe(1);
                        expect(groups[0].notifications[0].id).toBe(notifications[0].id);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should correctly categorize notifications from today', () => {
            const now = new Date();
            const todayNotification: Notification = {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'general',
                title: 'Test',
                content: 'Test content',
                createdAt: now.toISOString(),
            };

            const groups = groupNotificationsByDate([todayNotification]);
            expect(groups.length).toBe(1);
            expect(groups[0].date).toBe('Today');
        });

        it('should correctly categorize notifications from yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayNotification: Notification = {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'general',
                title: 'Test',
                content: 'Test content',
                createdAt: yesterday.toISOString(),
            };

            const groups = groupNotificationsByDate([yesterdayNotification]);
            expect(groups.length).toBe(1);
            expect(groups[0].date).toBe('Yesterday');
        });

        it('should correctly categorize notifications from last week', () => {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 5); // 5 days ago
            const lastWeekNotification: Notification = {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'general',
                title: 'Test',
                content: 'Test content',
                createdAt: lastWeek.toISOString(),
            };

            const groups = groupNotificationsByDate([lastWeekNotification]);
            expect(groups.length).toBe(1);
            expect(groups[0].date).toBe('Last Week');
        });

        it('should format older dates as readable strings', () => {
            const oldDate = new Date('2024-01-15T10:00:00Z');
            const oldNotification: Notification = {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'general',
                title: 'Test',
                content: 'Test content',
                createdAt: oldDate.toISOString(),
            };

            const groups = groupNotificationsByDate([oldNotification]);
            expect(groups.length).toBe(1);
            // Should be formatted as a readable date (not Today, Yesterday, or Last Week)
            expect(groups[0].date).not.toBe('Today');
            expect(groups[0].date).not.toBe('Yesterday');
            expect(groups[0].date).not.toBe('Last Week');
            expect(groups[0].date).toMatch(/\w+ \d+, \d{4}/); // e.g., "January 15, 2024"
        });
    });
});
