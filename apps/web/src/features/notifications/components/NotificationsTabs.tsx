/**
 * NotificationsTabs Component
 *
 * Displays tabs for switching between Main and Content notification categories.
 * Shows unread badge counts and supports keyboard navigation.
 */

import type { NotificationCategory } from '../types';
import { cn } from '@/shared/utils/cn';

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
        { id: 'main', label: 'Основные' },
        { id: 'content', label: 'Контент' },
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
            className={cn(
                'flex border-b border-gray-200',
                // Responsive container (Requirement 6.1, 6.2, 6.3)
                'overflow-x-auto',           // Mobile: allow horizontal scroll if needed
                'sm:overflow-x-visible',     // Tablet+: no scroll needed
                // Mobile: full width tabs
                '[&>button]:flex-1 sm:[&>button]:flex-initial'
            )}
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
                            'relative font-medium transition-colors',
                            // Responsive padding and sizing (Requirement 6.1, 6.2, 6.3)
                            'px-4 py-3 text-sm',      // Mobile: compact, touch-friendly
                            'sm:px-6 sm:py-3.5',      // Tablet: more spacing
                            'md:px-8 md:py-4 md:text-base', // Desktop: optimal spacing
                            // Enhanced focus-visible styles (Requirement 6.4, 6.7)
                            'focus:outline-none',
                            'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                            'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_#3b82f6]',
                            'focus-visible:z-10',
                            // Desktop hover states (Requirement 6.3)
                            'md:hover:text-gray-700',
                            // Minimum touch target (Requirement 6.4)
                            'min-h-[44px]',
                            // High contrast for active state (Requirement 6.6)
                            isActive
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-600 border-b-2 border-transparent'
                        )}
                    >
                        <span className="flex items-center gap-2">
                            {tab.label}
                            {hasUnread && (
                                <span
                                    className={cn(
                                        'inline-flex items-center justify-center',
                                        'rounded-full font-semibold',
                                        // Responsive badge sizing (Requirement 6.1, 6.2, 6.3)
                                        'min-w-[20px] h-5 px-1.5 text-xs',  // Mobile
                                        'sm:min-w-[22px] sm:h-5.5 sm:px-2', // Tablet
                                        'md:min-w-[24px] md:h-6 md:px-2.5 md:text-sm', // Desktop
                                        // High contrast colors (Requirement 6.6)
                                        isActive
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-200 text-gray-700'
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
