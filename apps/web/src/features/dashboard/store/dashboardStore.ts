/**
 * Zustand store for dashboard state management
 * Handles date navigation, daily metrics, weekly plans, tasks, and reports
 *
 * Optimizations implemented:
 * - In-memory caching with TTL for fetched data
 * - Prefetching of adjacent weeks during navigation
 * - Stale-while-revalidate pattern for immediate display
 * - Batched API requests for related data
 */

import { create } from 'zustand';
import { formatLocalDate } from '@/shared/utils/format';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type {
    DailyMetrics,
    WeeklyPlan,
    Task,
    MetricUpdate,
    PhotoData,
    WeeklyReport,
} from '../types';
import {
    addToQueue,
    removeFromQueue,
    loadQueue,
    incrementAttempts,
    shouldRetry,
    removeFailedEntries,
    sortQueueByTimestamp,
    type QueueEntry,
} from '../utils/offlineQueue';

/**
 * LocalStorage keys for caching
 */
const CACHE_KEYS = {
    DAILY_DATA: 'dashboard_daily_data',
    WEEKLY_PLAN: 'dashboard_weekly_plan',
    TASKS: 'dashboard_tasks',
    LAST_SYNC: 'dashboard_last_sync',
} as const;

/**
 * Cache expiration time (5 minutes for localStorage)
 */
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

/**
 * In-memory cache TTL values (milliseconds)
 */
const MEMORY_CACHE_TTL = {
    DAILY_DATA: 60 * 1000,      // 1 minute for daily metrics
    WEEKLY_DATA: 2 * 60 * 1000, // 2 minutes for week data
    WEEKLY_PLAN: 30 * 1000,     // 30 seconds for weekly plan (curator updates)
    TASKS: 30 * 1000,           // 30 seconds for tasks
} as const;

/**
 * In-memory cache entry interface
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Clear in-memory cache (for testing purposes)
 */
export function clearMemoryCache(): void {
    memoryCache.clear();
}

/**
 * In-memory cache for fast access
 * Stores data with timestamps for TTL-based invalidation
 */
const memoryCache = {
    dailyData: new Map<string, CacheEntry<DailyMetrics>>(),
    weekData: new Map<string, CacheEntry<DailyMetrics[]>>(),
    weeklyPlan: null as CacheEntry<WeeklyPlan | null> | null,
    tasks: null as CacheEntry<Task[]> | null,

    /**
     * Check if cache entry is still valid
     */
    isValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
        if (!entry) return false;
        return Date.now() - entry.timestamp < entry.ttl;
    },

    /**
     * Get cached daily data if valid
     */
    getDailyData(dateStr: string): DailyMetrics | null {
        const entry = this.dailyData.get(dateStr);
        if (this.isValid(entry)) {
            return entry!.data;
        }
        return null;
    },

    /**
     * Set daily data in cache
     */
    setDailyData(dateStr: string, data: DailyMetrics): void {
        this.dailyData.set(dateStr, {
            data,
            timestamp: Date.now(),
            ttl: MEMORY_CACHE_TTL.DAILY_DATA,
        });
    },

    /**
     * Get cached week data if valid
     */
    getWeekData(weekKey: string): DailyMetrics[] | null {
        const entry = this.weekData.get(weekKey);
        if (this.isValid(entry)) {
            return entry!.data;
        }
        return null;
    },

    /**
     * Set week data in cache
     */
    setWeekData(weekKey: string, data: DailyMetrics[]): void {
        this.weekData.set(weekKey, {
            data,
            timestamp: Date.now(),
            ttl: MEMORY_CACHE_TTL.WEEKLY_DATA,
        });
        // Also cache individual days
        data.forEach(metrics => {
            this.setDailyData(metrics.date, metrics);
        });
    },

    /**
     * Get cached weekly plan if valid
     */
    getWeeklyPlan(): WeeklyPlan | null | undefined {
        if (this.isValid(this.weeklyPlan)) {
            return this.weeklyPlan!.data;
        }
        return undefined; // undefined means cache miss, null means no plan
    },

    /**
     * Set weekly plan in cache
     */
    setWeeklyPlan(data: WeeklyPlan | null): void {
        this.weeklyPlan = {
            data,
            timestamp: Date.now(),
            ttl: MEMORY_CACHE_TTL.WEEKLY_PLAN,
        };
    },

    /**
     * Get cached tasks if valid
     */
    getTasks(): Task[] | null {
        if (this.isValid(this.tasks)) {
            return this.tasks!.data;
        }
        return null;
    },

    /**
     * Set tasks in cache
     */
    setTasks(data: Task[]): void {
        this.tasks = {
            data,
            timestamp: Date.now(),
            ttl: MEMORY_CACHE_TTL.TASKS,
        };
    },

    /**
     * Invalidate specific daily data
     */
    invalidateDailyData(dateStr: string): void {
        this.dailyData.delete(dateStr);
        // Also invalidate any week data containing this date
        for (const [key, entry] of this.weekData.entries()) {
            if (entry.data.some(m => m.date === dateStr)) {
                this.weekData.delete(key);
            }
        }
    },

    /**
     * Invalidate tasks cache
     */
    invalidateTasks(): void {
        this.tasks = null;
    },

    /**
     * Clear all caches
     */
    clear(): void {
        this.dailyData.clear();
        this.weekData.clear();
        this.weeklyPlan = null;
        this.tasks = null;
    },
};

