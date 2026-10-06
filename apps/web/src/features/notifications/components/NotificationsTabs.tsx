/**
 * NotificationsTabs Component
 *
 * Displays tabs for switching between Main and Content notification categories.
 * Shows unread badge counts and supports keyboard navigation.
 */

import type { NotificationCategory } from '../types';
import { cn } from '@/shared/utils/cn';

import { t } from '@/shared/i18n'
export interface NotificationsTabsProps {
    /** Currently active tab */
    activeTab: NotificationCategory;
    /** Callback when tab is changed */
    onTabChange: (tab: NotificationCategory) => void;
    /** Unread counts for each category */
    unreadCounts: Record<NotificationCategory, number>;
}

/**
 * NotificationsTabs component renders tab navigation for notification categories
 *
 * Features:
 * - Two tabs: "Основные" (Main) and "Контент" (Content)
 * - Unread badge display when count > 0
 * - Keyboard navigation support (Arrow keys, Home, End)
 * - Active tab styling
 * - ARIA attributes for accessibility
 *
 * @example
 * <NotificationsTabs
 *   activeTab="main"
 *   onTabChange={(tab) => setActiveTab(tab)}
 *   unreadCounts={{ main: 5, content: 12 }}
 * />
 */
export function NotificationsTabs({
    activeTab,
    onTabChange,
    unreadCounts,
}: NotificationsTabsProps) {
    const tabs: Array<{ id: NotificationCategory; label: string }> = [
        { id: 'main', label: t('notifications.tabMain') },
        { id: 'content', label: t('notifications.tabContent') },
    ];

    const handleKeyDown = (event: React.KeyboardEvent, currentIndex: number) => {
        let newIndex = currentIndex;

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
                break;
            case 'ArrowRight':
                event.preventDefault();
                newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
                break;
            case 'Home':
                event.preventDefault();
                newIndex = 0;
                break;
            case 'End':
                event.preventDefault();
                newIndex = tabs.length - 1;
                break;
            default:
                return;
        }

        onTabChange(tabs[newIndex].id);
    };

    return (
        <div
            role="tablist"
            aria-label="Notification categories"
            className="flex overflow-x-auto border-b border-line px-screen-x sm:px-0 [&>button]:flex-1 sm:[&>button]:flex-initial"
        >
            {tabs.map((tab, index) => {
                const isActive = activeTab === tab.id;
                const unreadCount = unreadCounts[tab.id];
                const hasUnread = unreadCount > 0;

                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`${tab.id}-panel`}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onTabChange(tab.id)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        type="button"
                        className={cn(
                            // Вкладка — подчёркиванием: активная чернилами и
                            // линией `line-strong`, неактивная — третичным
                            // текстом. Терракота вкладкам не достаётся.
                            '-mb-px min-h-11 border-b-2 px-4 py-3 text-[15px] font-semibold transition-colors',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                            isActive
                                ? 'border-line-strong text-fg'
                                : 'border-transparent text-fg-subtle hover:text-fg'
                        )}
                    >
                        <span className="flex items-center gap-2">
                            {tab.label}
                            {hasUnread && (
                                <span
                                    className={cn(
                                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                                        isActive
                                            ? 'bg-fg text-fg-inverse'
                                            : 'bg-subtle text-fg-muted'
                                    )}
                                    aria-label={`${unreadCount} unread notifications`}
                                    role="status"
                                >
                                    {unreadCount}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
