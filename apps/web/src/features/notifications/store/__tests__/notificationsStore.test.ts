/**
 * Tests for notifications Zustand store
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotificationsStore } from '../notificationsStore';
import { apiClient } from '@/shared/utils/api-client';
import { ApiError } from '@/shared/errors/apiErrors';
import type {
    Notification,
    GetNotificationsResponse,
    UnreadCountsResponse,
    MarkAsReadResponse,
    MarkAllAsReadResponse,
} from '../../types';

// Mock apiClient
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
    },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('notificationsStore', () => {
    beforeEach(() => {
        // Clear localStorage
        localStorage.clear();

        // Reset store state before each test
        const { result } = renderHook(() => useNotificationsStore());
        act(() => {
            result.current.stopPolling();
            // reset() also forgets list requests a previous test left pending
            result.current.reset();
        });
        jest.clearAllMocks();
        // Queued responses a previous test did not use must not leak into this one
        mockApiClient.get.mockReset();
        jest.clearAllTimers();
    });

    afterEach(() => {
        jest.clearAllTimers();
        localStorage.clear();
    });

    describe('fetchNotifications', () => {
        const mockNotifications: Notification[] = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'New feedback',
                content: 'Your trainer left feedback',
                createdAt: '2024-01-15T10:00:00Z',
            },
            {
                id: '2',
                userId: 'user-1',
                category: 'main',
                type: 'achievement',
                title: 'Achievement unlocked',
                content: 'You completed your goal',
                createdAt: '2024-01-15T09:00:00Z',
                readAt: '2024-01-15T09:30:00Z',
            },
        ];

        it('should fetch notifications successfully', async () => {
            const mockResponse: GetNotificationsResponse = {
                notifications: mockNotifications,
                total: 2,
                hasMore: false,
            };

            // pollForUpdates is called after fetchNotifications — must return same main notifications
            const mockMainResponse: GetNotificationsResponse = {
                notifications: mockNotifications,
                total: 2,
                hasMore: false,
            };

            const mockContentResponse: GetNotificationsResponse = {
                notifications: [],
                total: 0,
                hasMore: false,
            };

            const mockUnreadCounts: UnreadCountsResponse = {
                main: 1,
                content: 0,
            };

            mockApiClient.get
                .mockResolvedValueOnce(mockResponse)
                .mockResolvedValueOnce(mockMainResponse)
                .mockResolvedValueOnce(mockContentResponse)
                .mockResolvedValueOnce(mockUnreadCounts);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/notifications?category=main&limit=50&offset=0')
            );
            expect(result.current.notifications.main).toEqual(mockNotifications);
            expect(result.current.hasMore.main).toBe(false);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should handle pagination with offset', async () => {
            const mockResponse: GetNotificationsResponse = {
                notifications: mockNotifications,
                total: 100,
                hasMore: true,
            };

            mockApiClient.get.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main', 50);
            });

            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining('offset=50')
            );
        });

        it('should append notifications on pagination', async () => {
            const firstBatch: Notification[] = [mockNotifications[0]];
            const secondBatch: Notification[] = [mockNotifications[1]];

            const mockResponse1: GetNotificationsResponse = {
                notifications: firstBatch,
                total: 2,
                hasMore: true,
            };

            const mockResponse2: GetNotificationsResponse = {
                notifications: secondBatch,
                total: 2,
                hasMore: false,
            };


            const mockUnreadCounts: UnreadCountsResponse = {
                main: 1,
                content: 0,
            };


            // After each page only the counters are refreshed — not both lists again
            mockApiClient.get
                .mockResolvedValueOnce(mockResponse1)     // fetchNotifications('main', 0)
                .mockResolvedValueOnce(mockUnreadCounts)  // counters
                .mockResolvedValueOnce(mockResponse2);    // fetchNotifications('main', 1) — counters are fresh

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main', 0);
            });

            expect(result.current.notifications.main).toHaveLength(1);

            await act(async () => {
                await result.current.fetchNotifications('main', 1);
            });

            expect(result.current.notifications.main).toHaveLength(2);
        });

        it('should remove duplicate notifications', async () => {
            const duplicateNotifications = [mockNotifications[0], mockNotifications[0]];

            const mockResponse: GetNotificationsResponse = {
                notifications: duplicateNotifications,
                total: 1,
                hasMore: false,
            };

            mockApiClient.get.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            expect(result.current.notifications.main).toHaveLength(1);
        });

        it('should handle network errors', async () => {
            const networkError = new TypeError('Failed to fetch');
            mockApiClient.get.mockRejectedValue(networkError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            expect(result.current.error).toEqual({
                code: 'NETWORK_ERROR',
                message: 'Проверьте подключение к интернету',
            });
            expect(result.current.isLoading).toBe(false);
        });

        it('should handle 401 unauthorized errors', async () => {
            const authError = new ApiError(401, { message: 'Unauthorized' });
            mockApiClient.get.mockRejectedValue(authError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            await waitFor(() => {
                expect(result.current.error).toEqual({
                    code: 'UNAUTHORIZED',
                    message: 'Требуется авторизация',
                });
            });
        });

        it('should not fetch if already loading', async () => {
            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/notifications?category=main')) {
                    return new Promise((resolve) => {
                        setTimeout(() => resolve({
                            notifications: [],
                            total: 0,
                            hasMore: false
                        }), 100);
                    });
                }
                // Mock other endpoints for pollForUpdates
                if (url.includes('/notifications?category=content')) {
                    return Promise.resolve({ notifications: [], total: 0, hasMore: false });
                }
                if (url.includes('/unread-counts')) {
                    return Promise.resolve({ main: 0, content: 0 });
                }
                return Promise.resolve({});
            });

            const { result } = renderHook(() => useNotificationsStore());

            // Start first fetch (don't await)
            act(() => {
                result.current.fetchNotifications('main');
            });

            // Wait for loading state to be set
            await waitFor(() => {
                expect(result.current.isLoading).toBe(true);
            });

            // Try second fetch while first is loading - should be ignored
            act(() => {
                result.current.fetchNotifications('main');
            });

            // Wait for loading to complete
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            }, { timeout: 2000 });

            // One request for the main list: the duplicate was turned away,
            // and loading a list refreshes only the counters, not the lists
            const mainNotificationsCalls = mockApiClient.get.mock.calls.filter(
                call => call[0].includes('/notifications?category=main')
            );
            expect(mainNotificationsCalls.length).toBe(1);
        });

        it('should not fetch if no more data available', async () => {
            const { result } = renderHook(() => useNotificationsStore());

            // Set hasMore to false
            act(() => {
                useNotificationsStore.setState({
                    hasMore: { main: false, content: true },
                });
            });

            await act(async () => {
                await result.current.fetchNotifications('main', 50);
            });

            expect(mockApiClient.get).not.toHaveBeenCalled();
        });
    });

    describe('markAsRead', () => {
        const unreadNotification: Notification = {
            id: '1',
            userId: 'user-1',
            category: 'main',
            type: 'trainer_feedback',
            title: 'New feedback',
            content: 'Your trainer left feedback',
            createdAt: '2024-01-15T10:00:00Z',
        };

        beforeEach(() => {
            act(() => {
                useNotificationsStore.setState({
                    notifications: {
                        main: [unreadNotification],
                        content: [],
                    },
                    unreadCounts: { main: 1, content: 0 },
                });
            });
        });

        it('should mark notification as read with optimistic update', async () => {
            const mockResponse: MarkAsReadResponse = {
                success: true,
                readAt: '2024-01-15T10:30:00Z',
            };

            mockApiClient.post.mockResolvedValueOnce(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.markAsRead('1', 'main');
            });

            expect(mockApiClient.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/notifications/1/read'),
                {}
            );

            const notification = result.current.notifications.main[0];
            expect(notification.readAt).toBe('2024-01-15T10:30:00Z');
            expect(result.current.unreadCounts.main).toBe(0);
        });

        it('should rollback on API failure', async () => {
            // Use 422 (not 500) so retryWithBackoff doesn't retry (avoids 3s delay + async leaks)
            const apiError = new ApiError(422, { message: 'Server error' });
            mockApiClient.post.mockRejectedValue(apiError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                try {
                    await result.current.markAsRead('1', 'main');
                } catch {
                    // Expected to throw
                }
            });
            const notification = result.current.notifications.main[0];
            expect(notification.readAt).toBeUndefined();
            expect(result.current.unreadCounts.main).toBe(1);
            expect(result.current.error).toEqual({
                code: 'SERVER_ERROR',
                message: 'Произошла ошибка',
            });
        });

        it('should not mark already read notification', async () => {
            const readNotification: Notification = {
                ...unreadNotification,
                readAt: '2024-01-15T09:00:00Z',
            };

            act(() => {
                useNotificationsStore.setState({
                    notifications: {
                        main: [readNotification],
                        content: [],
                    },
                });
            });

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.markAsRead('1', 'main');
            });

            expect(mockApiClient.post).not.toHaveBeenCalled();
        });

        it('should not mark non-existent notification', async () => {
            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.markAsRead('non-existent', 'main');
            });

            expect(mockApiClient.post).not.toHaveBeenCalled();
        });

        it('should not decrement unread count below zero', async () => {
            act(() => {
                useNotificationsStore.setState({
                    unreadCounts: { main: 0, content: 0 },
                });
            });

            const mockResponse: MarkAsReadResponse = {
                success: true,
                readAt: '2024-01-15T10:30:00Z',
            };

            mockApiClient.post.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.markAsRead('1', 'main');
            });

            expect(result.current.unreadCounts.main).toBe(0);
        });
    });

    describe('markAllAsRead', () => {
        const notifications: Notification[] = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Notification 1',
                content: 'Content 1',
                createdAt: '2024-01-15T10:00:00Z',
            },
            {
                id: '2',
                userId: 'user-1',
                category: 'main',
                type: 'achievement',
                title: 'Notification 2',
                content: 'Content 2',
                createdAt: '2024-01-15T09:00:00Z',
                readAt: '2024-01-15T09:30:00Z',
            },
        ];

        beforeEach(() => {
            act(() => {
                useNotificationsStore.setState({
                    notifications: {
                        main: notifications,
                        content: [],
                    },
                    unreadCounts: { main: 1, content: 0 },
                });
            });
        });

        it('should mark all notifications as read', async () => {
            const mockResponse: MarkAllAsReadResponse = {
                success: true,
                markedCount: 1,
            };

            mockApiClient.post.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.markAllAsRead('main');
            });

            expect(mockApiClient.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/notifications/mark-all-read'),
                { category: 'main' }
            );

            result.current.notifications.main.forEach((notification) => {
                expect(notification.readAt).toBeDefined();
            });
            expect(result.current.unreadCounts.main).toBe(0);
        });

        it('should rollback on API failure', async () => {
            const apiError = new ApiError(500, { message: 'Server error' });
            mockApiClient.post.mockRejectedValue(apiError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                try {
                    await result.current.markAllAsRead('main');
                } catch {
                    // Expected to throw
                }
            });

            // Should rollback to original state
            expect(result.current.notifications.main[0].readAt).toBeUndefined();
            expect(result.current.unreadCounts.main).toBe(1);
            expect(result.current.error).toBeDefined();
        });

        it('should do nothing when all notifications are already read', async () => {
            const readNotifications: Notification[] = [
                {
                    id: '1',
                    userId: 'user-1',
                    category: 'main',
                    type: 'trainer_feedback',
                    title: 'Notification 1',
                    content: 'Content 1',
                    createdAt: '2024-01-15T10:00:00Z',
                    readAt: '2024-01-15T10:30:00Z',
                },
            ];

            act(() => {
                useNotificationsStore.setState({
                    notifications: {
                        main: readNotifications,
                        content: [],
                    },
                    unreadCounts: { main: 0, content: 0 },
                });
            });

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.markAllAsRead('main');
            });

            // Should not call API
            expect(mockApiClient.post).not.toHaveBeenCalled();
        });
    });

    describe('reset', () => {
        it('should reset store to initial state', () => {
            act(() => {
                useNotificationsStore.setState({
                    notifications: {
                        main: [
                            {
                                id: '1',
                                userId: 'user-1',
                                category: 'main',
                                type: 'trainer_feedback',
                                title: 'Test',
                                content: 'Test content',
                                createdAt: '2024-01-15T10:00:00Z',
                            },
                        ],
                        content: [],
                    },
                    unreadCounts: { main: 1, content: 0 },
                    error: { code: 'NETWORK_ERROR', message: 'Test error' },
                });
            });

            const { result } = renderHook(() => useNotificationsStore());

            act(() => {
                result.current.reset();
            });

            expect(result.current.notifications.main).toEqual([]);
            expect(result.current.notifications.content).toEqual([]);
            expect(result.current.unreadCounts.main).toBe(0);
            expect(result.current.unreadCounts.content).toBe(0);
            expect(result.current.error).toBeNull();
            expect(result.current.isLoading).toBe(false);
        });

        it('should stop polling when resetting', () => {
            const { result } = renderHook(() => useNotificationsStore());

            act(() => {
                result.current.startPolling();
            });

            expect(result.current.pollingIntervalId).not.toBeNull();

            act(() => {
                result.current.reset();
            });

            expect(result.current.pollingIntervalId).toBeNull();
        });
    });

    describe('fetchUnreadCounts', () => {
        it('should fetch unread counts successfully', async () => {
            const mockResponse: UnreadCountsResponse = {
                main: 5,
                content: 12,
            };

            mockApiClient.get.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchUnreadCounts();
            });

            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/notifications/unread-counts')
            );
            expect(result.current.unreadCounts).toEqual({
                main: 5,
                content: 12,
            });
        });

        it('should not set error on failure (non-critical)', async () => {
            const apiError = new Error('Network error');
            mockApiClient.get.mockRejectedValue(apiError);

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchUnreadCounts();
            });

            expect(result.current.error).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to fetch unread counts:',
                apiError
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('pollForUpdates', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should poll for new notifications', async () => {
            const existingNotification: Notification = {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Existing',
                content: 'Content',
                createdAt: '2024-01-15T09:00:00Z',
            };

            const newNotification: Notification = {
                id: '2',
                userId: 'user-1',
                category: 'main',
                type: 'achievement',
                title: 'New',
                content: 'New content',
                createdAt: '2024-01-15T10:00:00Z',
            };

            // The main list is open (loaded); the content list is not.
            act(() => {
                useNotificationsStore.setState({
                    notifications: {
                        main: [existingNotification],
                        content: [],
                    },
                    unreadCounts: { main: 0, content: 0 },
                    listsLoaded: { main: true, content: false },
                });
            });

            const mockMainResponse: GetNotificationsResponse = {
                notifications: [newNotification, existingNotification],
                total: 2,
                hasMore: false,
            };

            const mockUnreadCounts: UnreadCountsResponse = {
                main: 1,
                content: 3,
            };

            mockApiClient.get
                .mockResolvedValueOnce(mockUnreadCounts)
                .mockResolvedValueOnce(mockMainResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.pollForUpdates();
            });

            expect(result.current.unreadCounts).toEqual({ main: 1, content: 3 });
            expect(result.current.notifications.main).toHaveLength(2);
            expect(result.current.notifications.main[0].id).toBe('2'); // New notification prepended
            // The counters first, then only the list that is open and changed
            const urls = mockApiClient.get.mock.calls.map((call) => call[0]);
            expect(urls).toHaveLength(2);
            expect(urls[0]).toContain('/notifications/unread-counts');
            expect(urls[1]).toContain('category=main');
        });

        it('for the badge alone asks only for the counters', async () => {
            mockApiClient.get.mockResolvedValueOnce({ main: 2, content: 1 });

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.pollForUpdates();
            });

            expect(result.current.unreadCounts).toEqual({ main: 2, content: 1 });
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(mockApiClient.get.mock.calls[0][0]).toContain('/notifications/unread-counts');
        });

        it('does not reload an open list when the counters did not move', async () => {
            act(() => {
                useNotificationsStore.setState({
                    unreadCounts: { main: 1, content: 0 },
                    listsLoaded: { main: true, content: true },
                });
            });
            mockApiClient.get.mockResolvedValueOnce({ main: 1, content: 0 });

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.pollForUpdates();
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
        });

        it('should not set error on polling failure', async () => {
            const apiError = new Error('Network error');
            mockApiClient.get.mockRejectedValue(apiError);

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.pollForUpdates();
            });

            expect(result.current.error).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith('Polling failed:', apiError);

            consoleErrorSpy.mockRestore();
        });
    });

    describe('startPolling and stopPolling', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should start polling with interval', async () => {
            const mockResponse: GetNotificationsResponse = {
                notifications: [],
                total: 0,
                hasMore: false,
            };

            mockApiClient.get.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            act(() => {
                result.current.startPolling();
            });

            // Initial poll
            await waitFor(() => {
                expect(mockApiClient.get).toHaveBeenCalled();
            });

            const initialCallCount = mockApiClient.get.mock.calls.length;

            // Advance time by 30 seconds
            act(() => {
                jest.advanceTimersByTime(30000);
            });

            await waitFor(() => {
                expect(mockApiClient.get.mock.calls.length).toBeGreaterThan(initialCallCount);
            });

            expect(result.current.pollingIntervalId).not.toBeNull();
        });

        it('should not start polling if already polling', () => {
            const { result } = renderHook(() => useNotificationsStore());

            act(() => {
                result.current.startPolling();
                const firstIntervalId = result.current.pollingIntervalId;
                result.current.startPolling();
                const secondIntervalId = result.current.pollingIntervalId;

                expect(firstIntervalId).toBe(secondIntervalId);
            });
        });

        it('should stop polling', () => {
            const { result } = renderHook(() => useNotificationsStore());

            act(() => {
                result.current.startPolling();
            });

            expect(result.current.pollingIntervalId).not.toBeNull();

            act(() => {
                result.current.stopPolling();
            });

            expect(result.current.pollingIntervalId).toBeNull();
        });
    });

    describe('clearError', () => {
        it('should clear error state', () => {
            act(() => {
                useNotificationsStore.setState({
                    error: {
                        code: 'NETWORK_ERROR',
                        message: 'Network error',
                    },
                });
            });

            const { result } = renderHook(() => useNotificationsStore());

            act(() => {
                result.current.clearError();
            });

            expect(result.current.error).toBeNull();
        });
    });

    describe('error mapping', () => {
        it('should map 404 errors correctly', async () => {
            const notFoundError = new ApiError(404, { message: 'Not found' });
            mockApiClient.get.mockRejectedValue(notFoundError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            expect(result.current.error).toEqual({
                code: 'NOT_FOUND',
                message: 'Уведомление не найдено',
            });
        });

        it('should map 400 validation errors correctly', async () => {
            const validationError = new ApiError(400, { message: 'Invalid category' });
            mockApiClient.get.mockRejectedValue(validationError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            expect(result.current.error).toEqual({
                code: 'VALIDATION_ERROR',
                message: 'Invalid category',
            });
        });

        it('should map 500 server errors correctly', async () => {
            const serverError = new ApiError(500, { message: 'Internal server error' });
            mockApiClient.get.mockRejectedValue(serverError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            expect(result.current.error).toEqual({
                code: 'SERVER_ERROR',
                message: 'Сервис временно недоступен',
            });
        });

        it('should handle unknown errors', async () => {
            const unknownError = new Error('Unknown error');
            mockApiClient.get.mockRejectedValue(unknownError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.fetchNotifications('main');
            });

            expect(result.current.error).toEqual({
                code: 'SERVER_ERROR',
                message: 'Произошла ошибка',
            });
        });
    });
});

describe('Property 19: Offline Caching', () => {
    /**
     * Feature: notifications-page, Property 19: Offline Caching
     * Validates: Requirements 7.5
     *
     * For any successfully loaded set of notifications, the system should cache them
     * locally so they remain viewable when the user goes offline.
     */

    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
        jest.clearAllMocks();
        // Queued responses a previous case did not use must not leak into this one
        mockApiClient.get.mockReset();
        // Each case starts from a clean store: online, nothing open or in flight
        act(() => {
            useNotificationsStore.getState().stopPolling();
            useNotificationsStore.getState().reset();
        });
    });

    afterEach(() => {
        act(() => {
            useNotificationsStore.getState().stopPolling();
        });
    });

    it('should cache notifications in localStorage after successful fetch', async () => {
        const mockNotifications: Notification[] = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Cached notification',
                content: 'This should be cached',
                createdAt: '2024-01-15T10:00:00Z',
            },
        ];

        const mockResponse: GetNotificationsResponse = {
            notifications: mockNotifications,
            total: 1,
            hasMore: false,
        };

        const mockUnreadCounts: UnreadCountsResponse = {
            main: 1,
            content: 0,
        };

        mockApiClient.get
            .mockResolvedValueOnce(mockResponse)       // fetchNotifications
            .mockResolvedValueOnce(mockUnreadCounts);  // its counters

        const { result } = renderHook(() => useNotificationsStore());

        await act(async () => {
            await result.current.fetchNotifications('main');
        });

        // Verify data is cached in localStorage
        const cachedMain = localStorage.getItem('notifications_cache_main');
        expect(cachedMain).not.toBeNull();

        const parsedCache = JSON.parse(cachedMain!);
        expect(parsedCache).toHaveLength(1);
        expect(parsedCache[0].id).toBe('1');
        expect(parsedCache[0].title).toBe('Cached notification');
    });

    it('should load cached notifications when offline', async () => {
        const cachedNotifications: Notification[] = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Cached notification',
                content: 'This was cached',
                createdAt: '2024-01-15T10:00:00Z',
            },
        ];

        // Pre-populate cache
        localStorage.setItem('notifications_cache_main', JSON.stringify(cachedNotifications));
        localStorage.setItem('notifications_cache_content', JSON.stringify([]));
        localStorage.setItem('notifications_unread_counts', JSON.stringify({ main: 1, content: 0 }));

        const { result } = renderHook(() => useNotificationsStore());

        // Simulate offline state
        act(() => {
            result.current.setOfflineStatus(true);
        });

        // Try to fetch notifications while offline
        await act(async () => {
            await result.current.fetchNotifications('main');
        });

        // Should load from cache instead of making API call
        expect(mockApiClient.get).not.toHaveBeenCalled();
        expect(result.current.notifications.main).toHaveLength(1);
        expect(result.current.notifications.main[0].title).toBe('Cached notification');
    });

    it('should load from cache on network error', async () => {
        const cachedNotifications: Notification[] = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Cached notification',
                content: 'This was cached',
                createdAt: '2024-01-15T10:00:00Z',
            },
        ];

        // Pre-populate cache
        localStorage.setItem('notifications_cache_main', JSON.stringify(cachedNotifications));
        localStorage.setItem('notifications_cache_content', JSON.stringify([]));

        const networkError = new TypeError('Failed to fetch');
        mockApiClient.get.mockRejectedValue(networkError);

        const { result } = renderHook(() => useNotificationsStore());

        await act(async () => {
            await result.current.fetchNotifications('main');
        });

        // Should load from cache after network error
        expect(result.current.notifications.main).toHaveLength(1);
        expect(result.current.notifications.main[0].title).toBe('Cached notification');
        // Error should be set and offline status should be true
        expect(result.current.isOffline).toBe(true);
    });

    it('should sync data when coming back online', async () => {
        const cachedNotifications: Notification[] = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Old cached notification',
                content: 'This was cached',
                createdAt: '2024-01-15T09:00:00Z',
            },
        ];

        const freshNotifications: Notification[] = [
            {
                id: '2',
                userId: 'user-1',
                category: 'main',
                type: 'achievement',
                title: 'Fresh notification',
                content: 'This is fresh from server',
                createdAt: '2024-01-15T10:00:00Z',
            },
        ];

        // Pre-populate cache
        localStorage.setItem('notifications_cache_main', JSON.stringify(cachedNotifications));

        const mockResponse: GetNotificationsResponse = {
            notifications: freshNotifications,
            total: 1,
            hasMore: false,
        };

        const mockUnreadCounts: UnreadCountsResponse = {
            main: 1,
            content: 0,
        };

        mockApiClient.get
            .mockResolvedValueOnce(mockResponse)       // the open list, refreshed
            .mockResolvedValueOnce(mockUnreadCounts);  // its counters

        const { result } = renderHook(() => useNotificationsStore());

        // Start offline, with the main list open from the cache
        act(() => {
            result.current.setOfflineStatus(true);
        });
        await act(async () => {
            await result.current.fetchNotifications('main', 0);
        });
        expect(result.current.notifications.main[0].title).toBe('Old cached notification');

        // Come back online
        await act(async () => {
            result.current.setOfflineStatus(false);
        });

        // Wait for sync to complete
        await waitFor(() => {
            expect(result.current.notifications.main).toHaveLength(1);
        });

        // Should have fresh data from server
        expect(result.current.notifications.main[0].title).toBe('Fresh notification');
    });

    it('should cache unread counts', async () => {
        const mockResponse: GetNotificationsResponse = {
            notifications: [],
            total: 0,
            hasMore: false,
        };

        const mockUnreadCounts: UnreadCountsResponse = {
            main: 5,
            content: 12,
        };

        mockApiClient.get
            .mockResolvedValueOnce(mockResponse)       // the list
            .mockResolvedValueOnce(mockUnreadCounts);  // its counters

        const { result } = renderHook(() => useNotificationsStore());

        await act(async () => {
            await result.current.fetchNotifications('main');
        });

        // Verify unread counts are cached
        const cachedCounts = localStorage.getItem('notifications_unread_counts');
        expect(cachedCounts).not.toBeNull();

        const parsedCounts = JSON.parse(cachedCounts!);
        expect(parsedCounts.main).toBe(5);
        expect(parsedCounts.content).toBe(12);
    });

    it('should handle corrupted cache gracefully', async () => {
        // Set corrupted cache data
        localStorage.setItem('notifications_cache_main', 'invalid json{');

        const { result } = renderHook(() => useNotificationsStore());

        // Should not throw error
        act(() => {
            result.current.loadFromCache();
        });

        // Should have empty notifications
        expect(result.current.notifications.main).toEqual([]);
    });

    it('should update cache when polling receives new notifications', async () => {
        const initialNotifications: Notification[] = [
            {
                id: '1',
                userId: 'user-1',
                category: 'main',
                type: 'trainer_feedback',
                title: 'Initial',
                content: 'Initial content',
                createdAt: '2024-01-15T09:00:00Z',
            },
        ];

        const newNotifications: Notification[] = [
            {
                id: '2',
                userId: 'user-1',
                category: 'main',
                type: 'achievement',
                title: 'New from polling',
                content: 'New content',
                createdAt: '2024-01-15T10:00:00Z',
            },
            ...initialNotifications,
        ];

        act(() => {
            useNotificationsStore.setState({
                notifications: {
                    main: initialNotifications,
                    content: [],
                },
                unreadCounts: { main: 0, content: 0 },
                listsLoaded: { main: true, content: false },
            });
        });

        const mockMainResponse: GetNotificationsResponse = {
            notifications: newNotifications,
            total: 2,
            hasMore: false,
        };

        const mockUnreadCounts: UnreadCountsResponse = {
            main: 1,
            content: 0,
        };

        mockApiClient.get
            .mockResolvedValueOnce(mockUnreadCounts)
            .mockResolvedValueOnce(mockMainResponse);

        const { result } = renderHook(() => useNotificationsStore());

        await act(async () => {
            await result.current.pollForUpdates();
        });

        // Verify cache is updated with new notifications
        const cachedMain = localStorage.getItem('notifications_cache_main');
        const parsedCache = JSON.parse(cachedMain!);
        expect(parsedCache).toHaveLength(2);
        expect(parsedCache[0].id).toBe('2');
    });
});

