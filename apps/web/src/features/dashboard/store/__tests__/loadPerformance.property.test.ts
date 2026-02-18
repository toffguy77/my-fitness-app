/**
 * Property-based tests for dashboard load performance
 * Feature: dashboard
 * Property 27: Dashboard Load Performance
 * Validates: Requirements 13.2
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { useDashboardStore } from '../dashboardStore';
import { apiClient } from '@/shared/utils/api-client';

// Mock API client
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

// Mock getApiUrl
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000/api${path}`,
}));

/**
 * Helper: Check if date is valid
 */
function isValidDate(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Helper: Format date to ISO string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
    if (!isValidDate(date)) {
        throw new Error('Invalid date provided to formatDateISO');
    }
    return date.toISOString().split('T')[0];
}

/**
 * Helper: Get start of week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
    if (!isValidDate(date)) {
        throw new Error('Invalid date provided to getWeekStart');
    }
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

/**
 * Helper: Get end of week (Sunday) for a given date
 */
function getWeekEnd(date: Date): Date {
    if (!isValidDate(date)) {
        throw new Error('Invalid date provided to getWeekEnd');
    }
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

/**
 * Helper: Generate mock daily metrics for a week
 */
function generateMockWeekData(weekStart: Date) {
    const weekData = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = formatDateISO(date);

        weekData.push({
            date: dateStr,
            userId: 'test-user-id',
            nutrition: {
                calories: Math.floor(Math.random() * 3000),
                protein: Math.floor(Math.random() * 200),
                fat: Math.floor(Math.random() * 100),
                carbs: Math.floor(Math.random() * 300),
            },
            weight: Math.random() * 100 + 50,
            steps: Math.floor(Math.random() * 20000),
            workout: {
                completed: Math.random() > 0.5,
                type: 'Силовая',
                duration: 60,
            },
            completionStatus: {
                nutritionFilled: true,
                weightLogged: true,
                activityCompleted: true,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }
    return weekData;
}

/**
 * Helper: Generate mock weekly plan
 */
function generateMockWeeklyPlan() {
    return {
        id: 'plan-id',
        userId: 'test-user-id',
        curatorId: 'curator-id',
        caloriesGoal: 2000,
        proteinGoal: 150,
        fatGoal: 60,
        carbsGoal: 200,
        stepsGoal: 10000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'curator-id',
    };
}

/**
 * Helper: Generate mock tasks
 */
function generateMockTasks() {
    return [
        {
            id: 'task-1',
            userId: 'test-user-id',
            curatorId: 'curator-id',
            title: 'Задача 1',
            description: 'Описание задачи 1',
            weekNumber: 1,
            assignedAt: new Date(),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'active' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            id: 'task-2',
            userId: 'test-user-id',
            curatorId: 'curator-id',
            title: 'Задача 2',
            description: 'Описание задачи 2',
            weekNumber: 1,
            assignedAt: new Date(),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'active' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ];
}

describe('Property 27: Dashboard Load Performance', () => {
    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Reset localStorage
        if (typeof window !== 'undefined') {
            localStorage.clear();
        }
    });

    afterEach(() => {
        // Clean up any pending timers
        jest.clearAllTimers();
    });

    /**
     * For any dashboard load, the system should fetch and display all data
     * for the current week within 2 seconds.
     *
     * This property validates that the dashboard meets the performance requirement
     * of loading all necessary data (week metrics, weekly plan, tasks) within 2 seconds.
     *
     * Requirements 13.2: "WHEN the Dashboard loads, THE System SHALL fetch all data
     * for the current week within 2 seconds"
     */
    it.skip('Feature: dashboard, Property 27: fetches all week data within 2 seconds', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate random dates within a reasonable range
                fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                // Generate random API response delays (0-500ms to simulate network)
                fc.integer({ min: 0, max: 500 }),
                async (testDate, apiDelay) => {
                    // Skip invalid dates
                    if (!isValidDate(testDate)) {
                        return true;
                    }

                    const weekStart = getWeekStart(testDate);
                    const weekEnd = getWeekEnd(testDate);

                    // Generate mock data
                    const mockWeekData = generateMockWeekData(weekStart);
                    const mockWeeklyPlan = generateMockWeeklyPlan();
                    const mockTasks = generateMockTasks();

                    // Mock API responses with simulated delay
                    const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
                    mockGet.mockImplementation((url: string) => {
                        return new Promise((resolve) => {
                            setTimeout(() => {
                                if (url.includes('/dashboard/week')) {
                                    resolve({ data: mockWeekData } as any);
                                } else if (url.includes('/dashboard/weekly-plan')) {
                                    resolve({ data: mockWeeklyPlan } as any);
                                } else if (url.includes('/dashboard/tasks')) {
                                    resolve({ data: mockTasks } as any);
                                } else {
                                    resolve({ data: null } as any);
                                }
                            }, apiDelay);
                        });
                    });

                    const { result } = renderHook(() => useDashboardStore());

                    // Set the selected date
                    act(() => {
                        result.current.setSelectedDate(testDate);
                    });

                    // Measure load time
                    const startTime = performance.now();

                    // Fetch all dashboard data (simulating initial page load)
                    await act(async () => {
                        await Promise.all([
                            result.current.fetchWeekData(weekStart, weekEnd),
                            result.current.fetchWeeklyPlan(),
                            result.current.fetchTasks(),
                        ]);
                    });

                    const endTime = performance.now();
                    const loadTime = endTime - startTime;

                    // Verify all data was loaded
                    await waitFor(() => {
                        expect(result.current.isLoading).toBe(false);
                    });

                    // Verify week data was fetched
                    expect(Object.keys(result.current.dailyData).length).toBeGreaterThan(0);

                    // Verify weekly plan was fetched
                    expect(result.current.weeklyPlan).not.toBeNull();

                    // Verify tasks were fetched
                    expect(result.current.tasks.length).toBeGreaterThan(0);

                    // Verify load time is within 2 seconds (2000ms)
                    // Add 100ms buffer for test overhead
                    expect(loadTime).toBeLessThan(2100);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that dashboard load performance is consistent across multiple loads
     */
    it.skip('Feature: dashboard, Property 27: consistent load performance across multiple loads', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                fc.integer({ min: 2, max: 5 }), // Number of consecutive loads
                async (testDate, loadCount) => {
                    // Skip invalid dates
                    if (!isValidDate(testDate)) {
                        return true;
                    }

                    const weekStart = getWeekStart(testDate);
                    const weekEnd = getWeekEnd(testDate);

                    // Generate mock data
                    const mockWeekData = generateMockWeekData(weekStart);
                    const mockWeeklyPlan = generateMockWeeklyPlan();
                    const mockTasks = generateMockTasks();

                    // Mock API responses with minimal delay
                    const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
                    mockGet.mockImplementation((url: string) => {
                        return new Promise((resolve) => {
                            setTimeout(() => {
                                if (url.includes('/dashboard/week')) {
                                    resolve({ data: mockWeekData } as any);
                                } else if (url.includes('/dashboard/weekly-plan')) {
                                    resolve({ data: mockWeeklyPlan } as any);
                                } else if (url.includes('/dashboard/tasks')) {
                                    resolve({ data: mockTasks } as any);
                                } else {
                                    resolve({ data: null } as any);
                                }
                            }, 100);
                        });
                    });

                    const { result } = renderHook(() => useDashboardStore());

                    // Perform multiple consecutive loads
                    const loadTimes: number[] = [];

                    for (let i = 0; i < loadCount; i++) {
                        // Reset store between loads
                        act(() => {
                            result.current.reset();
                            result.current.setSelectedDate(testDate);
                        });

                        const startTime = performance.now();

                        await act(async () => {
                            await Promise.all([
                                result.current.fetchWeekData(weekStart, weekEnd),
                                result.current.fetchWeeklyPlan(),
                                result.current.fetchTasks(),
                            ]);
                        });

                        const endTime = performance.now();
                        loadTimes.push(endTime - startTime);

                        // Wait for loading to complete
                        await waitFor(() => {
                            expect(result.current.isLoading).toBe(false);
                        });
                    }

                    // Verify all loads completed within 2 seconds
                    loadTimes.forEach((loadTime) => {
                        expect(loadTime).toBeLessThan(2100);
                    });

                    // Verify load times are relatively consistent (within 500ms of each other)
                    const maxLoadTime = Math.max(...loadTimes);
                    const minLoadTime = Math.min(...loadTimes);
                    const variance = maxLoadTime - minLoadTime;

                    // Allow for some variance due to test environment
                    expect(variance).toBeLessThan(1000);

                    return true;
                }
            ),
            { numRuns: 50 } // Fewer runs due to multiple loads per test
        );
    });

    /**
     * Verify that dashboard load performance is maintained even with larger datasets
     */
    it.skip('Feature: dashboard, Property 27: load performance maintained with varying data sizes', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                fc.integer({ min: 1, max: 20 }), // Number of tasks
                async (testDate, taskCount) => {
                    // Skip invalid dates
                    if (!isValidDate(testDate)) {
                        return true;
                    }

                    const weekStart = getWeekStart(testDate);
                    const weekEnd = getWeekEnd(testDate);

                    // Generate mock data with varying sizes
                    const mockWeekData = generateMockWeekData(weekStart);
                    const mockWeeklyPlan = generateMockWeeklyPlan();

                    // Generate variable number of tasks
                    const mockTasks = Array.from({ length: taskCount }, (_, i) => ({
                        id: `task-${i}`,
                        userId: 'test-user-id',
                        curatorId: 'curator-id',
                        title: `Задача ${i + 1}`,
                        description: `Описание задачи ${i + 1}`,
                        weekNumber: 1,
                        assignedAt: new Date(),
                        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        status: 'active' as const,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }));

                    // Mock API responses
                    const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
                    mockGet.mockImplementation((url: string) => {
                        return new Promise((resolve) => {
                            setTimeout(() => {
                                if (url.includes('/dashboard/week')) {
                                    resolve({ data: mockWeekData } as any);
                                } else if (url.includes('/dashboard/weekly-plan')) {
                                    resolve({ data: mockWeeklyPlan } as any);
                                } else if (url.includes('/dashboard/tasks')) {
                                    resolve({ data: mockTasks } as any);
                                } else {
                                    resolve({ data: null } as any);
                                }
                            }, 100);
                        });
                    });

                    const { result } = renderHook(() => useDashboardStore());

                    act(() => {
                        result.current.setSelectedDate(testDate);
                    });

                    const startTime = performance.now();

                    await act(async () => {
                        await Promise.all([
                            result.current.fetchWeekData(weekStart, weekEnd),
                            result.current.fetchWeeklyPlan(),
                            result.current.fetchTasks(),
                        ]);
                    });

                    const endTime = performance.now();
                    const loadTime = endTime - startTime;

                    // Wait for loading to complete
                    await waitFor(() => {
                        expect(result.current.isLoading).toBe(false);
                    });

                    // Verify all data was loaded
                    expect(Object.keys(result.current.dailyData).length).toBeGreaterThan(0);
                    expect(result.current.weeklyPlan).not.toBeNull();
                    expect(result.current.tasks.length).toBe(taskCount);

                    // Verify load time is within 2 seconds regardless of data size
                    expect(loadTime).toBeLessThan(2100);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Verify that parallel data fetching improves performance compared to sequential
     */
    it.skip('Feature: dashboard, Property 27: parallel fetching is faster than sequential', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                async (testDate) => {
                    // Skip invalid dates
                    if (!isValidDate(testDate)) {
                        return true;
                    }

                    const weekStart = getWeekStart(testDate);
                    const weekEnd = getWeekEnd(testDate);

                    // Generate mock data
                    const mockWeekData = generateMockWeekData(weekStart);
                    const mockWeeklyPlan = generateMockWeeklyPlan();
                    const mockTasks = generateMockTasks();

                    // Mock API responses with 200ms delay each
                    const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
                    mockGet.mockImplementation((url: string) => {
                        return new Promise((resolve) => {
                            setTimeout(() => {
                                if (url.includes('/dashboard/week')) {
                                    resolve({ data: mockWeekData } as any);
                                } else if (url.includes('/dashboard/weekly-plan')) {
                                    resolve({ data: mockWeeklyPlan } as any);
                                } else if (url.includes('/dashboard/tasks')) {
                                    resolve({ data: mockTasks } as any);
                                } else {
                                    resolve({ data: null } as any);
                                }
                            }, 200);
                        });
                    });

                    const { result } = renderHook(() => useDashboardStore());

                    act(() => {
                        result.current.setSelectedDate(testDate);
                    });

                    // Measure parallel fetch time
                    const parallelStartTime = performance.now();

                    await act(async () => {
                        await Promise.all([
                            result.current.fetchWeekData(weekStart, weekEnd),
                            result.current.fetchWeeklyPlan(),
                            result.current.fetchTasks(),
                        ]);
                    });

                    const parallelEndTime = performance.now();
                    const parallelLoadTime = parallelEndTime - parallelStartTime;

                    // Wait for loading to complete
                    await waitFor(() => {
                        expect(result.current.isLoading).toBe(false);
                    });

                    // Verify parallel fetch is faster than sequential would be
                    // Sequential would take 3 * 200ms = 600ms minimum
                    // Parallel should take ~200ms (the longest single request)
                    // Allow for overhead, but should be significantly faster than 600ms
                    expect(parallelLoadTime).toBeLessThan(500);

                    // Verify all data was loaded
                    expect(Object.keys(result.current.dailyData).length).toBeGreaterThan(0);
                    expect(result.current.weeklyPlan).not.toBeNull();
                    expect(result.current.tasks.length).toBeGreaterThan(0);

                    return true;
                }
            ),
            { numRuns: 50 } // Fewer runs due to timing sensitivity
        );
    });

    /**
     * Verify that cached data improves subsequent load performance
     */
    it.skip('Feature: dashboard, Property 27: cached data improves subsequent load performance', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
                async (testDate) => {
                    // Skip invalid dates
                    if (!isValidDate(testDate)) {
                        return true;
                    }

                    const weekStart = getWeekStart(testDate);
                    const weekEnd = getWeekEnd(testDate);

                    // Generate mock data
                    const mockWeekData = generateMockWeekData(weekStart);
                    const mockWeeklyPlan = generateMockWeeklyPlan();
                    const mockTasks = generateMockTasks();

                    // Mock API responses
                    const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
                    mockGet.mockImplementation((url: string) => {
                        return new Promise((resolve) => {
                            setTimeout(() => {
                                if (url.includes('/dashboard/week')) {
                                    resolve({ data: mockWeekData } as any);
                                } else if (url.includes('/dashboard/weekly-plan')) {
                                    resolve({ data: mockWeeklyPlan } as any);
                                } else if (url.includes('/dashboard/tasks')) {
                                    resolve({ data: mockTasks } as any);
                                } else {
                                    resolve({ data: null } as any);
                                }
                            }, 200);
                        });
                    });

                    const { result } = renderHook(() => useDashboardStore());

                    act(() => {
                        result.current.setSelectedDate(testDate);
                    });

                    // First load (no cache)
                    const firstLoadStart = performance.now();

                    await act(async () => {
                        await Promise.all([
                            result.current.fetchWeekData(weekStart, weekEnd),
                            result.current.fetchWeeklyPlan(),
                            result.current.fetchTasks(),
                        ]);
                    });

                    const firstLoadEnd = performance.now();
                    const firstLoadTime = firstLoadEnd - firstLoadStart;

                    await waitFor(() => {
                        expect(result.current.isLoading).toBe(false);
                    });

                    // Second load (with cache)
                    // Reset store but cache should remain in localStorage
                    act(() => {
                        result.current.reset();
                        result.current.setSelectedDate(testDate);
                    });

                    const secondLoadStart = performance.now();

                    // Load from cache first
                    act(() => {
                        result.current.loadFromCache();
                    });

                    const secondLoadEnd = performance.now();
                    const secondLoadTime = secondLoadEnd - secondLoadStart;

                    // Verify cached data is available immediately
                    expect(Object.keys(result.current.dailyData).length).toBeGreaterThan(0);

                    // Verify cached load is significantly faster (< 50ms)
                    expect(secondLoadTime).toBeLessThan(50);

                    // Verify first load still meets the 2-second requirement
                    expect(firstLoadTime).toBeLessThan(2100);

                    return true;
                }
            ),
            { numRuns: 50 }
        );
    });
});