/**
 * Week range interface
 */
interface WeekRange {
    start: Date;
    end: Date;
}

/**
 * Error interface
 */
interface DashboardError {
    code: string;
    message: string;
}

/**
 * Raw backend response for daily metrics (flat structure from Go API)
 * The backend returns snake_case, flat fields — not the nested shape the frontend uses.
 */
interface BackendDailyMetrics {
    id: string;
    user_id: number;
    date: string; // ISO timestamp e.g. "2026-02-23T00:00:00Z"
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    weight?: number | null;
    steps: number;
    workout_completed: boolean;
    workout_type?: string | null;
    workout_duration?: number | null;
    created_at: string;
    updated_at: string;
}

/**
 * Map flat backend metrics to nested frontend DailyMetrics shape.
 * Also handles already-mapped data gracefully (e.g. from cache or test mocks).
 */
function mapBackendMetrics(raw: BackendDailyMetrics | DailyMetrics | any): DailyMetrics {
    // If already in frontend shape (has nested 'nutrition' object), return as-is
    if (raw.nutrition !== undefined && typeof raw.nutrition === 'object') {
        return raw as DailyMetrics;
    }

    // Map from flat backend shape to nested frontend shape
    return {
        date: raw.date?.includes?.('T') ? raw.date.split('T')[0] : raw.date,
        userId: String(raw.user_id ?? raw.userId ?? ''),
        nutrition: {
            calories: raw.calories || 0,
            protein: raw.protein || 0,
            fat: raw.fat || 0,
            carbs: raw.carbs || 0,
        },
        weight: raw.weight ?? null,
        steps: raw.steps || 0,
        workout: {
            completed: raw.workout_completed || false,
            type: raw.workout_type ?? undefined,
            duration: raw.workout_duration ?? undefined,
        },
        completionStatus: {
            nutritionFilled: (raw.calories || 0) > 0,
            weightLogged: raw.weight != null,
            activityCompleted: raw.workout_completed || false,
        },
        createdAt: raw.created_at ? new Date(raw.created_at) : (raw.createdAt ?? new Date()),
        updatedAt: raw.updated_at ? new Date(raw.updated_at) : (raw.updatedAt ?? new Date()),
    };
}

/**
 * API response interfaces
 * These match the shape returned by apiClient AFTER it unwraps the
 * {status, data} envelope — i.e. the inner payload from the backend.
 */
type GetDailyMetricsResponse = BackendDailyMetrics;

interface GetWeekMetricsResponse {
    metrics: BackendDailyMetrics[];
    count: number;
}

interface GetWeeklyPlanResponse {
    // When no plan: { plan: null }
    // When plan exists: the plan object directly (no wrapper)
    plan?: any;
    // Backend plan fields (snake_case) may appear at top level
    [key: string]: any;
}

/**
 * Map backend weekly plan (snake_case) to frontend WeeklyPlan (camelCase).
 * Handles already-mapped data gracefully.
 */
function mapBackendWeeklyPlan(raw: any): WeeklyPlan {
    // If already in frontend shape (has camelCase keys), return as-is
    if (raw.caloriesGoal !== undefined) {
        return raw as WeeklyPlan;
    }

    return {
        id: raw.id,
        userId: String(raw.user_id ?? raw.userId ?? ''),
        curatorId: String(raw.curator_id ?? raw.curatorId ?? ''),
        caloriesGoal: raw.calories_goal ?? 0,
        proteinGoal: raw.protein_goal ?? 0,
        fatGoal: raw.fat_goal ?? undefined,
        carbsGoal: raw.carbs_goal ?? undefined,
        stepsGoal: raw.steps_goal ?? undefined,
        startDate: new Date(raw.start_date ?? raw.startDate),
        endDate: new Date(raw.end_date ?? raw.endDate),
        isActive: raw.is_active ?? raw.isActive ?? false,
        createdAt: new Date(raw.created_at ?? raw.createdAt),
        updatedAt: new Date(raw.updated_at ?? raw.updatedAt),
        createdBy: String(raw.created_by ?? raw.createdBy ?? ''),
    };
}

interface GetTasksResponse {
    tasks: Task[];
    count: number;
    week: number;
}

type UploadPhotoResponse = PhotoData;

type SubmitWeeklyReportResponse = WeeklyReport;

/**
 * Helper: Get start of week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
}

/**
 * Helper: Get end of week (Sunday) for a given date
 */
