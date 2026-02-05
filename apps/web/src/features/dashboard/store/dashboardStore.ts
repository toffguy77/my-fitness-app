/**
 * Zustand store for dashboard state management
 * Handles date navigation, daily metrics, weekly plans, tasks, and reports
 */

import { create } from 'zustand';
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
 * Cache expiration time (5 minutes)
 */
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

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
 * API response interfaces
 */
interface GetDailyMetricsResponse {
    data: DailyMetrics;
}

interface GetWeekMetricsResponse {
    data: DailyMetrics[];
}

interface GetWeeklyPlanResponse {
    data: WeeklyPlan | null;
}

interface GetTasksResponse {
    data: Task[];
}

interface UploadPhotoResponse {
    data: PhotoData;
}

interface SubmitWeeklyReportResponse {
    data: WeeklyReport;
}

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
    return date.toISOString().split('T')[0];
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
    error: DashboardError | null;
    isOffline: boolean;
    pollingIntervalId: NodeJS.Timeout | null;

    // Actions
    setSelectedDate: (date: Date) => void;
    navigateWeek: (direction: 'prev' | 'next') => void;
    fetchDailyData: (date: Date) => Promise<void>;
    fetchWeekData: (weekStart: Date, weekEnd: Date) => Promise<void>;
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
    error: null,
    isOffline: false,
    pollingIntervalId: null,
};

/**
 * Dashboard store
 */
export const useDashboardStore = create<DashboardState>((set, get) => ({
    ...initialState,

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

        // Fetch data for the new date
        get().fetchDailyData(date);
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

        // Fetch data for the new week
        get().fetchWeekData(newWeekStart, newWeekEnd);
    },

    /**
     * Fetch daily metrics for a specific date
     */
    fetchDailyData: async (date: Date) => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        set({ isLoading: true, error: null });

        try {
            const dateStr = formatDateISO(date);
            const url = getApiUrl(`/dashboard/daily/${dateStr}`);

            const response = await retryWithBackoff(
                () => apiClient.get<GetDailyMetricsResponse>(url),
                3,
                1000
            );

            set((state) => {
                const updatedDailyData = {
                    ...state.dailyData,
                    [dateStr]: response.data,
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
     * Fetch daily metrics for a week range
     */
    fetchWeekData: async (weekStart: Date, weekEnd: Date) => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
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

            set((state) => {
                const updatedDailyData = { ...state.dailyData };

                response.data.forEach((metrics) => {
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
     * Update a metric with optimistic update and rollback on error
     */
    updateMetric: async (date: string, metric: MetricUpdate) => {
        const state = get();
        const existingMetrics = state.dailyData[date];

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

        try {
            const url = getApiUrl('/dashboard/daily');

            await retryWithBackoff(
                () => apiClient.post(url, { date, ...metric }),
                3,
                1000
            );

            // Fetch updated data to ensure consistency
            await get().fetchDailyData(new Date(date));
        } catch (error: any) {
            // Rollback on failure
            set((state) => ({
                dailyData: {
                    ...state.dailyData,
                    [date]: existingMetrics,
                },
                error: mapError(error),
                isOffline: mapError(error).code === 'NETWORK_ERROR',
            }));

            const mappedError = mapError(error);
            toast.error(mappedError.message || 'Не удалось сохранить данные');

            throw error;
        }
    },

    /**
     * Fetch active weekly plan
     */
    fetchWeeklyPlan: async () => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        try {
            const url = getApiUrl('/dashboard/weekly-plan');

            const response = await retryWithBackoff(
                () => apiClient.get<GetWeeklyPlanResponse>(url),
                3,
                1000
            );

            set({ weeklyPlan: response.data });
            saveCachedData(CACHE_KEYS.WEEKLY_PLAN, response.data);
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
     * Fetch tasks for user
     */
    fetchTasks: async (weekNumber?: number) => {
        const state = get();

        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
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

            set({ tasks: response.data });
            saveCachedData(CACHE_KEYS.TASKS, response.data);
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
     */
    updateTaskStatus: async (taskId: string, status: 'completed') => {
        const state = get();
        const task = state.tasks.find((t) => t.id === taskId);

        if (!task) return;

        // Store original for rollback
        const originalTask = { ...task };

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

        try {
            const url = getApiUrl(`/dashboard/tasks/${taskId}`);

            await retryWithBackoff(
                () => apiClient.put(url, { status }),
                3,
                1000
            );
        } catch (error: any) {
            // Rollback on failure
            set((state) => ({
                tasks: state.tasks.map((t) =>
                    t.id === taskId ? originalTask : t
                ),
                error: mapError(error),
                isOffline: mapError(error).code === 'NETWORK_ERROR',
            }));

            const mappedError = mapError(error);
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
     * Reset store to initial state
     */
    reset: () => {
        const state = get();

        if (state.pollingIntervalId) {
            clearInterval(state.pollingIntervalId);
        }

        set(initialState);
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

            await Promise.all([
                get().fetchWeekData(state.selectedWeek.start, state.selectedWeek.end),
                get().fetchWeeklyPlan(),
                get().fetchTasks(),
            ]);

            get().startPolling();
        } catch (error) {
            // Log sync error (non-critical)
            if (process.env.NODE_ENV !== 'test') {
                console.warn('Sync failed:', error);
            }
        }
    },
}));
