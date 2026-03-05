/**
 * Notifications feature type definitions
 */

/**
 * Notification category - distinguishes between personal and content notifications
 */
export type NotificationCategory = 'main' | 'content';

/**
 * Notification type - specific type of notification within a category
 */
export type NotificationType =
    | 'trainer_feedback'
    | 'achievement'
    | 'reminder'
    | 'system_update'
    | 'new_feature'
    | 'general'
    | 'new_content';

/**
 * Core notification data structure
 */
export interface Notification {
    id: string;
    userId: string;
    category: NotificationCategory;
    type: NotificationType;
    title: string;
    content: string;
    iconUrl?: string;
    createdAt: string; // ISO 8601 format
    readAt?: string; // ISO 8601 format
    actionUrl?: string;
    contentCategory?: string;
}

/**
 * Grouped notifications by date for display purposes
 */
export interface NotificationGroup {
    date: string; // "Today", "Yesterday", "Last Week", or ISO date
    notifications: Notification[];
}

/**
 * Unread notification counts per category
 */
export interface UnreadCounts {
    main: number;
    content: number;
}

/**
 * API response for fetching notifications
 */
export interface GetNotificationsResponse {
    notifications: Notification[];
    total: number;
    hasMore: boolean;
}

/**
 * API response for unread counts
 */
export interface UnreadCountsResponse {
    main: number;
    content: number;
}

/**
 * API response for mark as read operation
 */
export interface MarkAsReadResponse {
    success: boolean;
    readAt: string; // ISO 8601 format
}

/**
 * API response for mark all as read operation
 */
export interface MarkAllAsReadResponse {
    success: boolean;
    markedCount: number;
}

/**
 * Error response from API
 */
export interface NotificationError {
    code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'SERVER_ERROR';
    message: string;
    details?: Record<string, string>;
}

/**
 * Content notification preferences
 */
export interface ContentNotificationPreferences {
    mutedCategories: string[];
    muted: boolean;
}

export interface UpdatePreferencesRequest {
    mutedCategories: string[];
    muted: boolean;
}
