/**
 * Zustand store for notifications state management
 * Handles fetching, updating, and polling for notifications
 */

import { create } from 'zustand';
import toast from 'react-hot-toast';
import { apiClient } from '@/shared/utils/api-client';
import { getApiUrl } from '@/config/api';
import type {
    Notification,
    NotificationCategory,
    GetNotificationsResponse,
    UnreadCountsResponse,
    MarkAsReadResponse,
    MarkAllAsReadResponse,
    NotificationError,
} from '../types';

/**
 * LocalStorage keys for caching
 */
const CACHE_KEYS = {
    NOTIFICATIONS_MAIN: 'notifications_cache_main',
    NOTIFICATIONS_CONTENT: 'notifications_cache_content',
    UNREAD_COUNTS: 'notifications_unread_counts',
    LAST_SYNC: 'notifications_last_sync',
} as const;

/**
 * Cache expiration time (5 minutes)
 */
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

/**
 * Load cached notifications from localStorage
 */
function loadCachedNotifications(category: NotificationCategory): Notification[] {
    if (typeof window === 'undefined') return [];

    try {
        const key = category === 'main' ? CACHE_KEYS.NOTIFICATIONS_MAIN : CACHE_KEYS.NOTIFICATIONS_CONTENT;
        const cached = localStorage.getItem(key);

        if (!cached) return [];

        const data = JSON.parse(cached);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Failed to load cached notifications:', error);
        return [];
    }
}

/**
 * Save notifications to localStorage cache
 */
function saveCachedNotifications(category: NotificationCategory, notifications: Notification[]): void {
    if (typeof window === 'undefined') return;

    try {
        const key = category === 'main' ? CACHE_KEYS.NOTIFICATIONS_MAIN : CACHE_KEYS.NOTIFICATIONS_CONTENT;
        localStorage.setItem(key, JSON.stringify(notifications));
        localStorage.setItem(CACHE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (error) {
        console.error('Failed to save cached notifications:', error);
    }
}

/**
 * Load cached unread counts from localStorage
 */
function loadCachedUnreadCounts(): { main: number; content: number } {
    if (typeof window === 'undefined') return { main: 0, content: 0 };

    try {
        const cached = localStorage.getItem(CACHE_KEYS.UNREAD_COUNTS);

        if (!cached) return { main: 0, content: 0 };

        const data = JSON.parse(cached);
        return {
            main: typeof data.main === 'number' ? data.main : 0,
            content: typeof data.content === 'number' ? data.content : 0,
        };
    } catch (error) {
        console.error('Failed to load cached unread counts:', error);
        return { main: 0, content: 0 };
    }
}

/**
 * Save unread counts to localStorage cache
 */
function saveCachedUnreadCounts(counts: { main: number; content: number }): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(CACHE_KEYS.UNREAD_COUNTS, JSON.stringify(counts));
    } catch (error) {
        console.error('Failed to save cached unread counts:', error);
    }
}

/**
 * Check if cache is expired
 */
function isCacheExpired(): boolean {
    if (typeof window === 'undefined') return true;

    try {
        const lastSync = localStorage.getItem(CACHE_KEYS.LAST_SYNC);

        if (!lastSync) return true;

        const lastSyncTime = new Date(lastSync).getTime();
        const now = Date.now();

        return now - lastSyncTime > CACHE_EXPIRATION_MS;
    } catch (error) {
        return true;
    }
}

/**
 * Clear all cached data
 */
function clearCache(): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(CACHE_KEYS.NOTIFICATIONS_MAIN);
        localStorage.removeItem(CACHE_KEYS.NOTIFICATIONS_CONTENT);
        localStorage.removeItem(CACHE_KEYS.UNREAD_COUNTS);
        localStorage.removeItem(CACHE_KEYS.LAST_SYNC);
    } catch (error) {
        console.error('Failed to clear cache:', error);
    }
}

/**
 * Check if browser is online
 */
function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Map API errors to NotificationError with offline detection
 */