describe('notificationsStore — no repeats', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApiClient.get.mockReset();
        act(() => {
            useNotificationsStore.getState().stopPolling();
            useNotificationsStore.getState().reset();
        });
    });

    it('"online, as before" on page mount reloads nothing', () => {
        act(() => useNotificationsStore.getState().setOfflineStatus(false));
        expect(mockApiClient.get).not.toHaveBeenCalled();
        expect(useNotificationsStore.getState().pollingIntervalId).toBeNull();
    });

    it('back online with no list open asks only for the counters', async () => {
        mockApiClient.get.mockResolvedValue({ main: 0, content: 0 });
        act(() => useNotificationsStore.setState({ isOffline: true }));
        await act(async () => {
            useNotificationsStore.getState().setOfflineStatus(false);
            await Promise.resolve();
        });
        const urls = mockApiClient.get.mock.calls.map((call) => call[0]);
        expect(urls.every((url) => url.includes('/unread-counts'))).toBe(true);
        act(() => useNotificationsStore.getState().stopPolling());
    });

    it('a list that loads right after the counters were asked does not ask again', async () => {
        mockApiClient.get.mockImplementation(async (url: string) =>
            url.includes('/unread-counts') ? { main: 0, content: 0 } : { notifications: [], total: 0, hasMore: false }
        );
        await act(async () => {
            await useNotificationsStore.getState().fetchUnreadCounts();
            await useNotificationsStore.getState().fetchNotifications('main');
            await useNotificationsStore.getState().fetchNotifications('content');
        });
        const counts = mockApiClient.get.mock.calls.filter((call) => call[0].includes('/unread-counts'));
        expect(counts).toHaveLength(1);
    });

    it('both lists of the page load side by side — the second is not turned away', async () => {
        mockApiClient.get.mockImplementation(async (url: string) =>
            url.includes('/unread-counts')
                ? { main: 0, content: 0 }
                : { notifications: [{ id: url.includes('content') ? 'c' : 'm', userId: 'u', category: url.includes('content') ? 'content' : 'main', type: 'reminder', title: 't', content: 'c', createdAt: '2024-01-01T00:00:00Z' }], total: 1, hasMore: false }
        );
        await act(async () => {
            await Promise.all([
                useNotificationsStore.getState().fetchNotifications('main'),
                useNotificationsStore.getState().fetchNotifications('content'),
            ]);
        });
        const state = useNotificationsStore.getState();
        expect(state.notifications.main).toHaveLength(1);
        expect(state.notifications.content).toHaveLength(1);
        expect(state.isLoading).toBe(false);
        expect(state.listsLoaded).toEqual({ main: true, content: true });
    });
});