function getWeekEnd(date: Date): Date {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

/**
 * Helper: Format date to ISO string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
    return formatLocalDate(date);
}

/**
 * Helper: Check if browser is online
 */
function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Helper: Map API errors to DashboardError
 */
function mapError(error: any): DashboardError {
    if (!isOnline()) {
        return {
            code: 'NETWORK_ERROR',
            message: 'Нет подключения к интернету',
        };
    }

    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    if (status === 401) {
        return {
            code: 'UNAUTHORIZED',
            message: 'Требуется авторизация',
        };
    }

    if (status === 404) {
        return {
            code: 'NOT_FOUND',
            message: 'Данные не найдены',
        };
    }

    if (status === 400) {
        return {
            code: 'VALIDATION_ERROR',
            message: message || 'Неверные данные',
        };
    }

    if (status === 500) {
        return {
            code: 'SERVER_ERROR',
            message: 'Сервис временно недоступен',
        };
    }

    if (error instanceof TypeError || error.message?.includes('fetch') || error.message?.includes('network')) {
        return {
            code: 'NETWORK_ERROR',
            message: 'Проверьте подключение к интернету',
        };
    }

    return {
        code: 'SERVER_ERROR',
        message: 'Произошла ошибка',
    };
}

/**
 * Helper: Retry with exponential backoff
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            const status = error.response?.status;
            if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                throw error;
            }

            if (!isOnline()) {
                throw error;
            }

            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

/**
 * Helper: Load cached data from localStorage
 */
function loadCachedData<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const data = JSON.parse(cached);
        return data;
    } catch (error) {
        // Log cache loading error (non-critical)
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`Failed to load cached data for ${key}:`, error);
        }
        return null;
    }
}

/**
 * Helper: Save data to localStorage cache
 */
function saveCachedData<T>(key: string, data: T): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(CACHE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (error) {
        // Log cache saving error (non-critical)
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`Failed to save cached data for ${key}:`, error);
        }
    }
}

/**
 * Store state interface
 */
interface DashboardState {
    // Selected date context
    selectedDate: Date;
    selectedWeek: WeekRange;

    // Daily tracking data (keyed by ISO date string)
    dailyData: Record<string, DailyMetrics>;

    // Weekly data
    weeklyPlan: WeeklyPlan | null;
    tasks: Task[];

    // UI state
    isLoading: boolean;
    isBackgroundRefreshing: boolean; // For stale-while-revalidate
    error: DashboardError | null;
    isOffline: boolean;
    pollingIntervalId: NodeJS.Timeout | null;

    // Version counter bumped after metric save to signal targets re-fetch
    targetsVersion: number;

    // Prefetch tracking
    prefetchedWeeks: Set<string>;

    // Actions
    setSelectedDate: (date: Date) => void;
    navigateWeek: (direction: 'prev' | 'next') => void;
    fetchDailyData: (date: Date) => Promise<void>;
    fetchWeekData: (weekStart: Date, weekEnd: Date) => Promise<void>;
    fetchWeekDataWithStaleWhileRevalidate: (weekStart: Date, weekEnd: Date) => Promise<void>;
    prefetchAdjacentWeeks: (currentWeekStart: Date) => void;
    fetchAllDashboardData: () => Promise<void>;
    updateMetric: (date: string, metric: MetricUpdate) => Promise<void>;
    fetchWeeklyPlan: () => Promise<void>;
    fetchTasks: (weekNumber?: number) => Promise<void>;
    updateTaskStatus: (taskId: string, status: 'completed') => Promise<void>;
    submitWeeklyReport: (weekStart: Date, weekEnd: Date) => Promise<void>;
    uploadPhoto: (weekIdentifier: string, file: File) => Promise<void>;
    pollForUpdates: () => Promise<void>;
    startPolling: (interval?: number) => void;
    stopPolling: () => void;
    clearError: () => void;
    reset: () => void;
    setOfflineStatus: (isOffline: boolean) => void;
    loadFromCache: () => void;
    syncWhenOnline: () => Promise<void>;
}

/**
 * Initial state
 */
const initialState = {
    selectedDate: new Date(),
    selectedWeek: {
        start: getWeekStart(new Date()),
        end: getWeekEnd(new Date()),
    },
    dailyData: {},
    weeklyPlan: null,
    tasks: [],
    isLoading: false,
    isBackgroundRefreshing: false,
    error: null,
    isOffline: false,
    pollingIntervalId: null,
    prefetchedWeeks: new Set<string>(),
    targetsVersion: 0,
};

/**
 * Dashboard store
 */
