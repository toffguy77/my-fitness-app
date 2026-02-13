/**
 * Property-based tests for useAutoMarkAsRead hook
 * Feature: notifications-page, Property 11: Auto-Mark Visible Notifications
 * Validates: Requirements 3.4
 */

import { renderHook, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { useAutoMarkAsRead } from '../useAutoMarkAsRead';
import { useNotificationsStore } from '../../store/notificationsStore';
import { unreadNotificationGenerator, categoryGenerator } from '../../testing/generators';
import type { Notification, NotificationCategory } from '../../types';

// Mock the store
jest.mock('../../store/notificationsStore');

describe('useAutoMarkAsRead - Property Tests', () => {
    let mockMarkAsRead: jest.Mock;
    let mockIntersectionObserver: jest.Mock;
    let observerCallbacks: Map<Element, IntersectionObserverCallback>;

    beforeEach(() => {
        // Reset mocks
        mockMarkAsRead = jest.fn();
        observerCallbacks = new Map();

        // Mock the store
        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });

        // Mock IntersectionObserver
        mockIntersectionObserver = jest.fn().mockImplementation((callback) => {
            return {
                observe: jest.fn((element: Element) => {
                    observerCallbacks.set(element, callback);
                }),
                unobserve: jest.fn((element: Element) => {
                    observerCallbacks.delete(element);
                }),
                disconnect: jest.fn(() => {
                    observerCallbacks.clear();
                }),
            };
        });

        global.IntersectionObserver = mockIntersectionObserver as any;

        // Mock document.querySelectorAll
        jest.spyOn(document, 'querySelectorAll').mockReturnValue([] as any);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it(
        'Feature: notifications-page, Property 11: Auto-Mark Visible Notifications - should mark visible unread notifications as read after delay',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(unreadNotificationGenerator(), { minLength: 1, maxLength: 5 }),
                    categoryGenerator(),
                    fc.integer({ min: 100, max: 200 }), // delay - reduced for faster tests
                    async (notifications: Notification[], category: NotificationCategory, delay: number) => {
                        // Create mock elements for notifications
                        const mockElements = notifications.map((notification) => {
                            const element = document.createElement('div');
                            element.setAttribute('data-notification-id', notification.id);
                            return element;
                        });

                        // Mock querySelectorAll to return our elements
                        jest.spyOn(document, 'querySelectorAll').mockReturnValue(mockElements as any);

                        // Render hook
                        const { unmount } = renderHook(() =>
                            useAutoMarkAsRead(notifications, category, { delay, enabled: true })
                        );

                        // Simulate intersection for first notification
                        const firstElement = mockElements[0];
                        const callback = observerCallbacks.get(firstElement);

                        if (callback) {
                            const entries: IntersectionObserverEntry[] = [
                                {
                                    target: firstElement,
                                    isIntersecting: true,
                                    intersectionRatio: 0.5,
                                } as unknown as IntersectionObserverEntry,
                            ];
                            callback(entries, mockIntersectionObserver() as any);
                        }

                        // Wait for delay + buffer
                        await waitFor(
                            () => {
                                expect(mockMarkAsRead).toHaveBeenCalledWith(
                                    notifications[0].id,
                                    category
                                );
                            },
                            { timeout: delay + 500 }
                        );

                        // Cleanup
                        unmount();
                    }
                ),
                { numRuns: 10, timeout: 3000 }
            );
        },
        20000
    ); // Jest timeout

    it(
        'Feature: notifications-page, Property 11: Auto-Mark Visible Notifications - should not mark notifications that are not visible',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(unreadNotificationGenerator(), { minLength: 1, maxLength: 3 }),
                    categoryGenerator(),
                    async (notifications: Notification[], category: NotificationCategory) => {
                        const delay = 150;

                        // Create mock elements
                        const mockElements = notifications.map((notification) => {
                            const element = document.createElement('div');
                            element.setAttribute('data-notification-id', notification.id);
                            return element;
                        });

                        jest.spyOn(document, 'querySelectorAll').mockReturnValue(mockElements as any);

                        // Render hook
                        const { unmount } = renderHook(() =>
                            useAutoMarkAsRead(notifications, category, { delay, enabled: true })
                        );

                        // Simulate intersection with isIntersecting: false
                        const firstElement = mockElements[0];
                        const callback = observerCallbacks.get(firstElement);

                        if (callback) {
                            const entries: IntersectionObserverEntry[] = [
                                {
                                    target: firstElement,
                                    isIntersecting: false,
                                    intersectionRatio: 0,
                                } as unknown as IntersectionObserverEntry,
                            ];
                            callback(entries, mockIntersectionObserver() as any);
                        }

                        // Wait for delay + buffer
                        await new Promise((resolve) => setTimeout(resolve, delay + 100));

                        // Should not have been called
                        expect(mockMarkAsRead).not.toHaveBeenCalled();

                        // Cleanup
                        unmount();
                    }
                ),
                { numRuns: 10, timeout: 3000 }
            );
        },
        20000
    );

    it(
        'Feature: notifications-page, Property 11: Auto-Mark Visible Notifications - should cancel timer when notification becomes invisible',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(unreadNotificationGenerator(), { minLength: 1, maxLength: 3 }),
                    categoryGenerator(),
                    async (notifications: Notification[], category: NotificationCategory) => {
                        const delay = 200;

                        // Create mock elements
                        const mockElements = notifications.map((notification) => {
                            const element = document.createElement('div');
                            element.setAttribute('data-notification-id', notification.id);
                            return element;
                        });

                        jest.spyOn(document, 'querySelectorAll').mockReturnValue(mockElements as any);

                        // Render hook
                        const { unmount } = renderHook(() =>
                            useAutoMarkAsRead(notifications, category, { delay, enabled: true })
                        );

                        const firstElement = mockElements[0];
                        const callback = observerCallbacks.get(firstElement);

                        if (callback) {
                            // First make it visible
                            callback(
                                [
                                    {
                                        target: firstElement,
                                        isIntersecting: true,
                                        intersectionRatio: 0.5,
                                    } as unknown as IntersectionObserverEntry,
                                ],
                                mockIntersectionObserver() as any
                            );

                            // Wait a bit (less than delay)
                            await new Promise((resolve) => setTimeout(resolve, delay / 2));

                            // Then make it invisible
                            callback(
                                [
                                    {
                                        target: firstElement,
                                        isIntersecting: false,
                                        intersectionRatio: 0,
                                    } as unknown as IntersectionObserverEntry,
                                ],
                                mockIntersectionObserver() as any
                            );

                            // Wait for full delay
                            await new Promise((resolve) => setTimeout(resolve, delay + 100));

                            // Should not have been called because timer was cancelled
                            expect(mockMarkAsRead).not.toHaveBeenCalled();
                        }

                        // Cleanup
                        unmount();
                    }
                ),
                { numRuns: 10, timeout: 3000 }
            );
        },
        20000
    );

    it(
        'Feature: notifications-page, Property 11: Auto-Mark Visible Notifications - should not mark already read notifications',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(unreadNotificationGenerator(), { minLength: 1, maxLength: 3 }),
                    categoryGenerator(),
                    async (notifications: Notification[], category: NotificationCategory) => {
                        const delay = 150;

                        // Mark all notifications as read
                        const readNotifications = notifications.map((n) => ({
                            ...n,
                            readAt: new Date().toISOString(),
                        }));

                        // Create mock elements
                        const mockElements = readNotifications.map((notification) => {
                            const element = document.createElement('div');
                            element.setAttribute('data-notification-id', notification.id);
                            return element;
                        });

                        jest.spyOn(document, 'querySelectorAll').mockReturnValue(mockElements as any);

                        // Render hook with read notifications
                        const { unmount } = renderHook(() =>
                            useAutoMarkAsRead(readNotifications, category, { delay, enabled: true })
                        );

                        const firstElement = mockElements[0];
                        const callback = observerCallbacks.get(firstElement);

                        if (callback) {
                            callback(
                                [
                                    {
                                        target: firstElement,
                                        isIntersecting: true,
                                        intersectionRatio: 0.5,
                                    } as unknown as IntersectionObserverEntry,
                                ],
                                mockIntersectionObserver() as any
                            );
                        }

                        // Wait for delay
                        await new Promise((resolve) => setTimeout(resolve, delay + 100));

                        // Should not have been called for already read notifications
                        expect(mockMarkAsRead).not.toHaveBeenCalled();

                        // Cleanup
                        unmount();
                    }
                ),
                { numRuns: 10, timeout: 3000 }
            );
        },
        20000
    );
});