function mapError(error: any): NotificationError {
    // Check if offline first
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
            message: 'Уведомление не найдено',
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

    // Network errors (fetch failed, timeout, etc.)
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
 * Retry a function with exponential backoff
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

            // Don't retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
            const status = error.response?.status;
            if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                throw error;
            }

            // Don't retry if offline
            if (!isOnline()) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

/**
 * Store state interface
 */
interface NotificationsState {
    // State
    notifications: Record<NotificationCategory, Notification[]>;
    unreadCounts: Record<NotificationCategory, number>;
    isLoading: boolean;
    error: NotificationError | null;
    hasMore: Record<NotificationCategory, boolean>;
    pollingIntervalId: NodeJS.Timeout | null;
    isOffline: boolean;
    retryCount: number;
    isLoadingFromCache: boolean;

    // Actions
    fetchNotifications: (category: NotificationCategory, offset?: number) => Promise<void>;
    markAsRead: (id: string, category: NotificationCategory) => Promise<void>;
    markAllAsRead: (category: NotificationCategory) => Promise<void>;
    fetchUnreadCounts: () => Promise<void>;
    pollForUpdates: () => Promise<void>;
    startPolling: (interval?: number) => void;
    stopPolling: () => void;
    clearError: () => void;
    reset: () => void;
    retry: () => Promise<void>;
    setOfflineStatus: (isOffline: boolean) => void;
    loadFromCache: () => void;
    syncWhenOnline: () => Promise<void>;
}

/**
 * Initial state
 */
const initialState = {
    notifications: {
        main: [],
        content: [],
    },
    unreadCounts: {
        main: 0,
        content: 0,
    },
    isLoading: false,
    error: null,
    hasMore: {
        main: true,
        content: true,
    },
    pollingIntervalId: null,
    isOffline: false,
    retryCount: 0,
    isLoadingFromCache: false,
};

/**
 * Notifications store
 */
