/**
 * Notifications feature public API
 *
 * This barrel file exports the public interface of the notifications feature.
 * Components, hooks, and utilities from this feature should be imported through this file.
 */

// Types
export type {
    Notification,
    NotificationCategory,
    NotificationType,
    NotificationGroup,
    UnreadCounts,
    GetNotificationsResponse,
    UnreadCountsResponse,
    MarkAsReadResponse,
    MarkAllAsReadResponse,
    NotificationError,
} from './types';

// Components will be exported here as they are implemented
// export { NotificationsTabs } from './components/NotificationsTabs';
// export { NotificationList } from './components/NotificationList';
// export { NotificationItem } from './components/NotificationItem';
// export { NotificationIcon } from './components/NotificationIcon';
// export { NotificationsLayout } from './components/NotificationsLayout';
// export { NotificationsPage } from './components/NotificationsPage';

// Hooks will be exported here as they are implemented
// export { useNotifications } from './hooks/useNotifications';
// export { useNotificationPolling } from './hooks/useNotificationPolling';
// export { useAutoMarkAsRead } from './hooks/useAutoMarkAsRead';

// Store
export { useNotificationsStore } from './store/notificationsStore';

// Utils
export { groupNotificationsByDate } from './utils/dateGrouping';
export { formatRelativeTime } from './utils/formatTimestamp';
export { getNotificationIcon, getNotificationIconName } from './utils/iconMapping';
