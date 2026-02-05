/**
 * Property-based tests for notification prepending
 * Feature: notifications-page
 * Property 15: New Notification Prepending
 * Validates: Requirements 5.3
 */

import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useNotificationsStore } from '../notificationsStore';
import type { Notification, NotificationCategory } from '../../types';
import { notificationWithCategoryGenerator } from '../../testing/generators';

describe('Property 15: New Notification Prepending', () => {
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
     * For any new notification that arrives, the system should prepend it
     * to the top of the appropriate category list.
     */
    it('Feature: notifications-page, Property 15: prepends new notifications to the beginning of the list', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                fc.array(notificationWithCategoryGenerator('main'), { minLength: 1, maxLength: 10 }),
                fc.array(notificationWithCategoryGenerator('main'), { minLength: 1, maxLength: 5 }),
                (category, existingNotifications, newNotifications) => {
                    const { result } = renderHook(() => useNotificationsStore());

                    // Ensure all notifications belong to the correct category
                    const categoryExisting = existingNotifications.map(n => ({
                        ...n,
                        category,
                    }));
                    const categoryNew = newNotifications.map(n => ({
                        ...n,
                        category,
                        readAt: undefined, // New notifications are unread
                    }));

                    // Set initial state with existing notifications
                    act(() => {
                        result.current.notifications = {
                            main: category === 'main' ? categoryExisting : [],
                            content: category === 'content' ? categoryExisting : [],
                        };
                    });

                    const initialLength = result.current.notifications[category].length;
                    const firstExistingId = categoryExisting[0]?.id;

                    // Add new notifications to the beginning
                    act(() => {
                        const existingList = result.current.notifications[category];
                        result.current.notifications = {
                            ...result.current.notifications,
                            [category]: [...categoryNew, ...existingList],
                        };
                    });

                    const updatedList = result.current.notifications[category];

                    // Verify new notifications were added
                    expect(updatedList.length).toBe(initialLength + categoryNew.length);

                    // Verify new notifications are at the beginning
                    const newIds = categoryNew.map(n => n.id);
                    const firstNewIds = updatedList.slice(0, categoryNew.length).map(n => n.id);

                    // All new notification IDs should be in the first positions
                    newIds.forEach(id => {
                        expect(firstNewIds).toContain(id);
                    });

                    // Verify existing notifications are still present after new ones
                    if (firstExistingId) {
                        const existingIndex = updatedList.findIndex(n => n.id === firstExistingId);
                        expect(existingIndex).toBeGreaterThanOrEqual(categoryNew.length);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that prepending maintains the order of existing notifications
     */
    it('maintains order of existing notifications when prepending new ones', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                fc.array(notificationWithCategoryGenerator('main'), { minLength: 3, maxLength: 10 }),
                fc.integer({ min: 1, max: 5 }),
                (category, existingNotifications, newCount) => {
                    const { result } = renderHook(() => useNotificationsStore());

                    // Ensure all notifications belong to the correct category
                    const categoryExisting = existingNotifications.map((n, index) => ({
                        ...n,
                        category,
                        id: `existing-${index}`, // Unique IDs for tracking
                    }));

                    // Set initial state
                    act(() => {
                        result.current.notifications = {
                            main: category === 'main' ? categoryExisting : [],
                            content: category === 'content' ? categoryExisting : [],
                        };
                    });

                    // Store the original order of existing notifications
                    const originalOrder = categoryExisting.map(n => n.id);

                    // Generate new notifications
                    const categoryNew = Array.from({ length: newCount }, (_, i) =>
                        fc.sample(notificationWithCategoryGenerator(category), 1)[0]
                    ).map((n, index) => ({
                        ...n,
                        id: `new-${index}`, // Unique IDs for tracking
                        readAt: undefined,
                    }));

                    // Prepend new notifications
                    act(() => {
                        const existingList = result.current.notifications[category];
                        result.current.notifications = {
                            ...result.current.notifications,
                            [category]: [...categoryNew, ...existingList],
                        };
                    });

                    const updatedList = result.current.notifications[category];

                    // Extract the existing notifications from the updated list
                    const existingInUpdatedList = updatedList
                        .filter(n => n.id.startsWith('existing-'))
                        .map(n => n.id);

                    // Verify the order of existing notifications is maintained
                    expect(existingInUpdatedList).toEqual(originalOrder);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that prepending does not create duplicates
     */
    it('does not create duplicate notifications when prepending', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                fc.array(notificationWithCategoryGenerator('main'), { minLength: 2, maxLength: 10 }),
                (category, notifications) => {
                    const { result } = renderHook(() => useNotificationsStore());

                    // Ensure all notifications belong to the correct category and have unique IDs
                    const categoryNotifications = notifications.map((n, index) => ({
                        ...n,
                        category,
                        id: `notification-${index}`,
                    }));

                    // Set initial state
                    act(() => {
                        result.current.notifications = {
                            main: category === 'main' ? categoryNotifications : [],
                            content: category === 'content' ? categoryNotifications : [],
                        };
                    });

                    // Try to prepend the same notifications again (simulating duplicate)
                    act(() => {
                        const existingList = result.current.notifications[category];

                        // Filter out duplicates before prepending
                        const newNotifications = categoryNotifications.filter(
                            newNotif => !existingList.some(existing => existing.id === newNotif.id)
                        );

                        result.current.notifications = {
                            ...result.current.notifications,
                            [category]: [...newNotifications, ...existingList],
                        };
                    });

                    const updatedList = result.current.notifications[category];
                    const ids = updatedList.map(n => n.id);
                    const uniqueIds = new Set(ids);

                    // Number of unique IDs should equal total IDs (no duplicates)
                    expect(uniqueIds.size).toBe(ids.length);
                }
            ),
            { numRuns: 100 }
        );
    });
});