export const useNotificationsStore = create<NotificationsState>((set, get) => ({
    ...initialState,

    /**
     * Fetch notifications for a specific category with pagination
     */
    fetchNotifications: async (category: NotificationCategory, offset = 0) => {
        const state = get();

        // Don't fetch if already loading or no more data
        if (state.isLoading || (!state.hasMore[category] && offset > 0)) {
            return;
        }

        // If offline, load from cache
        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            return;
        }

        set({ isLoading: true, error: null });

        try {
            const limit = 50;
            const url = getApiUrl(`/notifications?category=${category}&limit=${limit}&offset=${offset}`);

            // Use retry logic for transient failures
            const response = await retryWithBackoff(
                () => apiClient.get<GetNotificationsResponse>(url),
                3,
                1000
            );

            set((state) => {
                const existingNotifications = offset === 0 ? [] : state.notifications[category];
                const newNotifications = response.notifications;

                // Merge notifications, avoiding duplicates
                const notificationMap = new Map<string, Notification>();
                existingNotifications.forEach((n) => notificationMap.set(n.id, n));
                newNotifications.forEach((n) => notificationMap.set(n.id, n));

                const mergedNotifications = Array.from(notificationMap.values()).sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

                // Save to cache
                saveCachedNotifications(category, mergedNotifications);

                return {
                    notifications: {
                        ...state.notifications,
                        [category]: mergedNotifications,
                    },
                    hasMore: {
                        ...state.hasMore,
                        [category]: response.hasMore,
                    },
                    isLoading: false,
                    retryCount: 0,
                };
            });

            // Fetch unread counts after loading notifications
            await get().pollForUpdates();
        } catch (error: any) {
            const mappedError = mapError(error);
            set({
                isLoading: false,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
                retryCount: state.retryCount + 1,
            });

            // Load from cache if network error
            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache();
            }
        }
    },

    /**
     * Mark a single notification as read with optimistic update
     */
    markAsRead: async (id: string, category: NotificationCategory) => {
        const state = get();
        const notification = state.notifications[category].find((n) => n.id === id);

        // Don't mark if already read
        if (!notification || notification.readAt) {
            return;
        }

        // Optimistic update
        const readAt = new Date().toISOString();
        set((state) => ({
            notifications: {
                ...state.notifications,
                [category]: state.notifications[category].map((n) =>
                    n.id === id ? { ...n, readAt } : n
                ),
            },
            unreadCounts: {
                ...state.unreadCounts,
                [category]: Math.max(0, state.unreadCounts[category] - 1),
            },
        }));

        try {
            const url = getApiUrl(`/notifications/${id}/read`);

            // Use retry logic for transient failures
            const response = await retryWithBackoff(
                () => apiClient.post<MarkAsReadResponse>(url, {}),
                3,
                1000
            );

            // Update with actual readAt from response
            set((state) => ({
                notifications: {
                    ...state.notifications,
                    [category]: state.notifications[category].map((n) =>
                        n.id === id ? { ...n, readAt: response.readAt } : n
                    ),
                },
            }));
        } catch (error: any) {
            // Rollback on failure
            set((state) => ({
                notifications: {
                    ...state.notifications,
                    [category]: state.notifications[category].map((n) =>
                        n.id === id ? { ...n, readAt: undefined } : n
                    ),
                },
                unreadCounts: {
                    ...state.unreadCounts,
                    [category]: state.unreadCounts[category] + 1,
                },
                error: mapError(error),
                isOffline: mapError(error).code === 'NETWORK_ERROR',
            }));

            // Show toast notification for failure
            const mappedError = mapError(error);
            toast.error(mappedError.message || 'Не удалось отметить уведомление как прочитанное');

            throw error;
        }
    },

    /**
     * Mark all notifications in a category as read with optimistic update
     */
    markAllAsRead: async (category: NotificationCategory) => {
        const state = get();
        const unreadNotifications = state.notifications[category].filter((n) => !n.readAt);

        // Nothing to mark
        if (unreadNotifications.length === 0) {
            return;
        }

        // Store original state for rollback
        const originalNotifications = [...state.notifications[category]];
        const originalUnreadCount = state.unreadCounts[category];

        // Optimistic update
        const readAt = new Date().toISOString();
        set((state) => ({
            notifications: {
                ...state.notifications,
                [category]: state.notifications[category].map((n) =>
                    n.readAt ? n : { ...n, readAt }
                ),
            },
            unreadCounts: {
                ...state.unreadCounts,
                [category]: 0,
            },
        }));

        try {
            const url = getApiUrl('/notifications/mark-all-read');

            // Use retry logic for transient failures
            await retryWithBackoff(
                () => apiClient.post<MarkAllAsReadResponse>(url, { category }),
                3,
                1000
            );
        } catch (error: any) {
            // Rollback on failure
            set((state) => ({
                notifications: {
                    ...state.notifications,
                    [category]: originalNotifications,
                },
                unreadCounts: {
                    ...state.unreadCounts,
                    [category]: originalUnreadCount,
                },
                error: mapError(error),
                isOffline: mapError(error).code === 'NETWORK_ERROR',
            }));

            // Show toast notification for failure
            const mappedError = mapError(error);
            toast.error(mappedError.message || 'Не удалось отметить все уведомления как прочитанные');
        }
    },

    /**
     * Fetch unread counts for both categories
     */
    fetchUnreadCounts: async () => {
        try {
            const url = getApiUrl('/notifications/unread-counts');
            const counts = await apiClient.get<UnreadCountsResponse>(url);

            set({
                unreadCounts: {
                    main: counts.main,
                    content: counts.content,
                },
            });
        } catch (error: any) {
            // Non-critical operation, just log the error
            console.error('Failed to fetch unread counts:', error);
        }
    },

    /**
     * Poll for new notifications and update unread counts
     */
    pollForUpdates: async () => {
        try {
            // Fetch latest notifications for both categories
            const mainUrl = getApiUrl('/notifications?category=main&limit=50&offset=0');
            const contentUrl = getApiUrl('/notifications?category=content&limit=50&offset=0');

            const [mainResponse, contentResponse] = await Promise.all([
                apiClient.get<GetNotificationsResponse>(mainUrl),
                apiClient.get<GetNotificationsResponse>(contentUrl),
            ]);

            // Fetch unread counts
            const countsUrl = getApiUrl('/notifications/unread-counts');
            const counts = await apiClient.get<UnreadCountsResponse>(countsUrl);

            // Only update if we got valid responses
            if (!mainResponse && !contentResponse) {
                return;
            }

            set((state) => {
                // Replace with server data (offset=0 fetch = authoritative)
                // This ensures deleted notifications are removed
                const dedupeAndSort = (notifications: Notification[]): Notification[] => {
                    const map = new Map<string, Notification>();
                    notifications.forEach((n) => map.set(n.id, n));
                    return Array.from(map.values()).sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                };

                const mainNotifications = mainResponse?.notifications
                    ? dedupeAndSort(mainResponse.notifications)
                    : state.notifications.main;
                const contentNotifications = contentResponse?.notifications
                    ? dedupeAndSort(contentResponse.notifications)
                    : state.notifications.content;

                // Save to cache
                saveCachedNotifications('main', mainNotifications);
                saveCachedNotifications('content', contentNotifications);
                saveCachedUnreadCounts({ main: counts?.main || 0, content: counts?.content || 0 });

                return {
                    notifications: {
                        main: mainNotifications,
                        content: contentNotifications,
                    },
                    unreadCounts: {
                        main: counts?.main || 0,
                        content: counts?.content || 0,
                    },
                };
            });
        } catch (error: any) {
            // Silently fail polling to avoid disrupting user experience
            console.error('Polling failed:', error);
        }
    },

    /**
     * Start polling for updates at specified interval
     */
    startPolling: (interval = 30000) => {
        const state = get();

        // Don't start if already polling
        if (state.pollingIntervalId) {
            return;
        }

        // Start new polling interval
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

        // Stop polling if active
        if (state.pollingIntervalId) {
            clearInterval(state.pollingIntervalId);
        }

        set(initialState);
    },

    /**
     * Retry the last failed operation
     */
    retry: async () => {
        const state = get();

        // Clear error and offline status
        set({ error: null, isOffline: false });

        // Retry fetching notifications for both categories
        try {
            await Promise.all([
                get().fetchNotifications('main', 0),
                get().fetchNotifications('content', 0),
            ]);
        } catch (error) {
            // Error already handled in fetchNotifications
            console.error('Retry failed:', error);
        }
    },

    /**
     * Set offline status
     */
    setOfflineStatus: (isOffline: boolean) => {
        const wasOffline = get().isOffline;

        set({ isOffline });

        // Show toast when going offline
        if (isOffline && !wasOffline) {
            toast.error('Нет подключения к интернету', {
                duration: 4000,
                icon: '📡',
            });
        }

        // Show toast when coming back online
        if (!isOffline && wasOffline) {
            toast.success('Подключение восстановлено', {
                duration: 3000,
                icon: '✅',
            });
        }

        if (isOffline) {
            // Stop polling when offline
            get().stopPolling();
        } else {
            // Resume polling when back online
            get().startPolling();
            // Sync data when back online
            get().syncWhenOnline();
        }
    },

    /**
     * Load notifications from localStorage cache
     */
    loadFromCache: () => {
        set({ isLoadingFromCache: true });

        try {
            const mainNotifications = loadCachedNotifications('main');
            const contentNotifications = loadCachedNotifications('content');
            const unreadCounts = loadCachedUnreadCounts();

            set({
                notifications: {
                    main: mainNotifications,
                    content: contentNotifications,
                },
                unreadCounts,
                isLoadingFromCache: false,
            });
        } catch (error) {
            console.error('Failed to load from cache:', error);
            set({ isLoadingFromCache: false });
        }
    },

    /**
     * Sync data when connection is restored
     */
    syncWhenOnline: async () => {
        // Check if we're actually online
        if (!isOnline()) {
            return;
        }

        // Clear offline status
        set({ isOffline: false, error: null });

        try {
            // Fetch fresh data for both categories
            await Promise.all([
                get().fetchNotifications('main', 0),
                get().fetchNotifications('content', 0),
            ]);

            // Start polling again
            get().startPolling();
        } catch (error) {
            console.error('Sync failed:', error);
        }
    },
}));
