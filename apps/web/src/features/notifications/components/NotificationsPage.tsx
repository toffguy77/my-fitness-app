/**
 * NotificationsPage Component
 *
 * Main page component that integrates all notification features:
 * - Layout with header
 * - Tab navigation between Main and Content categories
 * - Notification lists with infinite scroll
 * - Real-time polling for updates
 * - Auto-mark as read functionality
 */

'use client'

import { useState } from 'react';
import { NotificationsLayout } from './NotificationsLayout';
import { NotificationsTabs } from './NotificationsTabs';
import { NotificationList } from './NotificationList';
import { useNotifications } from '../hooks/useNotifications';
import { useNotificationPolling } from '../hooks/useNotificationPolling';
import { useAutoMarkAsRead } from '../hooks/useAutoMarkAsRead';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { NotificationCategory } from '../types';

/**
 * NotificationsPage component - main entry point for notifications feature
 *
 * Features:
 * - Tab-based navigation between Main and Content notifications
 * - Real-time polling for new notifications (30-second interval)
 * - Auto-mark visible notifications as read after 2 seconds
 * - Infinite scroll pagination
 * - Loading, error, and empty states
 *
 * Requirements: 1.1, 1.2, 1.5, 5.4
 *
 * @example
 * <NotificationsPage />
 */
export function NotificationsPage() {
    // Active tab state (Requirement 1.1, 1.2)
    const [activeTab, setActiveTab] = useState<NotificationCategory>('main');

    // Monitor online/offline status (Requirement 7.4)
    useOnlineStatus();

    // Connect to notifications store for both categories (Requirement 1.2)
    const mainNotifications = useNotifications('main');
    const contentNotifications = useNotifications('content');

    // Get current category data based on active tab
    const currentNotifications = activeTab === 'main' ? mainNotifications : contentNotifications;

    // Start polling for real-time updates (Requirement 5.4)
    useNotificationPolling({
        interval: 30000, // 30 seconds
        enabled: true,
    });

    // Auto-mark visible notifications as read (Requirement 3.4)
    useAutoMarkAsRead(
        currentNotifications.notifications,
        activeTab,
        {
            delay: 2000, // 2 seconds
            enabled: true,
        }
    );

    // Handle tab switching (Requirement 1.2)
    const handleTabChange = (tab: NotificationCategory) => {
        setActiveTab(tab);
    };

    // Prepare unread counts for tabs (Requirement 1.3)
    const unreadCounts = {
        main: mainNotifications.unreadCount,
        content: contentNotifications.unreadCount,
    };

    return (
        <NotificationsLayout>
            {/* Tab Navigation (Requirement 1.1, 1.2) */}
            <NotificationsTabs
                activeTab={activeTab}
                onTabChange={handleTabChange}
                unreadCounts={unreadCounts}
            />

            {/* Notification List for Active Tab (Requirement 1.2, 1.5) */}
            <div
                role="tabpanel"
                id={`${activeTab}-panel`}
                aria-labelledby={`${activeTab}-tab`}
                className="mt-4"
            >
                <NotificationList
                    category={activeTab}
                    notifications={currentNotifications.notifications}
                    isLoading={currentNotifications.isLoading}
                    error={currentNotifications.error}
                    onLoadMore={currentNotifications.fetchMore}
                    hasMore={currentNotifications.hasMore}
                    onMarkAsRead={currentNotifications.markAsRead}
                />
            </div>
        </NotificationsLayout>
    );
}
