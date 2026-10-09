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

import { t } from '@/shared/i18n'
import { mapApiError } from '@/shared/errors/mapApiError'
import { isApiError } from '@/shared/errors/apiErrors'
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
 * Check if browser is online
 */
function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Map API errors to NotificationError with offline detection
 */
function mapError(error: unknown): NotificationError {
    // The mapping is shared; only the noun for a missing thing is ours.
    const mapped = mapApiError(error, { notFound: t('notifications.storeErrors.notFound') });
    return {
        code: mapped.code === 'FORBIDDEN' || mapped.code === 'TIMEOUT' ||
            mapped.code === 'RATE_LIMITED' || mapped.code === 'UNKNOWN'
            ? 'SERVER_ERROR'
            : mapped.code,
        message: mapped.message,
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
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
            const status = isApiError(error) ? error.status : undefined;
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
    /** Lists somebody has opened: polling refreshes only these. */
    listsLoaded: Record<NotificationCategory, boolean>;

    // Actions
    fetchNotifications: (category: NotificationCategory, offset?: number) => Promise<void>;
    markAsRead: (id: string, category: NotificationCategory) => Promise<void>;
    markAllAsRead: (category: NotificationCategory) => Promise<void>;
    fetchUnreadCounts: () => Promise<void>;
    pollForUpdates: () => Promise<void>;
    startPolling: (interval?: number, options?: { immediate?: boolean }) => void;
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
    listsLoaded: {
        main: false,
        content: false,
    },
};

/**
 * Pages of the lists being fetched, as `category:offset`. The two lists of the
 * notifications page load side by side; the single `isLoading` flag used to
 * turn the second one away, and the page waited for a poll to fill it.
 */
const listsInFlight = new Set<string>();

/**
 * When the counters were last asked for. A list that has just loaded asks for
 * them only if nobody has in the last few seconds: the notifications page loads
 * two lists while the shell's first poll is asking too, and the same counters
 * went out three times.
 */
let countsRequestedAt = 0;
const COUNTS_FRESH_MS = 5000;

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

        // Don't fetch the same page twice at once, or past the end
        const key = `${category}:${offset}`;
        if (listsInFlight.has(key) || (!state.hasMore[category] && offset > 0)) {
            return;
        }

        // If offline, load from cache — and remember the list is open, so it
        // is refreshed when the connection comes back
        if (state.isOffline || !isOnline()) {
            get().loadFromCache();
            set((current) => ({ listsLoaded: { ...current.listsLoaded, [category]: true } }));
            return;
        }

        listsInFlight.add(key);
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

            // This page is in; the spinner stays only while another is loading
            listsInFlight.delete(key);
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
                    listsLoaded: {
                        ...state.listsLoaded,
                        [category]: true,
                    },
                    isLoading: listsInFlight.size > 0,
                    retryCount: 0,
                };
            });

            // The counters, not both lists again: this list was just loaded.
            if (Date.now() - countsRequestedAt > COUNTS_FRESH_MS) {
                await get().fetchUnreadCounts();
            }
        } catch (error) {
            const mappedError = mapError(error);
            listsInFlight.delete(key);
            set({
                isLoading: listsInFlight.size > 0,
                error: mappedError,
                isOffline: mappedError.code === 'NETWORK_ERROR',
                retryCount: state.retryCount + 1,
            });

            // Load from cache if network error
            if (mappedError.code === 'NETWORK_ERROR') {
                get().loadFromCache();
            }
        } finally {
            listsInFlight.delete(key);
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
        } catch (error) {
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
            toast.error(mappedError.message || t('notifications.markReadFailed'));

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
        } catch (error) {
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
            toast.error(mappedError.message || t('notifications.markAllReadFailed'));
        }
    },

    /**
     * Fetch unread counts for both categories
     */
    fetchUnreadCounts: async () => {
        try {
            const url = getApiUrl('/notifications/unread-counts');
            countsRequestedAt = Date.now();
            const counts = await apiClient.get<UnreadCountsResponse>(url);
            const next = { main: counts.main, content: counts.content };

            // Cached like the lists: offline, the badge shows the last answer
            saveCachedUnreadCounts(next);
            set({ unreadCounts: next });
        } catch (error) {
            // Non-critical operation, just log the error
            console.error('Failed to fetch unread counts:', error);
        }
    },

    /**
     * Poll for new notifications and update unread counts
     */
    pollForUpdates: async () => {
        // The shell polls on every signed-in page, for the badge on the bell.
        // It used to download both lists — a hundred notifications every
        // thirty seconds — to show one number. Now it asks for the counters,
        // and refreshes a list only when the counters moved and somebody has
        // that list open.
        try {
            const previous = get().unreadCounts;
            const countsUrl = getApiUrl('/notifications/unread-counts');
            countsRequestedAt = Date.now();
            const counts = await apiClient.get<UnreadCountsResponse>(countsUrl);
            const next = { main: counts?.main || 0, content: counts?.content || 0 };

            saveCachedUnreadCounts(next);
            set({ unreadCounts: next });

            const { listsLoaded } = get();
            const stale = (['main', 'content'] as const).filter(
                (category) => listsLoaded[category] && next[category] !== previous[category]
            );
            if (stale.length === 0) {
                return;
            }

            const responses = await Promise.all(
                stale.map((category) =>
                    apiClient.get<GetNotificationsResponse>(
                        getApiUrl(`/notifications?category=${category}&limit=50&offset=0`)
                    )
                )
            );

            set((state) => {
                const notifications = { ...state.notifications };
                stale.forEach((category, index) => {
                    const response = responses[index];
                    if (!response?.notifications) return;
                    // offset=0 is authoritative: deleted notifications go away.
                    const map = new Map<string, Notification>();
                    response.notifications.forEach((n) => map.set(n.id, n));
                    notifications[category] = Array.from(map.values()).sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                    saveCachedNotifications(category, notifications[category]);
                });
                return { notifications };
            });
        } catch (error) {
            // Silently fail polling to avoid disrupting user experience
            console.error('Polling failed:', error);
        }
    },

    /**
     * Start polling for updates at specified interval
     */
    startPolling: (interval = 30000, { immediate = true } = {}) => {
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

        // Initial poll — unless the caller has just fetched the same data
        if (immediate) {
            get().pollForUpdates();
        }
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

        listsInFlight.clear();
        countsRequestedAt = 0;
        set(initialState);
    },

    /**
     * Retry the last failed operation
     */
    retry: async () => {
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

        // Only a change of state does anything. The notifications page reports
        // the browser's status on mount, and "online, as before" used to
        // reload both lists and every counter a second time.
        if (isOffline === wasOffline) {
            return;
        }

        set({ isOffline });

        // Show toast when going offline
        if (isOffline && !wasOffline) {
            toast.error(t('notifications.storeErrors.offline'), {
                duration: 4000,
                icon: '📡',
            });
        }

        // Show toast when coming back online
        if (!isOffline && wasOffline) {
            toast.success(t('notifications.reconnected'), {
                duration: 3000,
                icon: '✅',
            });
        }

        if (isOffline) {
            // Stop polling when offline
            get().stopPolling();
        } else {
            // The resync refreshes the open lists and resumes polling
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
            // Refresh the lists somebody has open; each brings the counters
            const { listsLoaded } = get();
            const open = (['main', 'content'] as const).filter((category) => listsLoaded[category]);
            await Promise.all(open.map((category) => get().fetchNotifications(category, 0)));

            // Resume polling; with no list open, its first poll fetches the counters
            get().startPolling(undefined, { immediate: open.length === 0 });
        } catch (error) {
            console.error('Sync failed:', error);
        }
    },
}));
