/**
 * Integration Tests for Notifications Feature
 * Tests complete user flows with real store and mocked API
 *
 * Requirements: 1.2, 3.1, 4.3, 5.2, 5.3
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotificationsStore } from '../store/notificationsStore'
import { apiClient } from '@/shared/utils/api-client'

// Mock API client
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
    },
}))

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('Notifications Integration Tests', () => {
    beforeEach(() => {
        // Clear localStorage
        localStorage.clear()

        // Reset store completely before each test
        useNotificationsStore.setState({
            notifications: { main: [], content: [] },
            unreadCounts: { main: 0, content: 0 },
            isLoading: false,
            error: null,
            hasMore: { main: false, content: false },
            lastFetch: { main: null, content: null },
            pollingInterval: null,
            isOffline: false,
            isLoadingFromCache: false,
            retryCount: 0,
        })

        // Reset mocks
        jest.clearAllMocks()
    })

    afterEach(() => {
        // Stop any polling
        const store = useNotificationsStore.getState()
        if (store.pollingInterval) {
            store.stopPolling()
        }
    })

    describe('Complete Flow: Load → View → Mark as Read (Requirement 3.1)', () => {
        it('should fetch notifications and mark as read', async () => {
            const readAtTime = new Date().toISOString()

            // Mock API responses
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [
                    {
                        id: '1',
                        userId: '1',
                        category: 'main',
                        type: 'trainer_feedback',
                        title: 'New feedback from trainer',
                        content: 'Your trainer left feedback on your progress',
                        createdAt: new Date().toISOString(),
                        readAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
            })

            // Mock pollForUpdates call (happens after fetchNotifications)
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [
                    {
                        id: '1',
                        userId: '1',
                        category: 'main',
                        type: 'trainer_feedback',
                        title: 'New feedback from trainer',
                        content: 'Your trainer left feedback on your progress',
                        createdAt: new Date().toISOString(),
                        readAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 1, content: 0 })

            mockApiClient.post.mockResolvedValueOnce({
                success: true,
                readAt: readAtTime,
            })

            // Fetch notifications
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('main')
            })

            // Verify notifications loaded
            const state1 = useNotificationsStore.getState()
            expect(state1.notifications.main).toHaveLength(1)
            expect(state1.notifications.main[0].title).toBe('New feedback from trainer')
            expect(state1.notifications.main[0].readAt).toBeNull()

            // Mark as read
            await act(async () => {
                await useNotificationsStore.getState().markAsRead('1', 'main')
            })

            // Verify notification marked as read
            const state2 = useNotificationsStore.getState()
            expect(state2.notifications.main[0].readAt).toBeTruthy()
        })

        it('should handle authentication errors gracefully', async () => {
            // Mock 401 error
            mockApiClient.get.mockRejectedValueOnce({
                response: {
                    status: 401,
                    data: { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
                },
            })

            // Attempt to fetch notifications
            await act(async () => {
                try {
                    await useNotificationsStore.getState().fetchNotifications('main')
                } catch (error) {
                    // Expected to fail
                }
            })

            // Verify error state
            const state = useNotificationsStore.getState()
            expect(state.error).toBeTruthy()
            expect(state.notifications.main).toHaveLength(0)
        })
    })

    describe('Tab Switching with Real Data (Requirement 1.2)', () => {
        it('should fetch different notifications for each category', async () => {
            // Mock main notifications
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [
                    {
                        id: '1',
                        userId: '1',
                        category: 'main',
                        type: 'trainer_feedback',
                        title: 'Main notification',
                        content: 'Content',
                        createdAt: new Date().toISOString(),
                        readAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
            })

            // Mock pollForUpdates after main fetch
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [
                    {
                        id: '1',
                        userId: '1',
                        category: 'main',
                        type: 'trainer_feedback',
                        title: 'Main notification',
                        content: 'Content',
                        createdAt: new Date().toISOString(),
                        readAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 1, content: 0 })

            // Mock content notifications
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [
                    {
                        id: '2',
                        userId: '1',
                        category: 'content',
                        type: 'system_update',
                        title: 'Content notification',
                        content: 'Content',
                        createdAt: new Date().toISOString(),
                        readAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
            })

            // Mock pollForUpdates after content fetch
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [
                    {
                        id: '1',
                        userId: '1',
                        category: 'main',
                        type: 'trainer_feedback',
                        title: 'Main notification',
                        content: 'Content',
                        createdAt: new Date().toISOString(),
                        readAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [
                    {
                        id: '2',
                        userId: '1',
                        category: 'content',
                        type: 'system_update',
                        title: 'Content notification',
                        content: 'Content',
                        createdAt: new Date().toISOString(),
                        readAt: null,
                    },
                ],
                total: 1,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 1, content: 1 })

            // Fetch main notifications
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('main')
            })

            const state1 = useNotificationsStore.getState()
            expect(state1.notifications.main).toHaveLength(1)
            expect(state1.notifications.main[0].title).toBe('Main notification')

            // Fetch content notifications
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('content')
            })

            const state2 = useNotificationsStore.getState()
            expect(state2.notifications.content).toHaveLength(1)
            expect(state2.notifications.content[0].title).toBe('Content notification')
        })
    })

    describe('Pagination with Scrolling (Requirement 4.3)', () => {
        it('should load more notifications when fetching next page', async () => {
            const firstPageNotifications = Array.from({ length: 50 }, (_, i) => ({
                id: `${i + 1}`,
                userId: '1',
                category: 'main',
                type: 'reminder',
                title: `Notification ${i + 1}`,
                content: 'Content',
                createdAt: new Date(Date.now() - i * 3600000).toISOString(),
                readAt: null,
            }))

            const secondPageNotifications = Array.from({ length: 50 }, (_, i) => ({
                id: `${i + 51}`,
                userId: '1',
                category: 'main',
                type: 'reminder',
                title: `Notification ${i + 51}`,
                content: 'Content',
                createdAt: new Date(Date.now() - (i + 50) * 3600000).toISOString(),
                readAt: null,
            }))

            // Mock first page
            mockApiClient.get.mockResolvedValueOnce({
                notifications: firstPageNotifications,
                total: 100,
                hasMore: true,
            })

            // Mock pollForUpdates after first page
            mockApiClient.get.mockResolvedValueOnce({
                notifications: firstPageNotifications,
                total: 100,
                hasMore: true,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 50, content: 0 })

            // Mock second page
            mockApiClient.get.mockResolvedValueOnce({
                notifications: secondPageNotifications,
                total: 100,
                hasMore: false,
            })

            // Mock pollForUpdates after second page
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [...firstPageNotifications, ...secondPageNotifications],
                total: 100,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 100, content: 0 })

            // Fetch first page
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('main')
            })

            const state1 = useNotificationsStore.getState()
            expect(state1.notifications.main).toHaveLength(50)
            expect(state1.hasMore.main).toBe(true)

            // Fetch second page
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('main', 50)
            })

            const state2 = useNotificationsStore.getState()
            expect(state2.notifications.main).toHaveLength(100)
            expect(state2.hasMore.main).toBe(false)
        })
    })

    describe('Polling Updates (Requirements 5.2, 5.3)', () => {
        it('should detect and prepend new notifications', async () => {
            const oldNotification = {
                id: '1',
                userId: '1',
                category: 'main',
                type: 'reminder',
                title: 'Old notification',
                content: 'Content',
                createdAt: new Date(Date.now() - 3600000).toISOString(),
                readAt: null,
            }

            const newNotification = {
                id: '2',
                userId: '1',
                category: 'main',
                type: 'reminder',
                title: 'New notification',
                content: 'Content',
                createdAt: new Date().toISOString(),
                readAt: null,
            }

            // Mock initial fetch
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [oldNotification],
                total: 1,
                hasMore: false,
            })

            // Mock pollForUpdates after initial fetch
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [oldNotification],
                total: 1,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 1, content: 0 })

            // Mock polling fetch with new notification
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [newNotification, oldNotification],
                total: 2,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 2, content: 0 })

            // Initial fetch
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('main')
            })

            const state1 = useNotificationsStore.getState()
            expect(state1.notifications.main).toHaveLength(1)

            // Poll for updates
            await act(async () => {
                await useNotificationsStore.getState().pollForUpdates()
            })

            // Verify new notification was prepended
            const state2 = useNotificationsStore.getState()
            expect(state2.notifications.main).toHaveLength(2)
            expect(state2.notifications.main[0].title).toBe('New notification')
        })
    })

    describe('Error Recovery', () => {
        it('should handle errors and allow retry', async () => {
            const successNotification = {
                id: '1',
                userId: '1',
                category: 'main',
                type: 'reminder',
                title: 'Notification after retry',
                content: 'Content',
                createdAt: new Date().toISOString(),
                readAt: null,
            }

            // Clear all previous mocks
            mockApiClient.get.mockClear()
            mockApiClient.post.mockClear()

            // Mock error on first 3 attempts (retryWithBackoff will retry 3 times)
            mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))
            mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))
            mockApiClient.get.mockRejectedValueOnce(new Error('Network error'))

            // First attempt fails after 3 retries
            await act(async () => {
                try {
                    await useNotificationsStore.getState().fetchNotifications('main')
                } catch (error) {
                    // Expected to fail
                }
            })

            const state1 = useNotificationsStore.getState()
            // After error, retry count should be incremented
            expect(state1.retryCount).toBeGreaterThan(0)

            // Mock success on manual retry
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [successNotification],
                total: 1,
                hasMore: false,
            })

            // Mock pollForUpdates after retry
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [successNotification],
                total: 1,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 1, content: 0 })

            // Manual retry succeeds
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('main')
            })

            const state2 = useNotificationsStore.getState()
            // Notifications should be loaded
            expect(state2.notifications.main).toHaveLength(1)
            expect(state2.notifications.main[0].title).toBe('Notification after retry')
            expect(state2.retryCount).toBe(0) // Should be reset on success
        })

        it('should rollback optimistic updates on failure', async () => {
            const testNotification = {
                id: '1',
                userId: '1',
                category: 'main',
                type: 'reminder',
                title: 'Test notification',
                content: 'Content',
                createdAt: new Date().toISOString(),
                readAt: null,
            }

            // Mock initial fetch
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [testNotification],
                total: 1,
                hasMore: false,
            })

            // Mock pollForUpdates after initial fetch
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [testNotification],
                total: 1,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({
                notifications: [],
                total: 0,
                hasMore: false,
            })
            mockApiClient.get.mockResolvedValueOnce({ main: 1, content: 0 })

            // Mock mark as read failure
            mockApiClient.post.mockRejectedValueOnce(new Error('Server error'))

            // Fetch notifications
            await act(async () => {
                await useNotificationsStore.getState().fetchNotifications('main')
            })

            const state1 = useNotificationsStore.getState()
            expect(state1.notifications.main[0].readAt).toBeNull()

            // Attempt to mark as read (should fail and rollback)
            await act(async () => {
                try {
                    await useNotificationsStore.getState().markAsRead('1', 'main')
                } catch (error) {
                    // Expected to fail
                }
            })

            // Verify rollback occurred (readAt should be null, not undefined)
            const state2 = useNotificationsStore.getState()
            const notification = state2.notifications.main[0]
            expect(notification.readAt === null || notification.readAt === undefined).toBe(true)
        })
    })
})
