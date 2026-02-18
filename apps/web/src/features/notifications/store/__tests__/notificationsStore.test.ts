/**
 * Tests for notifications Zustand store
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotificationsStore } from '../notificationsStore';
import { apiClient } from '@/shared/utils/api-client';
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
            useNotificationsStore.setState({
                notifications: { main: [], content: [] },
                unreadCounts: { main: 0, content: 0 },
                isLoading: false,
                error: null,
                hasMore: { main: true, content: true },
                pollingIntervalId: null,
                isOffline: false,
                retryCount: 0,
            });
        });
        jest.clearAllMocks();
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

            const mockMainResponse: GetNotificationsResponse = {
                notifications: [],
                total: 0,
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
                expect.stringContaining('/backend-api/v1/notifications?category=main&limit=50&offset=0')
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

            const mockEmptyResponse: GetNotificationsResponse = {
                notifications: [],
                total: 0,
                hasMore: false,
            };

            const mockUnreadCounts: UnreadCountsResponse = {
                main: 1,
                content: 0,
            };

            mockApiClient.get
                .mockResolvedValueOnce(mockResponse1)
                .mockResolvedValueOnce(mockEmptyResponse)
                .mockResolvedValueOnce(mockEmptyResponse)
                .mockResolvedValueOnce(mockUnreadCounts)
                .mockResolvedValueOnce(mockResponse2)
                .mockResolvedValueOnce(mockEmptyResponse)
                .mockResolvedValueOnce(mockEmptyResponse)
                .mockResolvedValueOnce(mockUnreadCounts);

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
            const authError = {
                response: { status: 401, data: { message: 'Unauthorized' } },
            };
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
            let callCount = 0;
            mockApiClient.get.mockImplementation((url: string) => {
                callCount++;
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

            // Count calls to the main notifications endpoint
            // Should be 2: one from fetchNotifications, one from pollForUpdates
            // (not 3, which would indicate the duplicate call wasn't prevented)
            const mainNotificationsCalls = mockApiClient.get.mock.calls.filter(
                call => call[0].includes('/notifications?category=main')
            );
            expect(mainNotificationsCalls.length).toBe(2);
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

            mockApiClient.post.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.markAsRead('1', 'main');
            });

            expect(mockApiClient.post).toHaveBeenCalledWith(
                expect.stringContaining('/backend-api/v1/notifications/1/read'),
                {}
            );

            const notification = result.current.notifications.main[0];
            expect(notification.readAt).toBe('2024-01-15T10:30:00Z');
            expect(result.current.unreadCounts.main).toBe(0);
        });

        it('should rollback on API failure', async () => {
            const apiError = {
                response: { status: 500, data: { message: 'Server error' } },
            };
            mockApiClient.post.mockRejectedValue(apiError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                try {
                    await result.current.markAsRead('1', 'main');
                } catch (error) {
                    // Expected to throw
                }
            });

            // Should rollback to unread state
            const notification = result.current.notifications.main[0];
            expect(notification.readAt).toBeUndefined();
            expect(result.current.unreadCounts.main).toBe(1);
            expect(result.current.error).toEqual({
                code: 'SERVER_ERROR',
                message: 'Сервис временно недоступен',
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
                expect.stringContaining('/backend-api/v1/notifications/mark-all-read'),
                { category: 'main' }
            );

            result.current.notifications.main.forEach((notification) => {
                expect(notification.readAt).toBeDefined();
            });
            expect(result.current.unreadCounts.main).toBe(0);
        });

        it('should rollback on API failure', async () => {
            const apiError = {
                response: { status: 500, data: { message: 'Server error' } },
            };
            mockApiClient.post.mockRejectedValue(apiError);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                try {
                    await result.current.markAllAsRead('main');
                } catch (error) {
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
                expect.stringContaining('/backend-api/v1/notifications/unread-counts')
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

            act(() => {
                useNotificationsStore.setState({
                    notifications: {
                        main: [existingNotification],
                        content: [],
                    },
                });
            });

            const mockMainResponse: GetNotificationsResponse = {
                notifications: [newNotification, existingNotification],
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
                .mockResolvedValueOnce(mockMainResponse)
                .mockResolvedValueOnce(mockContentResponse)
                .mockResolvedValueOnce(mockUnreadCounts);

            const { result } = renderHook(() => useNotificationsStore());

            await act(async () => {
                await result.current.pollForUpdates();
            });

            expect(result.current.notifications.main).toHaveLength(2);
            expect(result.current.notifications.main[0].id).toBe('2'); // New notification prepended
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

            const mockUnreadCounts: UnreadCountsResponse = {
                main: 0,
                content: 0,
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
            const notFoundError = {
                response: { status: 404, data: { message: 'Not found' } },
            };
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
            const validationError = {
                response: { status: 400, data: { message: 'Invalid category' } },
            };
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
            const serverError = {
                response: { status: 500, data: { message: 'Internal server error' } },
            };
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

        const mockEmptyResponse: GetNotificationsResponse = {
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
            .mockResolvedValueOnce(mockEmptyResponse)
            .mockResolvedValueOnce(mockEmptyResponse)
            .mockResolvedValueOnce(mockUnreadCounts);

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

        const mockEmptyResponse: GetNotificationsResponse = {
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
            .mockResolvedValueOnce(mockEmptyResponse)
            .mockResolvedValueOnce(mockEmptyResponse)
            .mockResolvedValueOnce(mockUnreadCounts);

        const { result } = renderHook(() => useNotificationsStore());

        // Start offline
        act(() => {
            result.current.setOfflineStatus(true);
        });

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
            .mockResolvedValueOnce(mockResponse)
            .mockResolvedValueOnce(mockResponse)
            .mockResolvedValueOnce(mockResponse)
            .mockResolvedValueOnce(mockUnreadCounts);

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
            });
        });

        const mockMainResponse: GetNotificationsResponse = {
            notifications: newNotifications,
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
            .mockResolvedValueOnce(mockMainResponse)
            .mockResolvedValueOnce(mockContentResponse)
            .mockResolvedValueOnce(mockUnreadCounts);

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
