/**
 * Unit tests for useNotifications hook
 * Tests data fetching, pagination, and mark as read functionality
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useNotifications } from '../useNotifications';
import { useNotificationsStore } from '../../store/notificationsStore';
import type { Notification, NotificationCategory } from '../../types';

// Mock the store
jest.mock('../../store/notificationsStore');

describe('useNotifications', () => {
    let mockFetchNotifications: jest.Mock;
    let mockMarkAsRead: jest.Mock;
    let mockNotifications: Notification[];

    beforeEach(() => {
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

        // Reset mocks
        mockFetchNotifications = jest.fn();
        mockMarkAsRead = jest.fn();

        // Mock the store
        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                notifications: {
                    main: mockNotifications,
                    content: [],
                },
                unreadCounts: {
                    main: 2,
                    content: 0,
                },
                isLoading: false,
                error: null,
                hasMore: {
                    main: true,
                    content: false,
                },
                fetchNotifications: mockFetchNotifications,
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should fetch initial notifications on mount', () => {
        const { result } = renderHook(() => useNotifications('main'));

        expect(mockFetchNotifications).toHaveBeenCalledWith('main', 0);
        expect(result.current.notifications).toEqual(mockNotifications);
        expect(result.current.unreadCount).toBe(2);
    });

    it('should return correct state for category', () => {
        const { result } = renderHook(() => useNotifications('main'));

        expect(result.current.notifications).toEqual(mockNotifications);
        expect(result.current.unreadCount).toBe(2);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.hasMore).toBe(true);
    });

    it('should fetch more notifications when fetchMore is called', () => {
        const { result } = renderHook(() => useNotifications('main'));

        result.current.fetchMore();

        expect(mockFetchNotifications).toHaveBeenCalledWith('main', mockNotifications.length);
    });

    it('should not fetch more when isLoading is true', () => {
        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                notifications: { main: mockNotifications, content: [] },
                unreadCounts: { main: 2, content: 0 },
                isLoading: true,
                error: null,
                hasMore: { main: true, content: false },
                fetchNotifications: mockFetchNotifications,
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });

        const { result } = renderHook(() => useNotifications('main'));

        // Clear the initial fetch call
        mockFetchNotifications.mockClear();

        result.current.fetchMore();

        // Should not call fetch when loading
        expect(mockFetchNotifications).not.toHaveBeenCalled();
    });

    it('should not fetch more when hasMore is false', () => {
        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                notifications: { main: mockNotifications, content: [] },
                unreadCounts: { main: 2, content: 0 },
                isLoading: false,
                error: null,
                hasMore: { main: false, content: false },
                fetchNotifications: mockFetchNotifications,
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });

        const { result } = renderHook(() => useNotifications('main'));

        // Clear the initial fetch call
        mockFetchNotifications.mockClear();

        result.current.fetchMore();

        // Should not call fetch when no more data
        expect(mockFetchNotifications).not.toHaveBeenCalled();
    });

    it('should mark notification as read', () => {
        const { result } = renderHook(() => useNotifications('main'));

        result.current.markAsRead('1');

        expect(mockMarkAsRead).toHaveBeenCalledWith('1', 'main');
    });

    it('should refresh notifications', () => {
        const { result } = renderHook(() => useNotifications('main'));

        // Clear the initial fetch call
        mockFetchNotifications.mockClear();

        result.current.refresh();

        expect(mockFetchNotifications).toHaveBeenCalledWith('main', 0);
    });

    it('should work with content category', () => {
        const contentNotifications: Notification[] = [
            {
                id: '3',
                userId: 'user-1',
                category: 'content',
                type: 'system_update',
                title: 'System update',
                content: 'New features available',
                createdAt: new Date().toISOString(),
            },
        ];

        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                notifications: { main: [], content: contentNotifications },
                unreadCounts: { main: 0, content: 1 },
                isLoading: false,
                error: null,
                hasMore: { main: false, content: true },
                fetchNotifications: mockFetchNotifications,
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });

        const { result } = renderHook(() => useNotifications('content'));

        expect(result.current.notifications).toEqual(contentNotifications);
        expect(result.current.unreadCount).toBe(1);
        expect(result.current.hasMore).toBe(true);
    });

    it('should handle error state', () => {
        const mockError = {
            code: 'NETWORK_ERROR' as const,
            message: 'Network error',
        };

        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                notifications: { main: [], content: [] },
                unreadCounts: { main: 0, content: 0 },
                isLoading: false,
                error: mockError,
                hasMore: { main: false, content: false },
                fetchNotifications: mockFetchNotifications,
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });

        const { result } = renderHook(() => useNotifications('main'));

        expect(result.current.error).toEqual(mockError);
    });

    it('should handle empty notifications array', () => {
        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                notifications: { main: [], content: [] },
                unreadCounts: { main: 0, content: 0 },
                isLoading: false,
                error: null,
                hasMore: { main: false, content: false },
                fetchNotifications: mockFetchNotifications,
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });

        const { result } = renderHook(() => useNotifications('main'));

        expect(result.current.notifications).toEqual([]);
        expect(result.current.unreadCount).toBe(0);
        expect(result.current.hasMore).toBe(false);
    });

    it('should refetch when category changes', () => {
        const { rerender } = renderHook(
            ({ category }) => useNotifications(category),
            { initialProps: { category: 'main' as NotificationCategory } }
        );

        // Clear initial fetch
        mockFetchNotifications.mockClear();

        // Change category
        rerender({ category: 'content' as NotificationCategory });

        expect(mockFetchNotifications).toHaveBeenCalledWith('content', 0);
    });

    it('should use correct offset when fetching more', () => {
        const largeNotificationList: Notification[] = Array.from({ length: 25 }, (_, i) => ({
            id: `${i + 1}`,
            userId: 'user-1',
            category: 'main',
            type: 'trainer_feedback',
            title: `Notification ${i + 1}`,
            content: `Content ${i + 1}`,
            createdAt: new Date().toISOString(),
        }));

        (useNotificationsStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                notifications: { main: largeNotificationList, content: [] },
                unreadCounts: { main: 25, content: 0 },
                isLoading: false,
                error: null,
                hasMore: { main: true, content: false },
                fetchNotifications: mockFetchNotifications,
                markAsRead: mockMarkAsRead,
            };
            return selector(state);
        });

        const { result } = renderHook(() => useNotifications('main'));

        // Clear initial fetch
        mockFetchNotifications.mockClear();

        result.current.fetchMore();

        expect(mockFetchNotifications).toHaveBeenCalledWith('main', 25);
    });

    it('should handle multiple mark as read calls', () => {
        const { result } = renderHook(() => useNotifications('main'));

        result.current.markAsRead('1');
        result.current.markAsRead('2');

        expect(mockMarkAsRead).toHaveBeenCalledTimes(2);
        expect(mockMarkAsRead).toHaveBeenNthCalledWith(1, '1', 'main');
        expect(mockMarkAsRead).toHaveBeenNthCalledWith(2, '2', 'main');
    });

    it('should handle rapid refresh calls', () => {
        const { result } = renderHook(() => useNotifications('main'));

        // Clear initial fetch
        mockFetchNotifications.mockClear();

        result.current.refresh();
        result.current.refresh();
        result.current.refresh();

        expect(mockFetchNotifications).toHaveBeenCalledTimes(3);
        expect(mockFetchNotifications).toHaveBeenCalledWith('main', 0);
    });
});
