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
    | 'new_content'
    | 'task_assigned'
    | 'task_overdue'
    | 'plan_updated'
    | 'feedback_received';

/**
 * Screen a notification opens in the app. The web keeps using actionUrl;
 * records created before the field existed carry {kind: 'notifications'}.
 */
export type NotificationTargetKind =
    | 'chat'
    | 'task'
    | 'weekly_feedback'
    | 'plan'
    | 'client'
    | 'support_conversation'
    | 'lead'
    | 'article'
    | 'export'
    | 'notifications';

export interface NotificationTarget {
    kind: NotificationTargetKind;
    /** Every id is a string: a uuid or a decimal user id. */
    ids?: Record<string, string>;
}

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
    /**
     * GET /notifications always sends it. The web navigates by actionUrl and
     * does not read it; optional so test fixtures need not spell it out.
     */
    target?: NotificationTarget;
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
