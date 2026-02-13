/**
 * Unit tests for NotificationsPage component
 *
 * Tests integration of:
 * - NotificationsLayout
 * - NotificationsTabs
 * - NotificationList
 * - useNotifications hook
 * - useNotificationPolling hook
 * - useAutoMarkAsRead hook
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationsPage } from '../NotificationsPage';
import { useNotifications } from '../../hooks/useNotifications';
import { useNotificationPolling } from '../../hooks/useNotificationPolling';
import { useAutoMarkAsRead } from '../../hooks/useAutoMarkAsRead';
import type { Notification } from '../../types';

// Mock Next.js router
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
    }),
}));

// Mock the hooks
jest.mock('../../hooks/useNotifications');
jest.mock('../../hooks/useNotificationPolling');
jest.mock('../../hooks/useAutoMarkAsRead');

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null,
});
window.IntersectionObserver = mockIntersectionObserver as any;

// Mock react-window
jest.mock('react-window', () => ({
    VariableSizeList: ({ children, itemCount }: any) => (
        <div data-testid="virtual-list">
            {Array.from({ length: Math.min(itemCount, 10) }, (_, index) => (
                <div key={index}>
                    {children({ index, style: {} })}
                </div>
            ))}
        </div>
    ),
}));

const mockUseNotifications = useNotifications as jest.MockedFunction<typeof useNotifications>;
const mockUseNotificationPolling = useNotificationPolling as jest.MockedFunction<typeof useNotificationPolling>;
const mockUseAutoMarkAsRead = useAutoMarkAsRead as jest.MockedFunction<typeof useAutoMarkAsRead>;

describe('NotificationsPage', () => {
    const mockMainNotifications: Notification[] = [
        {
            id: 'main-1',
            userId: 'user-1',
            category: 'main',
            type: 'trainer_feedback',
            title: 'Trainer feedback',
            content: 'Great progress!',
            createdAt: new Date().toISOString(),
        },
        {
            id: 'main-2',
            userId: 'user-1',
            category: 'main',
            type: 'achievement',
            title: 'Achievement',
            content: 'Goal completed',
            createdAt: new Date().toISOString(),
        },
    ];

    const mockContentNotifications: Notification[] = [
        {
            id: 'content-1',
            userId: 'user-1',
            category: 'content',
            type: 'new_feature',
            title: 'New feature',
            content: 'Check out our new feature',
            createdAt: new Date().toISOString(),
        },
    ];

    const mockMainNotificationsReturn = {
        notifications: mockMainNotifications,
        unreadCount: 2,
        isLoading: false,
        error: null,
        hasMore: false,
        fetchMore: jest.fn(),
        markAsRead: jest.fn(),
        refresh: jest.fn(),
    };

    const mockContentNotificationsReturn = {
        notifications: mockContentNotifications,
        unreadCount: 1,
        isLoading: false,
        error: null,
        hasMore: false,
        fetchMore: jest.fn(),
        markAsRead: jest.fn(),
        refresh: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock implementations
        mockUseNotifications.mockImplementation((category) => {
            if (category === 'main') {
                return mockMainNotificationsReturn;
            }
            return mockContentNotificationsReturn;
        });

        mockUseNotificationPolling.mockImplementation(() => { });
        mockUseAutoMarkAsRead.mockImplementation(() => { });
    });

    describe('Initial render', () => {
        it('should render with default tab (main)', () => {
            render(<NotificationsPage />);

            // Should render layout
            expect(screen.getByTestId('notifications-layout')).toBeInTheDocument();

            // Should render page title
            expect(screen.getByText('Уведомления')).toBeInTheDocument();

            // Should render tabs
            expect(screen.getByText('Основные')).toBeInTheDocument();
            expect(screen.getByText('Контент')).toBeInTheDocument();

            // Should show main notifications by default
            expect(screen.getByText('Trainer feedback')).toBeInTheDocument();
            expect(screen.getByText('Achievement')).toBeInTheDocument();
        });

        it('should display unread badges on tabs', () => {
            render(<NotificationsPage />);

            // Should show unread count for main tab
            expect(screen.getByText('2')).toBeInTheDocument();

            // Should show unread count for content tab
            expect(screen.getByText('1')).toBeInTheDocument();
        });

        it('should call useNotifications for both categories', () => {
            render(<NotificationsPage />);

            expect(mockUseNotifications).toHaveBeenCalledWith('main');
            expect(mockUseNotifications).toHaveBeenCalledWith('content');
            expect(mockUseNotifications).toHaveBeenCalledTimes(2);
        });
    });

    describe('Tab switching', () => {
        it('should switch to content tab when clicked', () => {
            render(<NotificationsPage />);

            // Initially showing main notifications
            expect(screen.getByText('Trainer feedback')).toBeInTheDocument();

            // Click content tab
            const contentTab = screen.getByText('Контент');
            fireEvent.click(contentTab);

            // Should now show content notifications
            expect(screen.getByText('New feature')).toBeInTheDocument();

            // Should not show main notifications
            expect(screen.queryByText('Trainer feedback')).not.toBeInTheDocument();
        });

        it('should update active tab styling when switching', () => {
            render(<NotificationsPage />);

            const mainTab = screen.getByText('Основные').closest('button');
            const contentTab = screen.getByText('Контент').closest('button');

            // Main tab should be active initially
            expect(mainTab).toHaveClass('text-blue-600');
            expect(contentTab).toHaveClass('text-gray-600');

            // Click content tab
            fireEvent.click(contentTab!);

            // Content tab should now be active
            expect(contentTab).toHaveClass('text-blue-600');
            expect(mainTab).toHaveClass('text-gray-600');
        });

        it('should maintain separate state for each category', () => {
            render(<NotificationsPage />);

            // Main tab shows 2 notifications
            expect(screen.getByText('Trainer feedback')).toBeInTheDocument();
            expect(screen.getByText('Achievement')).toBeInTheDocument();

            // Switch to content tab
            const contentTab = screen.getByText('Контент');
            fireEvent.click(contentTab);

            // Content tab shows 1 notification
            expect(screen.getByText('New feature')).toBeInTheDocument();
            expect(screen.queryByText('Trainer feedback')).not.toBeInTheDocument();

            // Switch back to main tab
            const mainTab = screen.getByText('Основные');
            fireEvent.click(mainTab);

            // Main notifications should still be there
            expect(screen.getByText('Trainer feedback')).toBeInTheDocument();
            expect(screen.getByText('Achievement')).toBeInTheDocument();
        });
    });

    describe('Polling integration', () => {
        it('should start polling on mount', () => {
            render(<NotificationsPage />);

            expect(mockUseNotificationPolling).toHaveBeenCalledWith({
                interval: 30000,
                enabled: true,
            });
        });

        it('should call polling hook only once', () => {
            render(<NotificationsPage />);

            expect(mockUseNotificationPolling).toHaveBeenCalledTimes(1);
        });
    });

    describe('Auto-mark as read integration', () => {
        it('should enable auto-mark for visible notifications', () => {
            render(<NotificationsPage />);

            // Should be called with main notifications initially
            expect(mockUseAutoMarkAsRead).toHaveBeenCalledWith(
                mockMainNotifications,
                'main',
                {
                    delay: 2000,
                    enabled: true,
                }
            );
        });

        it('should update auto-mark when switching tabs', () => {
            render(<NotificationsPage />);

            // Initially called with main notifications
            expect(mockUseAutoMarkAsRead).toHaveBeenCalledWith(
                mockMainNotifications,
                'main',
                expect.any(Object)
            );

            // Switch to content tab
            const contentTab = screen.getByText('Контент');
            fireEvent.click(contentTab);

            // Should now be called with content notifications
            expect(mockUseAutoMarkAsRead).toHaveBeenCalledWith(
                mockContentNotifications,
                'content',
                expect.any(Object)
            );
        });

        it('should use 2-second delay for auto-mark', () => {
            render(<NotificationsPage />);

            const calls = mockUseAutoMarkAsRead.mock.calls;
            const lastCall = calls[calls.length - 1];

            expect(lastCall[2]).toEqual({
                delay: 2000,
                enabled: true,
            });
        });
    });

    describe('Loading states', () => {
        it('should show loading indicator when main notifications are loading', () => {
            mockUseNotifications.mockImplementation((category) => {
                if (category === 'main') {
                    return {
                        ...mockMainNotificationsReturn,
                        notifications: [],
                        isLoading: true,
                    };
                }
                return mockContentNotificationsReturn;
            });

            render(<NotificationsPage />);

            expect(screen.getByRole('status', { name: /loading notifications/i })).toBeInTheDocument();
        });

        it('should show loading indicator when content notifications are loading', () => {
            mockUseNotifications.mockImplementation((category) => {
                if (category === 'content') {
                    return {
                        ...mockContentNotificationsReturn,
                        notifications: [],
                        isLoading: true,
                    };
                }
                return mockMainNotificationsReturn;
            });

            render(<NotificationsPage />);

            // Switch to content tab
            const contentTab = screen.getByText('Контент');
            fireEvent.click(contentTab);

            expect(screen.getByRole('status', { name: /loading notifications/i })).toBeInTheDocument();
        });
    });

    describe('Error states', () => {
        it('should display error message when main notifications fail to load', () => {
            const error = {
                code: 'SERVER_ERROR' as const,
                message: 'Failed to fetch main notifications',
            };

            mockUseNotifications.mockImplementation((category) => {
                if (category === 'main') {
                    return {
                        ...mockMainNotificationsReturn,
                        error,
                    };
                }
                return mockContentNotificationsReturn;
            });

            render(<NotificationsPage />);

            expect(screen.getByRole('alert')).toBeInTheDocument();
            expect(screen.getByText(/ошибка загрузки уведомлений/i)).toBeInTheDocument();
        });

        it('should display error message when content notifications fail to load', () => {
            const error = {
                code: 'SERVER_ERROR' as const,
                message: 'Failed to fetch content notifications',
            };

            mockUseNotifications.mockImplementation((category) => {
                if (category === 'content') {
                    return {
                        ...mockContentNotificationsReturn,
                        error,
                    };
                }
                return mockMainNotificationsReturn;
            });

            render(<NotificationsPage />);

            // Switch to content tab
            const contentTab = screen.getByText('Контент');
            fireEvent.click(contentTab);

            expect(screen.getByRole('alert')).toBeInTheDocument();
            expect(screen.getByText(/ошибка загрузки уведомлений/i)).toBeInTheDocument();
        });
    });

    describe('Empty states', () => {
        it('should show empty state when no main notifications', () => {
            mockUseNotifications.mockImplementation((category) => {
                if (category === 'main') {
                    return {
                        ...mockMainNotificationsReturn,
                        notifications: [],
                        unreadCount: 0,
                    };
                }
                return mockContentNotificationsReturn;
            });

            const { container } = render(<NotificationsPage />);

            const emptyState = container.querySelector('[role="status"][aria-label="No notifications"]');
            expect(emptyState).toBeInTheDocument();
            expect(emptyState).toHaveTextContent(/личных уведомлений/i);
        });

        it('should show empty state when no content notifications', () => {
            mockUseNotifications.mockImplementation((category) => {
                if (category === 'content') {
                    return {
                        ...mockContentNotificationsReturn,
                        notifications: [],
                        unreadCount: 0,
                    };
                }
                return mockMainNotificationsReturn;
            });

            const { container } = render(<NotificationsPage />);

            // Switch to content tab
            const contentTab = screen.getByText('Контент');
            fireEvent.click(contentTab);

            const emptyState = container.querySelector('[role="status"][aria-label="No notifications"]');
            expect(emptyState).toBeInTheDocument();
            expect(emptyState).toHaveTextContent(/уведомлений о контенте/i);
        });
    });

    describe('Notification interactions', () => {
        it('should call markAsRead when notification is clicked', () => {
            const mockMarkAsRead = jest.fn();

            mockUseNotifications.mockImplementation((category) => {
                if (category === 'main') {
                    return {
                        ...mockMainNotificationsReturn,
                        markAsRead: mockMarkAsRead,
                    };
                }
                return mockContentNotificationsReturn;
            });

            render(<NotificationsPage />);

            // Click on first notification
            const notification = screen.getByText('Trainer feedback').closest('[role="button"]');
            fireEvent.click(notification!);

            expect(mockMarkAsRead).toHaveBeenCalledWith('main-1');
        });

        it('should call fetchMore when scrolling to bottom', () => {
            const mockFetchMore = jest.fn();

            mockUseNotifications.mockImplementation((category) => {
                if (category === 'main') {
                    return {
                        ...mockMainNotificationsReturn,
                        hasMore: true,
                        fetchMore: mockFetchMore,
                    };
                }
                return mockContentNotificationsReturn;
            });

            render(<NotificationsPage />);

            // IntersectionObserver should be set up
            expect(mockIntersectionObserver).toHaveBeenCalled();
        });
    });

    describe('Accessibility', () => {
        it('should have proper ARIA attributes for tabpanel', () => {
            const { container } = render(<NotificationsPage />);

            const tabpanel = container.querySelector('[role="tabpanel"]');
            expect(tabpanel).toHaveAttribute('id', 'main-panel');
            expect(tabpanel).toHaveAttribute('aria-labelledby', 'main-tab');
        });

        it('should update tabpanel attributes when switching tabs', () => {
            const { container } = render(<NotificationsPage />);

            // Switch to content tab
            const contentTab = screen.getByText('Контент');
            fireEvent.click(contentTab);

            const tabpanel = container.querySelector('[role="tabpanel"]');
            expect(tabpanel).toHaveAttribute('id', 'content-panel');
            expect(tabpanel).toHaveAttribute('aria-labelledby', 'content-tab');
        });
    });
});
