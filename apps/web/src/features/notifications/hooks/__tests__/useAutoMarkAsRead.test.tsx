/**
 * Unit tests for useAutoMarkAsRead hook
 * Tests visibility detection and timing behavior
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useAutoMarkAsRead } from '../useAutoMarkAsRead';
import { useNotificationsStore } from '../../store/notificationsStore';
import type { Notification } from '../../types';

// Mock the store
jest.mock('../../store/notificationsStore');

describe('useAutoMarkAsRead', () => {
    let mockMarkAsRead: jest.Mock;
    let mockIntersectionObserver: jest.Mock;
    let observerCallbacks: Map<Element, IntersectionObserverCallback>;
    let mockNotifications: Notification[];

    beforeEach(() => {
        // Reset mocks
        mockMarkAsRead = jest.fn();
        observerCallbacks = new Map();

        // Create mock notifications
        mockNotifications = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Test notification 1',
                content: 'Content 1',
                createdAt: new Date().toISOString(),
            },
            {
                id: '2',
                userId: 'user-1',
                category: 'main',
                type: 'achievement',
                title: 'Test notification 2',
                content: 'Content 2',
                createdAt: new Date().toISOString(),
            },
        ];

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

    it('should create IntersectionObserver on mount', () => {
        renderHook(() => useAutoMarkAsRead(mockNotifications, 'main'));

        expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    it('should not create IntersectionObserver when disabled', () => {
        renderHook(() => useAutoMarkAsRead(mockNotifications, 'main', { enabled: false }));

        expect(mockIntersectionObserver).not.toHaveBeenCalled();
    });

    it('should observe notification elements', () => {
        const mockElements = mockNotifications.map((notification) => {
            const element = document.createElement('div');
            element.setAttribute('data-notification-id', notification.id);
            return element;
        });

        jest.spyOn(document, 'querySelectorAll').mockReturnValue(mockElements as any);

        renderHook(() => useAutoMarkAsRead(mockNotifications, 'main'));

        // Should have observed all elements
        expect(observerCallbacks.size).toBe(mockElements.length);
    });

    it('should mark notification as read after delay when visible', async () => {
        const delay = 100;
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-notification-id', '1');

        jest.spyOn(document, 'querySelectorAll').mockReturnValue([mockElement] as any);

        renderHook(() => useAutoMarkAsRead(mockNotifications, 'main', { delay }));

        // Simulate intersection
        const callback = observerCallbacks.get(mockElement);
        if (callback) {
            const entries: IntersectionObserverEntry[] = [
                {
                    target: mockElement,
                    isIntersecting: true,
                    intersectionRatio: 0.5,
                } as IntersectionObserverEntry,
            ];
            callback(entries, mockIntersectionObserver() as any);
        }

        // Wait for delay
        await waitFor(
            () => {
                expect(mockMarkAsRead).toHaveBeenCalledWith('1', 'main');
            },
            { timeout: delay + 500 }
        );
    });

    it('should not mark notification as read when not visible', async () => {
        const delay = 100;
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-notification-id', '1');

        jest.spyOn(document, 'querySelectorAll').mockReturnValue([mockElement] as any);

        renderHook(() => useAutoMarkAsRead(mockNotifications, 'main', { delay }));

        // Simulate intersection with isIntersecting: false
        const callback = observerCallbacks.get(mockElement);
        if (callback) {
            const entries: IntersectionObserverEntry[] = [
                {
                    target: mockElement,
                    isIntersecting: false,
                    intersectionRatio: 0,
                } as IntersectionObserverEntry,
            ];
            callback(entries, mockIntersectionObserver() as any);
        }

        // Wait for delay
        await new Promise((resolve) => setTimeout(resolve, delay + 100));

        // Should not have been called
        expect(mockMarkAsRead).not.toHaveBeenCalled();
    });

    it('should cancel timer when notification becomes invisible', async () => {
        const delay = 200;
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-notification-id', '1');

        jest.spyOn(document, 'querySelectorAll').mockReturnValue([mockElement] as any);

        renderHook(() => useAutoMarkAsRead(mockNotifications, 'main', { delay }));

        const callback = observerCallbacks.get(mockElement);
        if (callback) {
            // Make it visible
            callback(
                [
                    {
                        target: mockElement,
                        isIntersecting: true,
                        intersectionRatio: 0.5,
                    } as IntersectionObserverEntry,
                ],
                mockIntersectionObserver() as any
            );

            // Wait half the delay
            await new Promise((resolve) => setTimeout(resolve, delay / 2));

            // Make it invisible
            callback(
                [
                    {
                        target: mockElement,
                        isIntersecting: false,
                        intersectionRatio: 0,
                    } as IntersectionObserverEntry,
                ],
                mockIntersectionObserver() as any
            );

            // Wait for full delay
            await new Promise((resolve) => setTimeout(resolve, delay + 100));

            // Should not have been called
            expect(mockMarkAsRead).not.toHaveBeenCalled();
        }
    });

    it('should not mark already read notifications', async () => {
        const delay = 100;
        const readNotifications: Notification[] = [
            {
                ...mockNotifications[0],
                readAt: new Date().toISOString(),
            },
        ];

        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-notification-id', '1');

        jest.spyOn(document, 'querySelectorAll').mockReturnValue([mockElement] as any);

        renderHook(() => useAutoMarkAsRead(readNotifications, 'main', { delay }));

        const callback = observerCallbacks.get(mockElement);
        if (callback) {
            callback(
                [
                    {
                        target: mockElement,
                        isIntersecting: true,
                        intersectionRatio: 0.5,
                    } as IntersectionObserverEntry,
                ],
                mockIntersectionObserver() as any
            );
        }

        // Wait for delay
        await new Promise((resolve) => setTimeout(resolve, delay + 100));

        // Should not have been called
        expect(mockMarkAsRead).not.toHaveBeenCalled();
    });

    it('should disconnect observer on unmount', () => {
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-notification-id', '1');

        jest.spyOn(document, 'querySelectorAll').mockReturnValue([mockElement] as any);

        const { unmount } = renderHook(() => useAutoMarkAsRead(mockNotifications, 'main'));

        const observer = mockIntersectionObserver.mock.results[0].value;

        unmount();

        expect(observer.disconnect).toHaveBeenCalled();
    });

    it('should clear all timeouts on unmount', async () => {
        const delay = 200;
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-notification-id', '1');

        jest.spyOn(document, 'querySelectorAll').mockReturnValue([mockElement] as any);

        const { unmount } = renderHook(() => useAutoMarkAsRead(mockNotifications, 'main', { delay }));

        const callback = observerCallbacks.get(mockElement);
        if (callback) {
            // Make it visible
            callback(
                [
                    {
                        target: mockElement,
                        isIntersecting: true,
                        intersectionRatio: 0.5,
                    } as IntersectionObserverEntry,
                ],
                mockIntersectionObserver() as any
            );
        }

        // Unmount before delay completes
        unmount();

        // Wait for delay
        await new Promise((resolve) => setTimeout(resolve, delay + 100));

        // Should not have been called because unmount cleared the timeout
        expect(mockMarkAsRead).not.toHaveBeenCalled();
    });

    it('should use custom delay option', async () => {
        const customDelay = 150;
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-notification-id', '1');

        jest.spyOn(document, 'querySelectorAll').mockReturnValue([mockElement] as any);

        renderHook(() => useAutoMarkAsRead(mockNotifications, 'main', { delay: customDelay }));

        const callback = observerCallbacks.get(mockElement);
        if (callback) {
            callback(
                [
                    {
                        target: mockElement,
                        isIntersecting: true,
                        intersectionRatio: 0.5,
                    } as IntersectionObserverEntry,
                ],
                mockIntersectionObserver() as any
            );
        }

        // Wait for custom delay
        await waitFor(
            () => {
                expect(mockMarkAsRead).toHaveBeenCalledWith('1', 'main');
            },
            { timeout: customDelay + 500 }
        );
    });
});
