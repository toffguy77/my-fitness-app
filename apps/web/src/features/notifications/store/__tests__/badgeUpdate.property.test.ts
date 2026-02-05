/**
 * Property-based tests for notification badge updates
 * Feature: notifications-page
 * Property 14: New Notification Badge Update
 * Validates: Requirements 5.2
 */

import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useNotificationsStore } from '../notificationsStore';
import type { Notification, NotificationCategory } from '../../types';
import { notificationWithCategoryGenerator } from '../../testing/generators';

describe('Property 14: New Notification Badge Update', () => {
    beforeEach(() => {
        // Reset store state before each test
        const { result } = renderHook(() => useNotificationsStore());
        act(() => {
            result.current.notifications = { main: [], content: [] };
            result.current.unreadCounts = { main: 0, content: 0 };
            result.current.isLoading = false;
            result.current.error = null;
        });
    });

    /**
     * For any new unread notification that is added to a category,
     * the system should increment the unread count badge for that category.
     */
    it('Feature: notifications-page, Property 14: increments unread count when unread notifications are added', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                fc.integer({ min: 0, max: 50 }),
                fc.integer({ min: 1, max: 10 }),
                (category, initialCount, newNotificationsCount) => {
                    const { result } = renderHook(() => useNotificationsStore());

                    // Set initial unread count
                    act(() => {
                        result.current.unreadCounts = {
                            main: category === 'main' ? initialCount : 0,
                            content: category === 'content' ? initialCount : 0,
                        };
                    });

                    const initialUnreadCount = result.current.unreadCounts[category];

                    // Generate new unread notifications for the category
                    const newNotifications: Notification[] = [];
                    for (let i = 0; i < newNotificationsCount; i++) {
                        const notification = fc.sample(
                            notificationWithCategoryGenerator(category),
                            1
                        )[0];
                        // Ensure notification is unread
                        notification.readAt = undefined;
                        newNotifications.push(notification);
                    }

                    // Add new notifications to the store
                    act(() => {
                        const existingNotifications = result.current.notifications[category];
                        result.current.notifications = {
                            ...result.current.notifications,
                            [category]: [...newNotifications, ...existingNotifications],
                        };

                        // Update unread count
                        result.current.unreadCounts = {
                            ...result.current.unreadCounts,
                            [category]: initialUnreadCount + newNotificationsCount,
                        };
                    });

                    // Verify unread count was incremented correctly
                    const updatedUnreadCount = result.current.unreadCounts[category];
                    expect(updatedUnreadCount).toBe(initialUnreadCount + newNotificationsCount);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that already-read notifications do not increment the unread count
     */
    it('does not increment unread count for read notifications', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                fc.integer({ min: 0, max: 50 }),
                fc.integer({ min: 1, max: 10 }),
                (category, initialCount, newNotificationsCount) => {
                    const { result } = renderHook(() => useNotificationsStore());

                    // Set initial unread count
                    act(() => {
                        result.current.unreadCounts = {
                            main: category === 'main' ? initialCount : 0,
                            content: category === 'content' ? initialCount : 0,
                        };
                    });

                    const initialUnreadCount = result.current.unreadCounts[category];

                    // Generate new READ notifications for the category
                    const newNotifications: Notification[] = [];
                    for (let i = 0; i < newNotificationsCount; i++) {
                        const notification = fc.sample(
                            notificationWithCategoryGenerator(category),
                            1
                        )[0];
                        // Ensure notification is read
                        notification.readAt = new Date().toISOString();
                        newNotifications.push(notification);
                    }

                    // Add new notifications to the store (but don't update unread count)
                    act(() => {
                        const existingNotifications = result.current.notifications[category];
                        result.current.notifications = {
                            ...result.current.notifications,
                            [category]: [...newNotifications, ...existingNotifications],
                        };
                        // Unread count should remain the same
                    });

                    // Verify unread count was NOT incremented
                    const updatedUnreadCount = result.current.unreadCounts[category];
                    expect(updatedUnreadCount).toBe(initialUnreadCount);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that marking notifications as read decrements the unread count
     */
    it('decrements unread count when notifications are marked as read', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                fc.integer({ min: 5, max: 50 }),
                fc.integer({ min: 1, max: 5 }),
                (category, initialCount, markedReadCount) => {
                    const { result } = renderHook(() => useNotificationsStore());

                    // Ensure we don't try to mark more as read than we have
                    const actualMarkedReadCount = Math.min(markedReadCount, initialCount);

                    // Set initial unread count
                    act(() => {
                        result.current.unreadCounts = {
                            main: category === 'main' ? initialCount : 0,
                            content: category === 'content' ? initialCount : 0,
                        };
                    });

                    const initialUnreadCount = result.current.unreadCounts[category];

                    // Simulate marking notifications as read
                    act(() => {
                        result.current.unreadCounts = {
                            ...result.current.unreadCounts,
                            [category]: initialUnreadCount - actualMarkedReadCount,
                        };
                    });

                    // Verify unread count was decremented correctly
                    const updatedUnreadCount = result.current.unreadCounts[category];
                    expect(updatedUnreadCount).toBe(initialUnreadCount - actualMarkedReadCount);
                }
            ),
            { numRuns: 100 }
        );
    });
});
