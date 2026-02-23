/**
 * Unit tests for dashboard store actions
 * Tests optimistic updates, rollback, error handling, and state transitions
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardStore, clearMemoryCache } from '../dashboardStore';
import { apiClient } from '@/shared/utils/api-client';
import toast from 'react-hot-toast';

// Mock dependencies
jest.mock('@/shared/utils/api-client');
jest.mock('react-hot-toast');
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000/api${path}`,
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockToast = toast as jest.Mocked<typeof toast>;

describe('Dashboard Store Actions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        clearMemoryCache();

        // Reset store to initial state
        const { result } = renderHook(() => useDashboardStore());
        act(() => {
            result.current.reset();
        });
    });

    describe('setSelectedDate', () => {
        it('updates selected date and week range', () => {
            const { result } = renderHook(() => useDashboardStore());
            const testDate = new Date('2024-01-15'); // Monday

            mockApiClient.get.mockResolvedValue({
                date: '2024-01-15',
                nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                weight: null,
                steps: 0,
                workout: { completed: false },
                completionStatus: {
                    nutritionFilled: false,
                    weightLogged: false,
                    activityCompleted: false,
                },
            });

            act(() => {
                result.current.setSelectedDate(testDate);
            });

            expect(result.current.selectedDate).toEqual(testDate);
            expect(result.current.selectedWeek.start.getDay()).toBe(1); // Monday
            expect(result.current.selectedWeek.end.getDay()).toBe(0); // Sunday
        });

        it('fetches week data for the new date using stale-while-revalidate', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const testDate = new Date('2024-01-15');

            mockApiClient.get.mockResolvedValue({
                metrics: [{
                    date: '2024-01-15',
                    nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                    weight: 75.5,
                    steps: 8000,
                    workout: null,
                    completionStatus: {
                        nutritionFilled: true,
                        weightLogged: true,
                        activityCompleted: false,
                    },
                }],
                count: 1,
            });

            await act(async () => {
                result.current.setSelectedDate(testDate);
            });

            await waitFor(() => {
                expect(mockApiClient.get).toHaveBeenCalledWith(
                    'http://localhost:4000/api/dashboard/week?start=2024-01-15&end=2024-01-21'
                );
            });
        });
    });

    describe('navigateWeek', () => {
        it('navigates to previous week', () => {
            const { result } = renderHook(() => useDashboardStore());
            const initialWeekStart = new Date(result.current.selectedWeek.start);

            mockApiClient.get.mockResolvedValue({ metrics: [], count: 0 });

            act(() => {
                result.current.navigateWeek('prev');
            });

            const newWeekStart = result.current.selectedWeek.start;
            const daysDiff = Math.floor(
                (initialWeekStart.getTime() - newWeekStart.getTime()) / (1000 * 60 * 60 * 24)
            );

            expect(daysDiff).toBe(7);
        });

        it('navigates to next week', () => {
            const { result } = renderHook(() => useDashboardStore());
            const initialWeekStart = new Date(result.current.selectedWeek.start);

            mockApiClient.get.mockResolvedValue({ metrics: [], count: 0 });

            act(() => {
                result.current.navigateWeek('next');
            });

            const newWeekStart = result.current.selectedWeek.start;
            const daysDiff = Math.floor(
                (newWeekStart.getTime() - initialWeekStart.getTime()) / (1000 * 60 * 60 * 24)
            );

            expect(daysDiff).toBe(7);
        });
    });

    describe('updateMetric - Optimistic Updates', () => {
        it('applies optimistic update for nutrition', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const date = '2024-01-15';

            // Set initial data
            act(() => {
                result.current.dailyData[date] = {
                    date,
                    nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                    weight: null,
                    steps: 0,
                    workout: { completed: false },
                    completionStatus: {
                        nutritionFilled: false,
                        weightLogged: false,
                        activityCompleted: false,
                    },
                    updatedAt: new Date(),
                } as any;
            });

            mockApiClient.post.mockResolvedValue({ data: {} });
            mockApiClient.get.mockResolvedValue({
                date,
                nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                weight: null,
                steps: 0,
                workout: null,
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: false,
                    activityCompleted: false,
                },
            });

            await act(async () => {
                await result.current.updateMetric(date, {
                    type: 'nutrition',
                    data: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                });
            });

            // Check optimistic update was applied
            expect(result.current.dailyData[date].nutrition.calories).toBe(2000);
            expect(result.current.dailyData[date].completionStatus.nutritionFilled).toBe(true);
        });

        it('rolls back on API error', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const date = '2024-01-15';

            // Set initial data
            const initialData = {
                date,
                nutrition: { calories: 1500, protein: 100, fat: 50, carbs: 150 },
                weight: null,
                steps: 0,
                workout: { completed: false },
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: false,
                    activityCompleted: false,
                },
                updatedAt: new Date(),
            };

            act(() => {
                result.current.dailyData[date] = initialData as any;
            });

            mockApiClient.post.mockRejectedValue({
                response: { status: 500, data: { message: 'Server error' } },
            });

            await act(async () => {
                try {
                    await result.current.updateMetric(date, {
                        type: 'nutrition',
                        data: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                    });
                } catch (error) {
                    // Expected to throw
                }
            });

            // Check rollback occurred
            expect(result.current.dailyData[date].nutrition.calories).toBe(1500);
            expect(mockToast.error).toHaveBeenCalled();
        });

        it('updates weight with optimistic update', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const date = '2024-01-15';

            act(() => {
                result.current.dailyData[date] = {
                    date,
                    nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                    weight: null,
                    steps: 0,
                    workout: { completed: false },
                    completionStatus: {
                        nutritionFilled: false,
                        weightLogged: false,
                        activityCompleted: false,
                    },
                    updatedAt: new Date(),
                } as any;
            });

            mockApiClient.post.mockResolvedValue({ data: {} });
            mockApiClient.get.mockResolvedValue({
                date,
                nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                weight: 75.5,
                steps: 0,
                workout: { completed: false },
                completionStatus: {
                    nutritionFilled: false,
                    weightLogged: true,
                    activityCompleted: false,
                },
            });

            await act(async () => {
                await result.current.updateMetric(date, {
                    type: 'weight',
                    data: { weight: 75.5 },
                });
            });

            expect(result.current.dailyData[date].weight).toBe(75.5);
            expect(result.current.dailyData[date].completionStatus.weightLogged).toBe(true);
        });
    });

    describe('updateTaskStatus - Optimistic Updates', () => {
        it('applies optimistic update for task completion', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const taskId = 'task-1';

            act(() => {
                result.current.tasks = [
                    {
                        id: taskId,
                        userId: 'user-1',
                        curatorId: 'curator-1',
                        title: 'Test task',
                        description: 'Test description',
                        status: 'active',
                        weekNumber: 1,
                        assignedAt: new Date(),
                        dueDate: new Date(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                ];
            });

            mockApiClient.put.mockResolvedValue({ data: {} });

            await act(async () => {
                await result.current.updateTaskStatus(taskId, 'completed');
            });

            const updatedTask = result.current.tasks.find((t) => t.id === taskId);
            expect(updatedTask?.status).toBe('completed');
            expect(updatedTask?.completedAt).toBeTruthy();
        });

        it('rolls back task update on error', async () => {
            const { result } = renderHook(() => useDashboardStore());
            const taskId = 'task-1';

            const originalTask = {
                id: taskId,
                userId: 'user-1',
                curatorId: 'curator-1',
                title: 'Test task',
                description: 'Test description',
                status: 'active' as const,
                weekNumber: 1,
                assignedAt: new Date(),
                dueDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            act(() => {
                result.current.tasks = [originalTask];
            });

            mockApiClient.put.mockRejectedValue({
                response: { status: 500, data: { message: 'Server error' } },
            });

            await act(async () => {
                try {
                    await result.current.updateTaskStatus(taskId, 'completed');
                } catch (error) {
                    // Expected to throw
                }
            });

            const task = result.current.tasks.find((t) => t.id === taskId);
            expect(task?.status).toBe('active');
            expect(task?.completedAt).toBeUndefined();
            expect(mockToast.error).toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('handles network errors', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockRejectedValue(new TypeError('Network request failed'));

            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            expect(result.current.error?.code).toBe('NETWORK_ERROR');
            expect(result.current.isOffline).toBe(true);
        });

        it('handles 401 unauthorized errors', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockRejectedValue({
                response: { status: 401, data: { message: 'Unauthorized' } },
            });

            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            expect(result.current.error?.code).toBe('UNAUTHORIZED');
        });

        it('handles 404 not found errors', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockRejectedValue({
                response: { status: 404, data: { message: 'Not found' } },
            });

            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            expect(result.current.error?.code).toBe('NOT_FOUND');
        });

        it('handles 400 validation errors', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockRejectedValue({
                response: { status: 400, data: { message: 'Invalid data' } },
            });

            await act(async () => {
                await result.current.fetchDailyData(new Date('2024-01-15'));
            });

            expect(result.current.error?.code).toBe('VALIDATION_ERROR');
        });

        it('clears error state', () => {
            const { result } = renderHook(() => useDashboardStore());

            act(() => {
                result.current.error = {
                    code: 'SERVER_ERROR',
                    message: 'Test error',
                };
            });

            act(() => {
                result.current.clearError();
            });

            expect(result.current.error).toBeNull();
        });
    });

    describe('State Transitions', () => {
        it('sets loading state during fetch', async () => {
            const { result } = renderHook(() => useDashboardStore());

            mockApiClient.get.mockImplementation(
                () =>
                    new Promise((resolve) =>
                        setTimeout(
                            () =>
                                resolve({
                                    date: '2024-01-15',
                                    nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                                    weight: null,
                                    steps: 0,
                                    workout: { completed: false },
                                    completionStatus: {
                                        nutritionFilled: false,
                                        weightLogged: false,
                                        activityCompleted: false,
                                    },
                                }),
                            100
                        )
                    )
            );

            act(() => {
                result.current.fetchDailyData(new Date('2024-01-15'));
            });

            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('transitions from offline to online', async () => {
            const { result } = renderHook(() => useDashboardStore());

            await act(async () => {
                result.current.setOfflineStatus(true);
            });

            expect(result.current.isOffline).toBe(true);
            expect(mockToast.error).toHaveBeenCalledWith(
                'Нет подключения к интернету',
                expect.any(Object)
            );

            await act(async () => {
                result.current.setOfflineStatus(false);
            });

            // setOfflineStatus(false) should immediately set isOffline to false
            expect(result.current.isOffline).toBe(false);
            expect(mockToast.success).toHaveBeenCalledWith(
                'Подключение восстановлено',
                expect.any(Object)
            );
        });

        it('resets store to initial state', () => {
            const { result } = renderHook(() => useDashboardStore());

            // Set some state
            act(() => {
                useDashboardStore.setState({
                    dailyData: {
                        '2024-01-15': {
                            date: '2024-01-15',
                            nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                            weight: 75.5,
                            steps: 8000,
                            workout: { completed: false },
                            completionStatus: {
                                nutritionFilled: true,
                                weightLogged: true,
                                activityCompleted: false,
                            },
                            updatedAt: new Date(),
                        },
                    } as any,
                    error: { code: 'SERVER_ERROR', message: 'Test error' },
                    isLoading: true,
                    weeklyPlan: {
                        id: 'plan-1',
                        userId: 'user-1',
                        curatorId: 'curator-1',
                        caloriesGoal: 2000,
                        proteinGoal: 150,
                        startDate: new Date(),
                        endDate: new Date(),
                        isActive: true,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        createdBy: 'curator-1',
                    },
                    tasks: [
                        {
                            id: 'task-1',
                            userId: 'user-1',
                            curatorId: 'curator-1',
                            title: 'Test task',
                            description: 'Test',
                            status: 'active',
                            weekNumber: 1,
                            assignedAt: new Date(),
                            dueDate: new Date(),
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    ],
                });
            });

            // Verify state was set
            expect(Object.keys(result.current.dailyData).length).toBeGreaterThan(0);
            expect(result.current.error).not.toBeNull();
            expect(result.current.isLoading).toBe(true);

            // Reset
            act(() => {
                result.current.reset();
            });

            // Verify reset - check that state is back to initial values
            expect(result.current.error).toBeNull();
            expect(result.current.isLoading).toBe(false);
            expect(result.current.weeklyPlan).toBeNull();
            expect(result.current.tasks).toEqual([]);
            expect(result.current.isOffline).toBe(false);
            expect(result.current.pollingIntervalId).toBeNull();
        });
    });
});

describe('Polling', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('starts polling with default interval', async () => {
        const { result } = renderHook(() => useDashboardStore());

        mockApiClient.get.mockResolvedValue({ plan: null, tasks: [], count: 0, week: 1 });

        await act(async () => {
            result.current.startPolling();
        });

        expect(result.current.pollingIntervalId).not.toBeNull();
    });

    it('stops polling', async () => {
        const { result } = renderHook(() => useDashboardStore());

        mockApiClient.get.mockResolvedValue({ plan: null, tasks: [], count: 0, week: 1 });

        await act(async () => {
            result.current.startPolling();
        });

        const intervalId = result.current.pollingIntervalId;
        expect(intervalId).not.toBeNull();

        await act(async () => {
            result.current.stopPolling();
        });

        expect(result.current.pollingIntervalId).toBeNull();
    });

    it('does not start multiple polling intervals', async () => {
        const { result } = renderHook(() => useDashboardStore());

        mockApiClient.get.mockResolvedValue({ plan: null, tasks: [], count: 0, week: 1 });

        await act(async () => {
            result.current.startPolling();
        });

        const firstIntervalId = result.current.pollingIntervalId;

        await act(async () => {
            result.current.startPolling();
        });

        expect(result.current.pollingIntervalId).toBe(firstIntervalId);
    });
});

describe('Cache Management', () => {
    it('saves data to localStorage cache', async () => {
        const { result } = renderHook(() => useDashboardStore());

        mockApiClient.get.mockResolvedValue({
            date: '2024-01-15',
            nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
            weight: 75.5,
            steps: 8000,
            workout: null,
            completionStatus: {
                nutritionFilled: true,
                weightLogged: true,
                activityCompleted: false,
            },
        });

        await act(async () => {
            await result.current.fetchDailyData(new Date('2024-01-15'));
        });

        const cached = localStorage.getItem('dashboard_daily_data');
        expect(cached).toBeTruthy();
    });

    it('loads data from cache when offline', async () => {
        const cachedData = {
            '2024-01-15': {
                date: '2024-01-15',
                nutrition: { calories: 2000, protein: 150, fat: 60, carbs: 200 },
                weight: 75.5,
                steps: 8000,
                workout: null,
                completionStatus: {
                    nutritionFilled: true,
                    weightLogged: true,
                    activityCompleted: false,
                },
                updatedAt: new Date().toISOString(),
            },
        };

        localStorage.setItem('dashboard_daily_data', JSON.stringify(cachedData));

        const { result } = renderHook(() => useDashboardStore());

        await act(async () => {
            result.current.loadFromCache();
        });

        expect(result.current.dailyData['2024-01-15']).toBeTruthy();
        expect(result.current.dailyData['2024-01-15'].nutrition.calories).toBe(2000);
    });
});