export const useDashboardStore = create<DashboardState>((set, get) => ({
    ...initialState,
    prefetchedWeeks: new Set<string>(),

    /**
     * Set selected date and update week range
     */
    setSelectedDate: (date: Date) => {
        const weekStart = getWeekStart(date);
        const weekEnd = getWeekEnd(date);

        set({
            selectedDate: date,
            selectedWeek: { start: weekStart, end: weekEnd },
        });

        // Use stale-while-revalidate for better UX
        get().fetchWeekDataWithStaleWhileRevalidate(weekStart, weekEnd);
    },

    /**
     * Navigate to previous or next week
     */
    navigateWeek: (direction: 'prev' | 'next') => {
        const state = get();
        const currentWeekStart = state.selectedWeek.start;
        const offset = direction === 'prev' ? -7 : 7;

        const newWeekStart = new Date(currentWeekStart);
        newWeekStart.setDate(currentWeekStart.getDate() + offset);

        const newWeekEnd = getWeekEnd(newWeekStart);

        // Set new selected date to the start of the new week
        const newSelectedDate = new Date(newWeekStart);

        set({
            selectedDate: newSelectedDate,
            selectedWeek: { start: newWeekStart, end: newWeekEnd },
        });

        // Use stale-while-revalidate for the new week
        get().fetchWeekDataWithStaleWhileRevalidate(newWeekStart, newWeekEnd);

        // Prefetch adjacent weeks in background
        get().prefetchAdjacentWeeks(newWeekStart);
    },

    /**
     * Fetch daily metrics for a specific date with in-memory caching
     */
    fetchDailyData: async (date: Date) => {
        const state = get();
        const dateStr = formatDateISO(date);

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        // Check in-memory cache first
        const cachedData = memoryCache.getDailyData(dateStr);
        if (cachedData) {
            set((state) => ({
                dailyData: {
                    ...state.dailyData,
                    [dateStr]: cachedData,
                },
            }));
            return;
        }

        set({ isLoading: true, error: null });

        try {
            const url = getApiUrl(`/dashboard/daily/${dateStr}`);

            const response = await retryWithBackoff(
                () => apiClient.get<GetDailyMetricsResponse>(url),
                3,
                1000
            );

            // Map flat backend response to nested frontend shape
            const mapped = mapBackendMetrics(response);

            // Update in-memory cache
            memoryCache.setDailyData(dateStr, mapped);

            set((state) => {
                const updatedDailyData = {
                    ...state.dailyData,
                    [dateStr]: mapped,
                };

                saveCachedData(CACHE_KEYS.DAILY_DATA, updatedDailyData);

                return {
                    dailyData: updatedDailyData,
                    isLoading: false,
                };
            });
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                isLoading: false,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache();
            }
        }
    },

    /**
     * Fetch daily metrics for a week range with in-memory caching
     */
    fetchWeekData: async (weekStart: Date, weekEnd: Date) => {
        const state = get();
        const weekKey = `${formatDateISO(weekStart)}_${formatDateISO(weekEnd)}`;

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        // Check in-memory cache first
        const cachedWeekData = memoryCache.getWeekData(weekKey);
        if (cachedWeekData) {
            set((state) => {
                const updatedDailyData = { ...state.dailyData };
                cachedWeekData.forEach((metrics) => {
                    updatedDailyData[metrics.date] = metrics;
                });
                return { dailyData: updatedDailyData };
            });
            return;
        }

        set({ isLoading: true, error: null });

        try {
            const startStr = formatDateISO(weekStart);
            const endStr = formatDateISO(weekEnd);
            const url = getApiUrl(`/dashboard/week?start=${startStr}&end=${endStr}`);

            const response = await retryWithBackoff(
                () => apiClient.get<GetWeekMetricsResponse>(url),
                3,
                1000
            );

            // Map flat backend responses to nested frontend shape
            const mappedMetrics = response.metrics.map(mapBackendMetrics);

            // Update in-memory cache
            memoryCache.setWeekData(weekKey, mappedMetrics);

            set((state) => {
                const updatedDailyData = { ...state.dailyData };

                mappedMetrics.forEach((metrics) => {
                    updatedDailyData[metrics.date] = metrics;
                });

                saveCachedData(CACHE_KEYS.DAILY_DATA, updatedDailyData);

                return {
                    dailyData: updatedDailyData,
                    isLoading: false,
                };
            });
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                isLoading: false,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache();
            }
        }
    },

    /**
     * Fetch week data with stale-while-revalidate pattern
     * Shows cached data immediately, then refreshes in background
     */
    fetchWeekDataWithStaleWhileRevalidate: async (weekStart: Date, weekEnd: Date) => {
        const state = get();
        const weekKey = `${formatDateISO(weekStart)}_${formatDateISO(weekEnd)}`;

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        // Check in-memory cache - if valid, show immediately
        const cachedWeekData = memoryCache.getWeekData(weekKey);
        if (cachedWeekData) {
            // Show cached data immediately (stale)
            set((state) => {
                const updatedDailyData = { ...state.dailyData };
                cachedWeekData.forEach((metrics) => {
                    updatedDailyData[metrics.date] = metrics;
                });
                return { dailyData: updatedDailyData };
            });

            // Revalidate in background
            set({ isBackgroundRefreshing: true });

            try {
                const startStr = formatDateISO(weekStart);
                const endStr = formatDateISO(weekEnd);
                const url = getApiUrl(`/dashboard/week?start=${startStr}&end=${endStr}`);

                const response = await apiClient.get<GetWeekMetricsResponse>(url);

                // Map and update cache and state with fresh data
                const mappedMetrics = response.metrics.map(mapBackendMetrics);
                memoryCache.setWeekData(weekKey, mappedMetrics);

                set((state) => {
                    const updatedDailyData = { ...state.dailyData };
                    mappedMetrics.forEach((metrics) => {
                        updatedDailyData[metrics.date] = metrics;
                    });
                    saveCachedData(CACHE_KEYS.DAILY_DATA, updatedDailyData);
                    return {
                        dailyData: updatedDailyData,
                        isBackgroundRefreshing: false,
                    };
                });
            } catch (error) {
                // Background refresh failed, but we already have cached data
                set({ isBackgroundRefreshing: false });
                if (process.env.NODE_ENV !== 'test') {
                    console.warn('Background refresh failed:', error);
                }
            }
            return;
        }

        // No cache - fetch normally with loading state
        await get().fetchWeekData(weekStart, weekEnd);
    },

    /**
     * Prefetch adjacent weeks in background for smoother navigation
     */
    prefetchAdjacentWeeks: (currentWeekStart: Date) => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            return;
        }

        // Calculate previous and next week dates
        const prevWeekStart = new Date(currentWeekStart);
        prevWeekStart.setDate(currentWeekStart.getDate() - 7);
        const prevWeekEnd = getWeekEnd(prevWeekStart);
        const prevWeekKey = `${formatDateISO(prevWeekStart)}_${formatDateISO(prevWeekEnd)}`;

        const nextWeekStart = new Date(currentWeekStart);
        nextWeekStart.setDate(currentWeekStart.getDate() + 7);
        const nextWeekEnd = getWeekEnd(nextWeekStart);
        const nextWeekKey = `${formatDateISO(nextWeekStart)}_${formatDateISO(nextWeekEnd)}`;

        // Prefetch previous week if not already cached or prefetched
        if (!memoryCache.getWeekData(prevWeekKey) && !state.prefetchedWeeks.has(prevWeekKey)) {
            set((state) => ({
                prefetchedWeeks: new Set([...state.prefetchedWeeks, prevWeekKey]),
            }));

            // Prefetch in background (low priority)
            setTimeout(async () => {
                try {
                    const startStr = formatDateISO(prevWeekStart);
                    const endStr = formatDateISO(prevWeekEnd);
                    const url = getApiUrl(`/dashboard/week?start=${startStr}&end=${endStr}`);

                    const response = await apiClient.get<GetWeekMetricsResponse>(url);
                    const mappedMetrics = response.metrics.map(mapBackendMetrics);
                    memoryCache.setWeekData(prevWeekKey, mappedMetrics);

                    // Also update store state
                    set((state) => {
                        const updatedDailyData = { ...state.dailyData };
                        mappedMetrics.forEach((metrics) => {
                            updatedDailyData[metrics.date] = metrics;
                        });
                        return { dailyData: updatedDailyData };
                    });
                } catch (error) {
                    // Prefetch failed - not critical
                    if (process.env.NODE_ENV !== 'test') {
                        console.warn('Prefetch previous week failed:', error);
                    }
                }
            }, 100);
        }

        // Prefetch next week if not already cached or prefetched
        if (!memoryCache.getWeekData(nextWeekKey) && !state.prefetchedWeeks.has(nextWeekKey)) {
            set((state) => ({
                prefetchedWeeks: new Set([...state.prefetchedWeeks, nextWeekKey]),
            }));

            // Prefetch in background (low priority)
            setTimeout(async () => {
                try {
                    const startStr = formatDateISO(nextWeekStart);
                    const endStr = formatDateISO(nextWeekEnd);
                    const url = getApiUrl(`/dashboard/week?start=${startStr}&end=${endStr}`);

                    const response = await apiClient.get<GetWeekMetricsResponse>(url);
                    const mappedMetrics = response.metrics.map(mapBackendMetrics);
                    memoryCache.setWeekData(nextWeekKey, mappedMetrics);

                    // Also update store state
                    set((state) => {
                        const updatedDailyData = { ...state.dailyData };
                        mappedMetrics.forEach((metrics) => {
                            updatedDailyData[metrics.date] = metrics;
                        });
                        return { dailyData: updatedDailyData };
                    });
                } catch (error) {
                    // Prefetch failed - not critical
                    if (process.env.NODE_ENV !== 'test') {
                        console.warn('Prefetch next week failed:', error);
                    }
                }
            }, 200);
        }
    },

    /**
     * Fetch all dashboard data in a batched manner
     * Combines week data, weekly plan, and tasks into parallel requests
     */
    fetchAllDashboardData: async () => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        set({ isLoading: true, error: null });

        try {
            const weekStart = state.selectedWeek.start;
            const weekEnd = state.selectedWeek.end;
            const weekKey = `${formatDateISO(weekStart)}_${formatDateISO(weekEnd)}`;

            // Check caches first
            const cachedWeekData = memoryCache.getWeekData(weekKey);
            const cachedWeeklyPlan = memoryCache.getWeeklyPlan();
            const cachedTasks = memoryCache.getTasks();

            // Determine which requests need to be made
            const requests: Promise<any>[] = [];
            const requestTypes: string[] = [];

            if (!cachedWeekData) {
                const startStr = formatDateISO(weekStart);
                const endStr = formatDateISO(weekEnd);
                requests.push(
                    apiClient.get<GetWeekMetricsResponse>(
                        getApiUrl(`/dashboard/week?start=${startStr}&end=${endStr}`)
                    )
                );
                requestTypes.push('weekData');
            }

            if (cachedWeeklyPlan === undefined) { // undefined = cache miss
                requests.push(
                    apiClient.get<GetWeeklyPlanResponse>(getApiUrl('/dashboard/weekly-plan'))
                );
                requestTypes.push('weeklyPlan');
            }

            if (!cachedTasks) {
                requests.push(
                    apiClient.get<GetTasksResponse>(getApiUrl('/dashboard/tasks'))
                );
                requestTypes.push('tasks');
            }

            // If all data is cached, just update state from cache
            if (requests.length === 0) {
                set((state) => {
                    const updatedDailyData = { ...state.dailyData };
                    if (cachedWeekData) {
                        cachedWeekData.forEach((metrics) => {
                            updatedDailyData[metrics.date] = metrics;
                        });
                    }
                    return {
                        dailyData: updatedDailyData,
                        weeklyPlan: cachedWeeklyPlan ?? state.weeklyPlan,
                        tasks: cachedTasks ?? state.tasks,
                        isLoading: false,
                    };
                });
                return;
            }

            // Execute all requests in parallel (batched)
            const responses = await Promise.all(
                requests.map(req => retryWithBackoff(() => req, 3, 1000))
            );

            // Process responses
            const updatedState: Partial<DashboardState> = { isLoading: false };
            const updatedDailyData = { ...state.dailyData };

            responses.forEach((response, index) => {
                const type = requestTypes[index];

                switch (type) {
                    case 'weekData':
                        const weekData = (response as GetWeekMetricsResponse).metrics.map(mapBackendMetrics);
                        memoryCache.setWeekData(weekKey, weekData);
                        weekData.forEach((metrics) => {
                            updatedDailyData[metrics.date] = metrics;
                        });
                        saveCachedData(CACHE_KEYS.DAILY_DATA, updatedDailyData);
                        break;

                    case 'weeklyPlan':
                        const rawPlanResp = response as GetWeeklyPlanResponse;
                        const rawPlan = 'plan' in rawPlanResp ? rawPlanResp.plan : rawPlanResp;
                        const planData = rawPlan ? mapBackendWeeklyPlan(rawPlan) : null;
                        memoryCache.setWeeklyPlan(planData);
                        updatedState.weeklyPlan = planData;
                        saveCachedData(CACHE_KEYS.WEEKLY_PLAN, planData);
                        break;

                    case 'tasks':
                        const tasksData = (response as GetTasksResponse).tasks;
                        memoryCache.setTasks(tasksData);
                        updatedState.tasks = tasksData;
                        saveCachedData(CACHE_KEYS.TASKS, tasksData);
                        break;
                }
            });

            // Apply cached data for items that weren't fetched
            if (cachedWeekData) {
                cachedWeekData.forEach((metrics) => {
                    updatedDailyData[metrics.date] = metrics;
                });
            }
            if (cachedWeeklyPlan !== undefined && !updatedState.weeklyPlan) {
                updatedState.weeklyPlan = cachedWeeklyPlan;
            }
            if (cachedTasks && !updatedState.tasks) {
                updatedState.tasks = cachedTasks;
            }

            set({
                ...updatedState,
                dailyData: updatedDailyData,
            });

            // Prefetch adjacent weeks after initial load
            get().prefetchAdjacentWeeks(weekStart);

        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                isLoading: false,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache();
            }
        }
    },

    /**
     * Update a metric with optimistic update and rollback on error
     * Invalidates in-memory cache for the affected date
     */
    updateMetric: async (date: string, metric: MetricUpdate) => {
        const state = get();
        const existingMetrics = state.dailyData[date];

        // Invalidate cache for this date since we're updating
        memoryCache.invalidateDailyData(date);

        // Optimistic update
        set((state) => {
            const updatedMetrics = { ...existingMetrics };

            switch (metric.type) {
                case 'nutrition':
                    updatedMetrics.nutrition = metric.data;
                    updatedMetrics.completionStatus.nutritionFilled = metric.data.calories > 0;
                    break;
                case 'weight':
                    updatedMetrics.weight = metric.data.weight;
                    updatedMetrics.completionStatus.weightLogged = true;
                    break;
                case 'steps':
                    updatedMetrics.steps = metric.data.steps;
                    updatedMetrics.completionStatus.activityCompleted = metric.data.steps >= (state.weeklyPlan?.stepsGoal || 10000);
                    break;
                case 'workout':
                    updatedMetrics.workout = metric.data;
                    updatedMetrics.completionStatus.activityCompleted = metric.data.completed;
                    break;
            }

            updatedMetrics.updatedAt = new Date();

            const updatedDailyData = {
                ...state.dailyData,
                [date]: updatedMetrics,
            };

            saveCachedData(CACHE_KEYS.DAILY_DATA, updatedDailyData);

            return {
                dailyData: updatedDailyData,
            };
        });

        // If offline, queue the mutation
        if (state.isOffline || !isOnline()) {
            addToQueue('metric', date, metric);
            toast.success('Изменения сохранены локально', {
                icon: '💾',
                duration: 2000,
            });
            return;
        }

        try {
            const url = getApiUrl('/dashboard/daily');

            await retryWithBackoff(
                () => apiClient.post(url, { date, metric }),
                3,
                1000
            );

            // Fetch updated data to ensure consistency and update cache
            await get().fetchDailyData(new Date(date));

            // Bump version to trigger targets re-fetch in NutritionBlock
            set((state) => ({ targetsVersion: state.targetsVersion + 1 }));
        } catch (error: any) {
            const mappedError = mapError(error);

            // If network error, queue for retry
            if (mappedError.code === 'NETWORK_ERROR') {
                addToQueue('metric', date, metric);
                set({ isOffline: true });
                toast.error('Нет подключения. Изменения сохранены локально', {
                    icon: '📡',
                    duration: 3000,
                });
                return;
            }

            // For other errors, rollback
            set((state) => ({
                dailyData: {
                    ...state.dailyData,
                    [date]: existingMetrics,
                },
                error: mappedError,
            }));

            toast.error(mappedError.message || 'Не удалось сохранить данные');

            throw error;
        }
    },

    /**
     * Fetch active weekly plan with in-memory caching
     */
    fetchWeeklyPlan: async () => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        // Check in-memory cache first
        const cachedPlan = memoryCache.getWeeklyPlan();
        if (cachedPlan !== undefined) { // undefined = cache miss, null = no plan
            set({ weeklyPlan: cachedPlan });
            return;
        }

        try {
            const url = getApiUrl('/dashboard/weekly-plan');

            const response = await retryWithBackoff(
                () => apiClient.get<GetWeeklyPlanResponse>(url),
                3,
                1000
            );

            // Update in-memory cache
            // Backend returns plan directly when it exists, or {plan: null} when not
            const rawPlan = 'plan' in response ? response.plan : response;
            const plan = rawPlan ? mapBackendWeeklyPlan(rawPlan) : null;
            memoryCache.setWeeklyPlan(plan);

            set({ weeklyPlan: plan });
            saveCachedData(CACHE_KEYS.WEEKLY_PLAN, plan);
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache();
            }
        }
    },

    /**
     * Fetch tasks for user with in-memory caching
     */
    fetchTasks: async (weekNumber?: number) => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        // Check in-memory cache first (only for non-filtered requests)
        if (!weekNumber) {
            const cachedTasks = memoryCache.getTasks();
            if (cachedTasks) {
                set({ tasks: cachedTasks });
                return;
            }
        }

        try {
            const url = weekNumber
                ? getApiUrl(`/dashboard/tasks?week=${weekNumber}`)
                : getApiUrl('/dashboard/tasks');

            const response = await retryWithBackoff(
                () => apiClient.get<GetTasksResponse>(url),
                3,
                1000
            );

            // Update in-memory cache (only for non-filtered requests)
            const tasksArray = response.tasks;
            if (!weekNumber) {
                memoryCache.setTasks(tasksArray);
            }

            set({ tasks: tasksArray });
            saveCachedData(CACHE_KEYS.TASKS, tasksArray);
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache();
            }
        }
    },

    /**
     * Update task status with optimistic update
     * Invalidates tasks cache when status changes
     */
    updateTaskStatus: async (taskId: string, status: 'completed') => {
        const state = get();
        const task = state.tasks.find((t) => t.id === taskId);

        if (!task) return;

        // Store original for rollback
        const originalTask = { ...task };

        // Invalidate tasks cache since we're updating
        memoryCache.invalidateTasks();

        // Optimistic update
        set((state) => {
            const updatedTasks = state.tasks.map((t) =>
                t.id === taskId
                    ? { ...t, status, completedAt: new Date() }
                    : t
            );

            saveCachedData(CACHE_KEYS.TASKS, updatedTasks);

            return { tasks: updatedTasks };
        });

        // If offline, queue the mutation
        if (state.isOffline || !isOnline()) {
            addToQueue('task', taskId, { status });
            toast.success('Изменения сохранены локально', {
                icon: '💾',
                duration: 2000,
            });
            return;
        }

        try {
            const url = getApiUrl(`/dashboard/tasks/${taskId}`);

            await retryWithBackoff(
                () => apiClient.put(url, { status }),
                3,
                1000
            );
        } catch (error: any) {
            const mappedError = mapError(error);

            // If network error, queue for retry
            if (mappedError.code === 'NETWORK_ERROR') {
                addToQueue('task', taskId, { status });
                set({ isOffline: true });
                toast.error('Нет подключения. Изменения сохранены локально', {
                    icon: '📡',
                    duration: 3000,
                });
                return;
            }

            // For other errors, rollback
            set((state) => ({
                tasks: state.tasks.map((t) =>
                    t.id === taskId ? originalTask : t
                ),
                error: mappedError,
            }));

            toast.error(mappedError.message || 'Не удалось обновить задачу');

            throw error;
        }
    },

    /**
     * Submit weekly report
     */
    submitWeeklyReport: async (weekStart: Date, weekEnd: Date) => {
        set({ isLoading: true, error: null });

        try {
            const url = getApiUrl('/dashboard/weekly-report');

            await retryWithBackoff(
                () => apiClient.post<SubmitWeeklyReportResponse>(url, {
                    weekStart: formatDateISO(weekStart),
                    weekEnd: formatDateISO(weekEnd),
                }),
                3,
                1000
            );

            set({ isLoading: false });
            toast.success('Отчет успешно отправлен');
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                isLoading: false,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            toast.error(mappedError.message || 'Не удалось отправить отчет');
            throw error;
        }
    },

    /**
     * Upload weekly photo
     */
    uploadPhoto: async (weekIdentifier: string, file: File) => {
        set({ isLoading: true, error: null });

        try {
            const formData = new FormData();
            formData.append('week_identifier', weekIdentifier);
            formData.append('photo', file);

            const url = getApiUrl('/dashboard/photo-upload');

            // Note: For FormData, we need to use fetch directly
            const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            set({ isLoading: false });
            toast.success('Фото успешно загружено');
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                isLoading: false,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
            });

            toast.error(mappedError.message || 'Не удалось загрузить фото');
            throw error;
        }
    },

    /**
     * Poll for updates (weekly plan and tasks)
     */
    pollForUpdates: async () => {
        try {
            await Promise.all([
                get().fetchWeeklyPlan(),
                get().fetchTasks(),
            ]);
        } catch (error) {
            // Log polling error (non-critical, will retry)
            if (process.env.NODE_ENV !== 'test') {
                console.warn('Polling failed:', error);
            }
        }
    },

    /**
     * Start polling for updates
     */
    startPolling: (interval = 30000) => {
        const state = get();

        if (state.pollingIntervalId) {
            return;
        }

        const pollingIntervalId = setInterval(() => {
            get().pollForUpdates();
        }, interval);

        set({ pollingIntervalId });

        // Initial poll
        get().pollForUpdates();
    },

    /**
     * Stop polling for updates
     */
    stopPolling: () => {
        const state = get();

        if (state.pollingIntervalId) {
            clearInterval(state.pollingIntervalId);
            set({ pollingIntervalId: null });
        }
    },

    /**
     * Clear error state
     */
    clearError: () => {
        set({ error: null });
    },

    /**
     * Reset store to initial state and clear all caches
     */
    reset: () => {
        const state = get();

        if (state.pollingIntervalId) {
            clearInterval(state.pollingIntervalId);
        }

        // Clear in-memory cache
        memoryCache.clear();

        set({
            ...initialState,
            prefetchedWeeks: new Set<string>(),
        });
    },

    /**
     * Set offline status
     */
    setOfflineStatus: (isOffline: boolean) => {
        const wasOffline = get().isOffline;

        set({ isOffline });

        if (isOffline && !wasOffline) {
            toast.error('Нет подключения к интернету', {
                duration: 4000,
                icon: '📡',
            });
        }

        if (!isOffline && wasOffline) {
            toast.success('Подключение восстановлено', {
                duration: 3000,
                icon: '✅',
            });
        }

        if (isOffline) {
            get().stopPolling();
        } else {
            get().startPolling();
            get().syncWhenOnline();
        }
    },

    /**
     * Load data from localStorage cache
     */
    loadFromCache: () => {
        try {
            const dailyData = loadCachedData<Record<string, DailyMetrics>>(CACHE_KEYS.DAILY_DATA);
            const weeklyPlan = loadCachedData<WeeklyPlan | null>(CACHE_KEYS.WEEKLY_PLAN);
            const tasks = loadCachedData<Task[]>(CACHE_KEYS.TASKS);

            set({
                dailyData: dailyData || {},
                weeklyPlan: weeklyPlan || null,
                tasks: tasks || [],
            });
        } catch (error) {
            // Log cache loading error (non-critical)
            if (process.env.NODE_ENV !== 'test') {
                console.warn('Failed to load from cache:', error);
            }
        }
    },

    /**
     * Sync data when connection is restored
     */
    syncWhenOnline: async () => {
        if (!isOnline()) {
            return;
        }

        set({ isOffline: false, error: null });

        try {
            const state = get();

            // First, fetch latest data from server
            await Promise.all([
                get().fetchWeekData(state.selectedWeek.start, state.selectedWeek.end),
                get().fetchWeeklyPlan(),
                get().fetchTasks(),
            ]);

            // Then, process offline queue
            const queue = sortQueueByTimestamp();
            const failedEntries: QueueEntry[] = [];

            for (const entry of queue) {
                if (!shouldRetry(entry)) {
                    failedEntries.push(entry);
                    removeFromQueue(entry.id);
                    continue;
                }

                try {
                    incrementAttempts(entry.id);

                    switch (entry.type) {
                        case 'metric':
                            await get().updateMetric(entry.date, entry.data);
                            break;
                        case 'task':
                            await get().updateTaskStatus(entry.date, entry.data.status);
                            break;
                        case 'photo':
                            // Photo uploads need special handling (File object)
                            // Skip for now, user will need to re-upload
                            break;
                        case 'report':
                            await get().submitWeeklyReport(
                                new Date(entry.data.weekStart),
                                new Date(entry.data.weekEnd)
                            );
                            break;
                    }

                    // Remove from queue on success
                    removeFromQueue(entry.id);
                } catch (error) {
                    // Log sync error for this entry
                    if (process.env.NODE_ENV !== 'test') {
                        console.warn(`Failed to sync entry ${entry.id}:`, error);
                    }

                    // If max attempts reached, add to failed list
                    if (entry.attempts >= entry.maxAttempts) {
                        failedEntries.push(entry);
                        removeFromQueue(entry.id);
                    }
                }
            }

            // Show notification about sync results
            const syncedCount = queue.length - failedEntries.length;
            if (syncedCount > 0) {
                toast.success(`Синхронизировано ${syncedCount} ${syncedCount === 1 ? 'изменение' : 'изменений'}`, {
                    icon: '✅',
                    duration: 3000,
                });
            }

            if (failedEntries.length > 0) {
                toast.error(`Не удалось синхронизировать ${failedEntries.length} ${failedEntries.length === 1 ? 'изменение' : 'изменений'}`, {
                    icon: '⚠️',
                    duration: 4000,
                });
            }

            // Start polling again
            get().startPolling();
        } catch (error) {
            // Log sync error (non-critical)
            if (process.env.NODE_ENV !== 'test') {
                console.warn('Sync failed:', error);
            }
        }
    },
}));
