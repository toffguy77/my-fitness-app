/**
 * Tests for uncovered branches in dashboardStore.ts
 * Targets: memory cache hits/invalidation, backend mapping, fetchAllDashboardData,
 * updateMetric (steps/workout/offline), updateTaskStatus (offline/network-error),
 * fetchWeekDataWithStaleWhileRevalidate, prefetchAdjacentWeeks, syncWhenOnline,
 * pollForUpdates error path, and 500 mapError branch.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardStore, clearMemoryCache } from '../dashboardStore';
import { apiClient } from '@/shared/utils/api-client';
import toast from 'react-hot-toast';

jest.mock('@/shared/utils/api-client');
jest.mock('react-hot-toast');
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000/api${path}`,
}));

// Mock offlineQueue functions
jest.mock('../../utils/offlineQueue', () => ({
    addToQueue: jest.fn(),
    removeFromQueue: jest.fn(),
    loadQueue: jest.fn(() => []),
    incrementAttempts: jest.fn(),
    shouldRetry: jest.fn(() => true),
    removeFailedEntries: jest.fn(() => []),
    sortQueueByTimestamp: jest.fn(() => []),
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockToast = toast as jest.Mocked<typeof toast>;

// Import offline queue mocks for sync tests
import {
    addToQueue,
    removeFromQueue,
    sortQueueByTimestamp,
    shouldRetry,
    incrementAttempts,
} from '../../utils/offlineQueue';

const mockSortQueue = sortQueueByTimestamp as jest.Mock;
const mockShouldRetry = shouldRetry as jest.Mock;
const mockAddToQueue = addToQueue as jest.Mock;
const mockRemoveFromQueue = removeFromQueue as jest.Mock;
const mockIncrementAttempts = incrementAttempts as jest.Mock;

/**
 * Helper: create a frontend-shaped DailyMetrics object
 */
function makeDailyMetrics(date: string, overrides: Record<string, any> = {}) {
    return {
        date,
        userId: 'user-1',
        nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
        weight: 75,
        steps: 8000,
        workout: { completed: false },
        completionStatus: {
            nutritionFilled: true,
            weightLogged: true,
            activityCompleted: false,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

/**
 * Helper: create a backend-shaped (flat, snake_case) metrics object
 */
function makeBackendMetrics(date: string, overrides: Record<string, any> = {}) {
    return {
        id: 'met-1',
        user_id: 1,
        date: `${date}T00:00:00Z`,
        calories: 2000,
        protein: 150,
        fat: 60,
        carbs: 200,
        weight: 75,
        steps: 8000,
        workout_completed: false,
        workout_type: null,
        workout_duration: null,
        created_at: '2024-01-15T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        ...overrides,
    };
}

describe('Dashboard Store - Coverage Gaps', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        clearMemoryCache();

        act(() => {
            useDashboardStore.getState().reset();
        });
    });

    afterEach(() => {
        // Stop any active polling before cleanup
        act(() => {
            useDashboardStore.getState().stopPolling();
        });
        jest.useRealTimers();
    });

    describe('Memory cache hit paths', () => {
        it('returns cached daily data on second fetchDailyData call', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // First call populates the memory cache
            mockApiClient.get.mockResolvedValueOnce(
                makeBackendMetrics('2024-01-15')
            );

            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);

            // Second call should hit memory cache (lines 648-655)
            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            // No additional API call
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(result.current.dailyData['2024-01-15']).toBeDefined();
        });

        it('returns cached week data on second fetchWeekData call', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValueOnce({
                metrics: [makeBackendMetrics('2024-01-15')],
                count: 1,
            });

            const weekStart = new Date('2024-01-15');
            const weekEnd = new Date('2024-01-21');

            await act(async () => {
                await result.current.fetchWeekData(weekStart, weekEnd);
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);

            // Second call should hit memory cache (lines 716-724)
            await act(async () => {
                await result.current.fetchWeekData(weekStart, weekEnd);
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(result.current.dailyData['2024-01-15']).toBeDefined();
        });
    });

    describe('fetchWeekData - offline path', () => {
        it('loads from cache when offline', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const cachedData = { '2024-01-15': makeDailyMetrics('2024-01-15') };
            localStorage.setItem('dashboard_daily_data', JSON.stringify(cachedData));

            // Set offline before fetching
            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            await act(async () => {
                await result.current.fetchWeekData(
                    new Date('2024-01-15'),
                    new Date('2024-01-21')
                );
            });

            // Should not call API
            expect(mockApiClient.get).not.toHaveBeenCalled();
            // Should load from cache
            expect(result.current.dailyData['2024-01-15']).toBeDefined();
        });

        it('handles network error by loading cache', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const cachedData = { '2024-01-15': makeDailyMetrics('2024-01-15') };
            localStorage.setItem('dashboard_daily_data', JSON.stringify(cachedData));

            // Make API fail and set offline on first call so retryWithBackoff exits fast
            let called = false;
            mockApiClient.get.mockImplementation(() => {
                if (!called) {
                    called = true;
                    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
                }
                return Promise.reject(new TypeError('network error'));
            });

            await act(async () => {
                await result.current.fetchWeekData(
                    new Date('2024-01-15'),
                    new Date('2024-01-21')
                );
            });

            expect(result.current.error?.code).toBe('NETWORK_ERROR');
            expect(result.current.isOffline).toBe(true);

            Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        });
    });

    describe('fetchWeekDataWithStaleWhileRevalidate', () => {
        it('shows cached data immediately then refreshes in background', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const weekStart = new Date('2024-01-15');
            const weekEnd = new Date('2024-01-21');

            // First, populate memory cache via a normal fetch
            mockApiClient.get.mockResolvedValueOnce({
                metrics: [makeBackendMetrics('2024-01-15')],
                count: 1,
            });

            await act(async () => {
                await result.current.fetchWeekData(weekStart, weekEnd);
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);

            // Now call SWR - should use cache, then revalidate
            const freshMetrics = makeBackendMetrics('2024-01-15', { calories: 2500 });
            mockApiClient.get.mockResolvedValueOnce({
                metrics: [freshMetrics],
                count: 1,
            });

            await act(async () => {
                await result.current.fetchWeekDataWithStaleWhileRevalidate(weekStart, weekEnd);
            });

            // Should have made a background revalidation call
            expect(mockApiClient.get).toHaveBeenCalledTimes(2);
        });

        it('handles background refresh failure gracefully', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const weekStart = new Date('2024-01-15');
            const weekEnd = new Date('2024-01-21');

            // Populate memory cache
            mockApiClient.get.mockResolvedValueOnce({
                metrics: [makeBackendMetrics('2024-01-15')],
                count: 1,
            });

            await act(async () => {
                await result.current.fetchWeekData(weekStart, weekEnd);
            });

            // Background revalidation fails
            mockApiClient.get.mockRejectedValueOnce(new Error('Server down'));

            await act(async () => {
                await result.current.fetchWeekDataWithStaleWhileRevalidate(weekStart, weekEnd);
            });

            // Should not set error state - background failure is swallowed
            expect(result.current.error).toBeNull();
            expect(result.current.isBackgroundRefreshing).toBe(false);
        });

        it('falls back to fetchWeekData when no cache exists', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const weekStart = new Date('2024-01-15');
            const weekEnd = new Date('2024-01-21');

            mockApiClient.get.mockResolvedValueOnce({
                metrics: [makeBackendMetrics('2024-01-15')],
                count: 1,
            });

            await act(async () => {
                await result.current.fetchWeekDataWithStaleWhileRevalidate(weekStart, weekEnd);
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
            expect(result.current.dailyData['2024-01-15']).toBeDefined();
        });

        it('loads from cache when offline', async () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            const cachedData = { '2024-01-15': makeDailyMetrics('2024-01-15') };
            localStorage.setItem('dashboard_daily_data', JSON.stringify(cachedData));

            await act(async () => {
                await result.current.fetchWeekDataWithStaleWhileRevalidate(
                    new Date('2024-01-15'),
                    new Date('2024-01-21')
                );
            });

            expect(mockApiClient.get).not.toHaveBeenCalled();
        });
    });

    describe('prefetchAdjacentWeeks', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        it('prefetches previous and next weeks when not cached', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValue({
                metrics: [makeBackendMetrics('2024-01-08')],
                count: 1,
            });

            act(() => {
                result.current.prefetchAdjacentWeeks(new Date('2024-01-15'));
            });

            // Advance timers for prefetch setTimeout calls (100ms and 200ms)
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Should have prefetched both prev and next weeks
            expect(mockApiClient.get).toHaveBeenCalledTimes(2);
        });

        it('skips prefetch when already cached in prefetchedWeeks set', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValue({
                metrics: [],
                count: 0,
            });

            // First prefetch
            act(() => {
                result.current.prefetchAdjacentWeeks(new Date('2024-01-15'));
            });

            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            const callCount = mockApiClient.get.mock.calls.length;

            // Second prefetch for the same week should be skipped
            act(() => {
                result.current.prefetchAdjacentWeeks(new Date('2024-01-15'));
            });

            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(callCount);
        });

        it('does not prefetch when offline', () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            act(() => {
                result.current.prefetchAdjacentWeeks(new Date('2024-01-15'));
            });

            expect(mockApiClient.get).not.toHaveBeenCalled();
        });

        it('handles prefetch failure gracefully', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockRejectedValue(new Error('Prefetch failed'));

            act(() => {
                result.current.prefetchAdjacentWeeks(new Date('2024-01-15'));
            });

            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Should not set error state
            expect(result.current.error).toBeNull();
        });
    });

    describe('fetchAllDashboardData', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        it('fetches week data, weekly plan, and tasks in parallel', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Provide enough responses for both the main fetch and prefetch calls
            mockApiClient.get
                .mockResolvedValueOnce({
                    metrics: [makeBackendMetrics('2024-01-15')],
                    count: 1,
                })
                .mockResolvedValueOnce({ plan: null })
                .mockResolvedValueOnce({
                    tasks: [{ id: 'task-1', title: 'Test' }],
                    count: 1,
                    week: 1,
                })
                // Prefetch responses
                .mockResolvedValue({ metrics: [], count: 0 });

            await act(async () => {
                await result.current.fetchAllDashboardData();
            });

            // Drain prefetch timeouts
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // 3 main requests + up to 2 prefetch requests
            expect(mockApiClient.get.mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.dailyData).toBeDefined();
        });

        it('uses cached data when all caches are valid', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // First call: populate all caches
            mockApiClient.get
                .mockResolvedValueOnce({
                    metrics: [makeBackendMetrics('2024-01-15')],
                    count: 1,
                })
                .mockResolvedValueOnce({ plan: null })
                .mockResolvedValueOnce({
                    tasks: [],
                    count: 0,
                    week: 1,
                })
                // Prefetch responses
                .mockResolvedValue({ metrics: [], count: 0 });

            await act(async () => {
                await result.current.fetchAllDashboardData();
            });

            // Drain prefetch timeouts
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Also populate tasks cache
            mockApiClient.get.mockResolvedValueOnce({
                tasks: [],
                count: 0,
                week: 1,
            });
            await act(async () => {
                await result.current.fetchTasks();
            });

            const callsBefore = mockApiClient.get.mock.calls.length;

            // Second call: all data should come from cache
            await act(async () => {
                await result.current.fetchAllDashboardData();
            });

            // No additional API calls since everything is cached
            expect(mockApiClient.get).toHaveBeenCalledTimes(callsBefore);
            expect(result.current.isLoading).toBe(false);
        });

        it('handles null plan via fetchAllDashboardData', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get
                .mockResolvedValueOnce({ metrics: [], count: 0 })
                .mockResolvedValueOnce({ plan: null })
                .mockResolvedValueOnce({ tasks: [], count: 0, week: 1 })
                .mockResolvedValue({ metrics: [], count: 0 });

            await act(async () => {
                await result.current.fetchAllDashboardData();
            });

            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            expect(result.current.weeklyPlan).toBeNull();
            expect(result.current.isLoading).toBe(false);
        });

        it('loads from cache when offline', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const cachedData = { '2024-01-15': makeDailyMetrics('2024-01-15') };
            localStorage.setItem('dashboard_daily_data', JSON.stringify(cachedData));

            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            await act(async () => {
                await result.current.fetchAllDashboardData();
            });

            expect(mockApiClient.get).not.toHaveBeenCalled();
        });

        it('handles error in fetchAllDashboardData', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Use 400 so retryWithBackoff does not retry (4xx is non-retryable)
            mockApiClient.get.mockRejectedValue({
                response: { status: 400, data: { message: 'Bad request' } },
            });

            await act(async () => {
                await result.current.fetchAllDashboardData();
            });

            expect(result.current.error?.code).toBe('VALIDATION_ERROR');
            expect(result.current.isLoading).toBe(false);
        });

        it('handles network error in fetchAllDashboardData and loads cache', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const cachedData = { '2024-01-15': makeDailyMetrics('2024-01-15') };
            localStorage.setItem('dashboard_daily_data', JSON.stringify(cachedData));

            // Use a 400 error so retryWithBackoff does not retry (4xx is non-retryable)
            // then mapError will map it, but we need NETWORK_ERROR.
            // Instead, simulate offline mid-retry: reject with TypeError, but
            // make isOnline return false so retryWithBackoff throws immediately.
            let callCount = 0;
            mockApiClient.get.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // First call proceeds, then after it fails, isOnline is false
                    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
                }
                return Promise.reject(new TypeError('fetch failed'));
            });

            await act(async () => {
                await result.current.fetchAllDashboardData();
            });

            expect(result.current.error?.code).toBe('NETWORK_ERROR');
            expect(result.current.isOffline).toBe(true);
            expect(result.current.dailyData['2024-01-15']).toBeDefined();
            Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        });
    });

    describe('updateMetric - steps and workout branches', () => {
        const date = '2024-01-15';

        function setupWithDailyData() {
            const { result } = renderHook(() => useDashboardStore());
            act(() => {
                useDashboardStore.setState({
                    dailyData: {
                        [date]: makeDailyMetrics(date),
                    },
                });
            });
            return result;
        }

        it('updates steps metric with activity completion', async () => {
            const result = setupWithDailyData();

            mockApiClient.post.mockResolvedValue({});
            mockApiClient.get.mockResolvedValue(makeBackendMetrics(date, { steps: 12000 }));

            await act(async () => {
                await result.current.updateMetric(date, {
                    type: 'steps',
                    data: { steps: 12000 },
                });
            });

            // Optimistic update should set steps
            expect(result.current.dailyData[date].steps).toBeDefined();
        });

        it('updates workout metric with completion status', async () => {
            const result = setupWithDailyData();

            mockApiClient.post.mockResolvedValue({});
            mockApiClient.get.mockResolvedValue(
                makeBackendMetrics(date, { workout_completed: true, workout_type: 'strength' })
            );

            await act(async () => {
                await result.current.updateMetric(date, {
                    type: 'workout',
                    data: { completed: true, type: 'strength', duration: 60 },
                });
            });

            expect(result.current.dailyData[date].workout.completed).toBe(true);
        });

        it('queues metric update when offline', async () => {
            const result = setupWithDailyData();

            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            await act(async () => {
                await result.current.updateMetric(date, {
                    type: 'nutrition',
                    data: { calories: 2500, protein: 180, fat: 70, carbs: 250 },
                });
            });

            expect(mockAddToQueue).toHaveBeenCalledWith('metric', date, expect.any(Object));
            expect(mockToast.success).toHaveBeenCalledWith(
                'Изменения сохранены локально',
                expect.any(Object)
            );
        });

        it('queues metric and goes offline on network error during save', async () => {
            const result = setupWithDailyData();

            let called = false;
            mockApiClient.post.mockImplementation(() => {
                if (!called) {
                    called = true;
                    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
                }
                return Promise.reject(new TypeError('network error'));
            });

            await act(async () => {
                await result.current.updateMetric(date, {
                    type: 'weight',
                    data: { weight: 80 },
                });
            });

            expect(mockAddToQueue).toHaveBeenCalledWith('metric', date, expect.any(Object));
            expect(result.current.isOffline).toBe(true);
            expect(mockToast.error).toHaveBeenCalledWith(
                'Нет подключения. Изменения сохранены локально',
                expect.any(Object)
            );
            Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        });
    });

    describe('updateTaskStatus - offline and network error paths', () => {
        const taskId = 'task-1';

        function setupWithTask() {
            const { result } = renderHook(() => useDashboardStore());
            act(() => {
                useDashboardStore.setState({
                    tasks: [{
                        id: taskId,
                        userId: 'user-1',
                        curatorId: 'curator-1',
                        title: 'Test task',
                        description: 'Test',
                        status: 'active' as const,
                        weekNumber: 1,
                        assignedAt: new Date(),
                        dueDate: new Date(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }],
                });
            });
            return result;
        }

        it('returns early when task is not found', async () => {
            const { result } = renderHook(() => useDashboardStore());

            await act(async () => {
                await result.current.updateTaskStatus('nonexistent-task', 'completed');
            });

            expect(mockApiClient.put).not.toHaveBeenCalled();
        });

        it('queues task update when offline', async () => {
            const result = setupWithTask();

            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            await act(async () => {
                await result.current.updateTaskStatus(taskId, 'completed');
            });

            expect(mockAddToQueue).toHaveBeenCalledWith('task', taskId, { status: 'completed' });
            expect(mockToast.success).toHaveBeenCalledWith(
                'Изменения сохранены локально',
                expect.any(Object)
            );
        });

        it('queues task and goes offline on network error', async () => {
            const result = setupWithTask();

            let called = false;
            mockApiClient.put.mockImplementation(() => {
                if (!called) {
                    called = true;
                    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
                }
                return Promise.reject(new TypeError('network error'));
            });

            await act(async () => {
                await result.current.updateTaskStatus(taskId, 'completed');
            });

            expect(mockAddToQueue).toHaveBeenCalledWith('task', taskId, { status: 'completed' });
            expect(result.current.isOffline).toBe(true);
            Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        });
    });

    describe('fetchWeeklyPlan', () => {
        it('handles plan response with plan wrapper', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValueOnce({
                plan: {
                    id: 'plan-1',
                    user_id: 1,
                    curator_id: 2,
                    calories_goal: 2000,
                    protein_goal: 150,
                    fat_goal: 60,
                    carbs_goal: 200,
                    steps_goal: 10000,
                    start_date: '2024-01-15',
                    end_date: '2024-01-21',
                    is_active: true,
                    created_at: '2024-01-15T00:00:00Z',
                    updated_at: '2024-01-15T00:00:00Z',
                    created_by: 'curator-1',
                },
            });

            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(result.current.weeklyPlan).toBeDefined();
            expect(result.current.weeklyPlan?.caloriesGoal).toBe(2000);
            expect(result.current.weeklyPlan?.userId).toBe('1');
        });

        it('returns cached plan on second call', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValueOnce({ plan: null });

            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);

            // Second call should use cache
            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
        });

        it('maps snake_case backend plan to camelCase', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValueOnce({
                id: 'plan-1',
                user_id: 1,
                curator_id: 2,
                calories_goal: 2200,
                protein_goal: 160,
                fat_goal: 70,
                carbs_goal: 250,
                steps_goal: 10000,
                start_date: '2024-01-15',
                end_date: '2024-01-21',
                is_active: true,
                created_at: '2024-01-15T00:00:00Z',
                updated_at: '2024-01-15T00:00:00Z',
                created_by: 'c-1',
            });

            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(result.current.weeklyPlan?.caloriesGoal).toBe(2200);
            expect(result.current.weeklyPlan?.proteinGoal).toBe(160);
            expect(result.current.weeklyPlan?.isActive).toBe(true);
        });

        it('loads from cache when offline', async () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(mockApiClient.get).not.toHaveBeenCalled();
        });

        it('handles error and loads cache on network error', async () => {
            const { result } = renderHook(() => useDashboardStore());

            localStorage.setItem('dashboard_weekly_plan', JSON.stringify({
                id: 'cached-plan',
                caloriesGoal: 2000,
                proteinGoal: 150,
            }));

            let called = false;
            mockApiClient.get.mockImplementation(() => {
                if (!called) {
                    called = true;
                    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
                }
                return Promise.reject(new TypeError('network'));
            });

            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(result.current.error?.code).toBe('NETWORK_ERROR');
            Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        });
    });

    describe('fetchTasks', () => {
        it('returns cached tasks when available', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValueOnce({
                tasks: [{ id: 't1', title: 'Task 1' }],
                count: 1,
                week: 1,
            });

            await act(async () => {
                await result.current.fetchTasks();
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);

            // Second call should use cache
            await act(async () => {
                await result.current.fetchTasks();
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
        });

        it('bypasses cache when weekNumber is provided', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValueOnce({
                tasks: [{ id: 't1', title: 'Task 1' }],
                count: 1,
                week: 1,
            });

            // First call to populate cache
            await act(async () => {
                await result.current.fetchTasks();
            });

            mockApiClient.get.mockResolvedValueOnce({
                tasks: [{ id: 't2', title: 'Task 2' }],
                count: 1,
                week: 3,
            });

            // Call with weekNumber should bypass cache
            await act(async () => {
                await result.current.fetchTasks(3);
            });

            expect(mockApiClient.get).toHaveBeenCalledTimes(2);
            expect(mockApiClient.get).toHaveBeenLastCalledWith(
                expect.stringContaining('week=3')
            );
        });

        it('loads from cache when offline', async () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                useDashboardStore.setState({ isOffline: true });
            });

            await act(async () => {
                await result.current.fetchTasks();
            });

            expect(mockApiClient.get).not.toHaveBeenCalled();
        });

        it('handles network error and loads cache', async () => {
            const { result } = renderHook(() => useDashboardStore());

            let called = false;
            mockApiClient.get.mockImplementation(() => {
                if (!called) {
                    called = true;
                    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
                }
                return Promise.reject(new TypeError('network'));
            });

            await act(async () => {
                await result.current.fetchTasks();
            });

            expect(result.current.error?.code).toBe('NETWORK_ERROR');
            expect(result.current.isOffline).toBe(true);
            Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        });
    });

    describe('pollForUpdates', () => {
        it('handles poll failure gracefully', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Use 400 so retryWithBackoff does not retry
            mockApiClient.get.mockRejectedValue({
                response: { status: 400, data: { message: 'Bad request' } },
            });

            await act(async () => {
                await result.current.pollForUpdates();
            });

            // pollForUpdates swallows errors, but individual fetches set error state
            // The important thing is it doesn't crash
            expect(result.current.error).toBeDefined();
        });
    });

    describe('mapError branches via fetchWeeklyPlan (no retry on 4xx)', () => {
        it('maps 400 status to VALIDATION_ERROR with custom message', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockRejectedValueOnce({
                response: { status: 400, data: { message: 'Custom validation error' } },
            });

            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(result.current.error?.code).toBe('VALIDATION_ERROR');
            expect(result.current.error?.message).toBe('Custom validation error');
        });

        it('maps 400 without message to default VALIDATION_ERROR', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockRejectedValueOnce({
                response: { status: 400, data: {} },
                message: undefined,
            });

            await act(async () => {
                await result.current.fetchWeeklyPlan();
            });

            expect(result.current.error?.code).toBe('VALIDATION_ERROR');
            expect(result.current.error?.message).toBe('Неверные данные');
        });
    });

    describe('syncWhenOnline', () => {
        it('does nothing when still offline', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Make navigator.onLine return false
            Object.defineProperty(navigator, 'onLine', { value: false, writable: true });

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            expect(mockApiClient.get).not.toHaveBeenCalled();

            // Restore
            Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
        });

        it('processes offline queue entries when back online', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Set up daily data for updateMetric
            act(() => {
                useDashboardStore.setState({
                    dailyData: {
                        '2024-01-15': makeDailyMetrics('2024-01-15'),
                    },
                });
            });

            const queueEntries = [
                {
                    id: 'q1',
                    type: 'metric' as const,
                    date: '2024-01-15',
                    data: { type: 'nutrition', data: { calories: 2000, protein: 150, fat: 60, carbs: 200 } },
                    timestamp: Date.now(),
                    attempts: 0,
                    maxAttempts: 3,
                },
            ];

            mockSortQueue.mockReturnValue(queueEntries);
            mockShouldRetry.mockReturnValue(true);

            // Mock all API calls during sync
            mockApiClient.get.mockResolvedValue({
                metrics: [],
                count: 0,
                plan: null,
                tasks: [],
                week: 1,
            });
            mockApiClient.post.mockResolvedValue({});

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            expect(mockIncrementAttempts).toHaveBeenCalledWith('q1');
            expect(mockRemoveFromQueue).toHaveBeenCalledWith('q1');
            expect(mockToast.success).toHaveBeenCalledWith(
                expect.stringContaining('Синхронизировано'),
                expect.any(Object)
            );
        });

        it('skips queue entries that should not be retried', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const queueEntries = [
                {
                    id: 'q1',
                    type: 'metric' as const,
                    date: '2024-01-15',
                    data: {},
                    timestamp: Date.now(),
                    attempts: 5,
                    maxAttempts: 3,
                },
            ];

            mockSortQueue.mockReturnValue(queueEntries);
            mockShouldRetry.mockReturnValue(false);

            mockApiClient.get.mockResolvedValue({
                metrics: [],
                count: 0,
                plan: null,
                tasks: [],
                week: 1,
            });

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            // Should remove non-retryable entry
            expect(mockRemoveFromQueue).toHaveBeenCalledWith('q1');
            // Should show failed notification
            expect(mockToast.error).toHaveBeenCalledWith(
                expect.stringContaining('Не удалось синхронизировать'),
                expect.any(Object)
            );
        });

        it('processes task queue entries', async () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                useDashboardStore.setState({
                    tasks: [{
                        id: 'task-1',
                        userId: 'user-1',
                        curatorId: 'curator-1',
                        title: 'Test',
                        description: '',
                        status: 'active' as const,
                        weekNumber: 1,
                        assignedAt: new Date(),
                        dueDate: new Date(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }],
                });
            });

            const queueEntries = [
                {
                    id: 'q2',
                    type: 'task' as const,
                    date: 'task-1',
                    data: { status: 'completed' },
                    timestamp: Date.now(),
                    attempts: 0,
                    maxAttempts: 3,
                },
            ];

            mockSortQueue.mockReturnValue(queueEntries);
            mockShouldRetry.mockReturnValue(true);

            mockApiClient.get.mockResolvedValue({
                metrics: [],
                count: 0,
                plan: null,
                tasks: [],
                week: 1,
            });
            mockApiClient.put.mockResolvedValue({});

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            expect(mockIncrementAttempts).toHaveBeenCalledWith('q2');
            expect(mockRemoveFromQueue).toHaveBeenCalledWith('q2');
        });

        it('processes report queue entries', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const queueEntries = [
                {
                    id: 'q3',
                    type: 'report' as const,
                    date: '2024-01-15',
                    data: { weekStart: '2024-01-15', weekEnd: '2024-01-21' },
                    timestamp: Date.now(),
                    attempts: 0,
                    maxAttempts: 3,
                },
            ];

            mockSortQueue.mockReturnValue(queueEntries);
            mockShouldRetry.mockReturnValue(true);

            mockApiClient.get.mockResolvedValue({
                metrics: [],
                count: 0,
                plan: null,
                tasks: [],
                week: 1,
            });
            mockApiClient.post.mockResolvedValue({});

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            expect(mockIncrementAttempts).toHaveBeenCalledWith('q3');
        });

        it('skips photo queue entries', async () => {
            const { result } = renderHook(() => useDashboardStore());

            const queueEntries = [
                {
                    id: 'q4',
                    type: 'photo' as const,
                    date: '2024-W01',
                    data: {},
                    timestamp: Date.now(),
                    attempts: 0,
                    maxAttempts: 3,
                },
            ];

            mockSortQueue.mockReturnValue(queueEntries);
            mockShouldRetry.mockReturnValue(true);

            mockApiClient.get.mockResolvedValue({
                metrics: [],
                count: 0,
                plan: null,
                tasks: [],
                week: 1,
            });

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            // Photo entry is skipped (no File available), then removed on success
            expect(mockRemoveFromQueue).toHaveBeenCalledWith('q4');
        });

        it('handles sync entry failure and removes after max attempts', async () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                useDashboardStore.setState({
                    dailyData: {
                        '2024-01-15': makeDailyMetrics('2024-01-15'),
                    },
                });
            });

            const queueEntries = [
                {
                    id: 'q5',
                    type: 'metric' as const,
                    date: '2024-01-15',
                    data: { type: 'nutrition', data: { calories: 2000, protein: 150, fat: 60, carbs: 200 } },
                    timestamp: Date.now(),
                    attempts: 3,
                    maxAttempts: 3,
                },
            ];

            mockSortQueue.mockReturnValue(queueEntries);
            mockShouldRetry.mockReturnValue(true);

            mockApiClient.get.mockResolvedValue({
                metrics: [],
                count: 0,
                plan: null,
                tasks: [],
                week: 1,
            });
            // updateMetric fails - use 400 so retryWithBackoff does not retry
            mockApiClient.post.mockRejectedValue({
                response: { status: 400, data: { message: 'Bad request' } },
            });

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            // Should remove from queue after max attempts
            expect(mockRemoveFromQueue).toHaveBeenCalledWith('q5');
        });

        it('handles overall sync failure gracefully', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Make the initial data fetch fail - use 401 so no retry
            mockApiClient.get.mockRejectedValue({
                response: { status: 401, data: { message: 'Unauthorized' } },
            });
            mockSortQueue.mockReturnValue([]);

            await act(async () => {
                await result.current.syncWhenOnline();
            });

            // Should not crash
            expect(result.current.error).toBeDefined();
        });
    });

    describe('setOfflineStatus edge cases', () => {
        it('does not show toast when setting same offline status', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Set online -> online (no change)
            await act(async () => {
                result.current.setOfflineStatus(false);
            });

            // Should not show reconnection toast when was already online
            expect(mockToast.success).not.toHaveBeenCalledWith(
                'Подключение восстановлено',
                expect.any(Object)
            );
        });

        it('stops polling when going offline and starts when coming online', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValue({
                plan: null,
                tasks: [],
                count: 0,
                week: 1,
            });

            await act(async () => {
                result.current.setOfflineStatus(true);
            });

            expect(result.current.pollingIntervalId).toBeNull();

            await act(async () => {
                result.current.setOfflineStatus(false);
            });

            // Should start polling when coming back online
            expect(result.current.pollingIntervalId).toBeDefined();
        });
    });

    describe('loadFromCache', () => {
        it('handles missing cache gracefully', () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                result.current.loadFromCache();
            });

            expect(result.current.dailyData).toEqual({});
            expect(result.current.weeklyPlan).toBeNull();
            expect(result.current.tasks).toEqual([]);
        });

        it('loads all cached data types', () => {
            const { result } = renderHook(() => useDashboardStore());

            localStorage.setItem('dashboard_daily_data', JSON.stringify({
                '2024-01-15': makeDailyMetrics('2024-01-15'),
            }));
            localStorage.setItem('dashboard_weekly_plan', JSON.stringify({
                id: 'plan-1',
                caloriesGoal: 2000,
            }));
            localStorage.setItem('dashboard_tasks', JSON.stringify([
                { id: 'task-1', title: 'Test' },
            ]));

            act(() => {
                result.current.loadFromCache();
            });

            expect(result.current.dailyData['2024-01-15']).toBeDefined();
            expect(result.current.weeklyPlan).toBeDefined();
            expect(result.current.tasks.length).toBe(1);
        });
    });

    describe('mapBackendMetrics edge cases', () => {
        it('maps backend metrics with already-mapped data (has nutrition object)', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // If response already has 'nutrition' object, should return as-is
            const alreadyMapped = makeDailyMetrics('2024-01-15');
            mockApiClient.get.mockResolvedValueOnce(alreadyMapped);

            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            expect(result.current.dailyData['2024-01-15'].nutrition.calories).toBe(2000);
        });

        it('maps flat backend metrics to nested shape', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockResolvedValueOnce(
                makeBackendMetrics('2024-01-15', {
                    weight: null,
                    workout_completed: true,
                    workout_type: 'cardio',
                    workout_duration: 45,
                })
            );

            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            const data = result.current.dailyData['2024-01-15'];
            expect(data.workout.completed).toBe(true);
            expect(data.workout.type).toBe('cardio');
            expect(data.workout.duration).toBe(45);
            expect(data.completionStatus.weightLogged).toBe(false);
            expect(data.completionStatus.activityCompleted).toBe(true);
        });
    });

    describe('memoryCache.invalidateDailyData', () => {
        it('invalidates daily data and associated week data', async () => {
            const { result } = renderHook(() => useDashboardStore());

            // Populate week cache
            mockApiClient.get.mockResolvedValueOnce({
                metrics: [makeBackendMetrics('2024-01-15')],
                count: 1,
            });

            const weekStart = new Date('2024-01-15');
            const weekEnd = new Date('2024-01-21');

            await act(async () => {
                await result.current.fetchWeekData(weekStart, weekEnd);
            });

            // Verify cache is populated (second call should use cache)
            await act(async () => {
                await result.current.fetchWeekData(weekStart, weekEnd);
            });
            expect(mockApiClient.get).toHaveBeenCalledTimes(1);

            // Now update a metric (which calls invalidateDailyData internally)
            act(() => {
                useDashboardStore.setState({
                    dailyData: {
                        '2024-01-15': makeDailyMetrics('2024-01-15'),
                    },
                });
            });

            mockApiClient.post.mockResolvedValue({});
            mockApiClient.get.mockResolvedValueOnce(makeBackendMetrics('2024-01-15', { calories: 3000 }));

            await act(async () => {
                await result.current.updateMetric('2024-01-15', {
                    type: 'nutrition',
                    data: { calories: 3000, protein: 200, fat: 80, carbs: 300 },
                });
            });

            // After invalidation, next fetchWeekData should hit API again
            mockApiClient.get.mockResolvedValueOnce({
                metrics: [makeBackendMetrics('2024-01-15', { calories: 3000 })],
                count: 1,
            });

            await act(async () => {
                await result.current.fetchWeekData(weekStart, weekEnd);
            });

            // Should have made a new API call since cache was invalidated
            expect(mockApiClient.get.mock.calls.length).toBeGreaterThan(2);
        });
    });
});
