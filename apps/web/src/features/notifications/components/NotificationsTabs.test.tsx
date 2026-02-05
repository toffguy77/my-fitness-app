/**
 * Property-based and unit tests for NotificationsTabs component
 */

import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { NotificationsTabs } from './NotificationsTabs';
import type { NotificationCategory } from '../types';

// Ensure cleanup after each test
afterEach(() => {
    cleanup();
});

describe('NotificationsTabs', () => {
    /**
     * Feature: notifications-page
     * Property 1: Tab Switching Displays Correct Notifications
     * Validates: Requirements 1.2
     *
     * For any notification category (main or content), when a user switches
     * to that category's tab, the system should display only notifications
     * belonging to that category.
     */
    describe('Property 1: Tab Switching Displays Correct Notifications', () => {
        it('calls onTabChange with correct category when tab is clicked', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    fc.record({
                        main: fc.nat(100),
                        content: fc.nat(100),
                    }),
                    (initialTab, unreadCounts) => {
                        const onTabChange = jest.fn();

                        const { unmount } = render(
                            <NotificationsTabs
                                activeTab={initialTab}
                                onTabChange={onTabChange}
                                unreadCounts={unreadCounts}
                            />
                        );

                        // Determine which tab to click (the opposite of the active one)
                        const targetTab: NotificationCategory = initialTab === 'main' ? 'content' : 'main';

                        // Get tabs by aria-controls attribute to avoid ambiguity
                        const tabs = screen.getAllByRole('tab');
                        const tabButton = tabs.find(tab =>
                            tab.getAttribute('aria-controls') === `${targetTab}-panel`
                        );

                        if (tabButton) {
                            // Use native click for synchronous execution in property tests
                            tabButton.click();

                            // Verify onTabChange was called with the correct category
                            expect(onTabChange).toHaveBeenCalledWith(targetTab);
                            expect(onTabChange).toHaveBeenCalledTimes(1);
                        }

                        // Clean up
                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('updates aria-selected attribute when tab changes', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    fc.record({
                        main: fc.nat(100),
                        content: fc.nat(100),
                    }),
                    (activeTab, unreadCounts) => {
                        const { unmount } = render(
                            <NotificationsTabs
                                activeTab={activeTab}
                                onTabChange={() => { }}
                                unreadCounts={unreadCounts}
                            />
                        );

                        // Get both tabs by aria-controls attribute
                        const tabs = screen.getAllByRole('tab');
                        const mainTab = tabs.find(tab => tab.getAttribute('aria-controls') === 'main-panel');
                        const contentTab = tabs.find(tab => tab.getAttribute('aria-controls') === 'content-panel');

                        // Verify aria-selected is set correctly based on activeTab
                        if (activeTab === 'main') {
                            expect(mainTab).toHaveAttribute('aria-selected', 'true');
                            expect(contentTab).toHaveAttribute('aria-selected', 'false');
                        } else {
                            expect(mainTab).toHaveAttribute('aria-selected', 'false');
                            expect(contentTab).toHaveAttribute('aria-selected', 'true');
                        }

                        // Clean up
                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Feature: notifications-page
     * Property 2: Unread Badge Visibility
     * Validates: Requirements 1.3
     *
     * For any notification category, when that category contains one or more
     * unread notifications, the system should display a badge with the unread
     * count on the corresponding tab.
     */
    describe('Property 2: Unread Badge Visibility', () => {
        it('displays badge when unread count > 0', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    fc.record({
                        main: fc.integer({ min: 1, max: 999 }),
                        content: fc.integer({ min: 1, max: 999 }),
                    }),
                    (activeTab, unreadCounts) => {
                        const { unmount } = render(
                            <NotificationsTabs
                                activeTab={activeTab}
                                onTabChange={() => { }}
                                unreadCounts={unreadCounts}
                            />
                        );

                        // Both tabs should have badges since both have unread > 0
                        const badges = screen.getAllByLabelText(/unread notifications/);
                        expect(badges.length).toBe(2);

                        // Verify badge counts
                        const mainBadge = badges.find(badge =>
                            badge.getAttribute('aria-label') === `${unreadCounts.main} unread notifications`
                        );
                        const contentBadge = badges.find(badge =>
                            badge.getAttribute('aria-label') === `${unreadCounts.content} unread notifications`
                        );

                        expect(mainBadge).toBeDefined();
                        expect(contentBadge).toBeDefined();

                        // Clean up
                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('hides badge when unread count is 0', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    (activeTab, zeroCategory) => {
                        const unreadCounts = {
                            main: zeroCategory === 'main' ? 0 : 5,
                            content: zeroCategory === 'content' ? 0 : 8,
                        };

                        const { unmount } = render(
                            <NotificationsTabs
                                activeTab={activeTab}
                                onTabChange={() => { }}
                                unreadCounts={unreadCounts}
                            />
                        );

                        // Check that the category with 0 unread has no badge
                        const zeroBadgeQuery = screen.queryByLabelText('0 unread notifications');
                        expect(zeroBadgeQuery).not.toBeInTheDocument();

                        // Check that the category with > 0 unread has a badge
                        const nonZeroCount = zeroCategory === 'main' ? unreadCounts.content : unreadCounts.main;
                        const badges = screen.queryAllByLabelText(/unread notifications/);

                        // Should have exactly 1 badge (for the non-zero category)
                        expect(badges.length).toBe(1);
                        expect(badges[0]).toHaveTextContent(nonZeroCount.toString());

                        // Clean up
                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('displays correct badge styling for active vs inactive tabs', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    fc.record({
                        main: fc.integer({ min: 1, max: 999 }),
                        content: fc.integer({ min: 1, max: 999 }),
                    }),
                    (activeTab, unreadCounts) => {
                        const { unmount } = render(
                            <NotificationsTabs
                                activeTab={activeTab}
                                onTabChange={() => { }}
                                unreadCounts={unreadCounts}
                            />
                        );

                        // Get tabs by aria-controls
                        const tabs = screen.getAllByRole('tab');
                        const activeTabElement = tabs.find(tab =>
                            tab.getAttribute('aria-controls') === `${activeTab}-panel`
                        );
                        const inactiveTab: NotificationCategory = activeTab === 'main' ? 'content' : 'main';
                        const inactiveTabElement = tabs.find(tab =>
                            tab.getAttribute('aria-controls') === `${inactiveTab}-panel`
                        );

                        // Get badges
                        const activeBadge = activeTabElement?.querySelector('[aria-label*="unread notifications"]');
                        const inactiveBadge = inactiveTabElement?.querySelector('[aria-label*="unread notifications"]');

                        // Active tab badge should have blue background
                        expect(activeBadge).toHaveClass('bg-blue-600');
                        expect(activeBadge).toHaveClass('text-white');

                        // Inactive tab badge should have gray background
                        expect(inactiveBadge).toHaveClass('bg-gray-200');
                        expect(inactiveBadge).toHaveClass('text-gray-700');

                        // Clean up
                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Feature: notifications-page
     * Property 10: Badge Removal When All Read
     * Validates: Requirements 3.3
     *
     * For any notification category, when all notifications in that category
     * are marked as read, the system should remove the unread badge from the
     * corresponding tab.
     */
    describe('Property 10: Badge Removal When All Read', () => {
        it('removes badge when unread count transitions from > 0 to 0', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    fc.integer({ min: 1, max: 100 }),
                    (category, initialCount) => {
                        const mockOnTabChange = jest.fn();

                        // Initial state: category has unread notifications
                        const initialUnreadCounts = {
                            main: category === 'main' ? initialCount : 0,
                            content: category === 'content' ? initialCount : 0,
                        };

                        const { rerender, unmount } = render(
                            <NotificationsTabs
                                activeTab={category}
                                onTabChange={mockOnTabChange}
                                unreadCounts={initialUnreadCounts}
                            />
                        );

                        // Verify badge is present initially
                        const initialBadge = screen.queryByLabelText(`${initialCount} unread notifications`);
                        expect(initialBadge).toBeInTheDocument();

                        // Update state: all notifications marked as read
                        const updatedUnreadCounts = {
                            main: 0,
                            content: 0,
                        };

                        rerender(
                            <NotificationsTabs
                                activeTab={category}
                                onTabChange={mockOnTabChange}
                                unreadCounts={updatedUnreadCounts}
                            />
                        );

                        // Verify badge is removed
                        const updatedBadge = screen.queryByLabelText(/unread notifications/);
                        expect(updatedBadge).not.toBeInTheDocument();

                        // Clean up
                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('removes badge only from the category that was marked as read', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('main' as NotificationCategory, 'content' as NotificationCategory),
                    fc.integer({ min: 1, max: 100 }),
                    fc.integer({ min: 1, max: 100 }),
                    (categoryToMarkRead, count1, count2) => {
                        const mockOnTabChange = jest.fn();
                        const otherCategory: NotificationCategory = categoryToMarkRead === 'main' ? 'content' : 'main';

                        // Initial state: both categories have unread notifications
                        const initialUnreadCounts = {
                            main: categoryToMarkRead === 'main' ? count1 : count2,
                            content: categoryToMarkRead === 'content' ? count1 : count2,
                        };

                        const { rerender, unmount } = render(
                            <NotificationsTabs
                                activeTab={categoryToMarkRead}
                                onTabChange={mockOnTabChange}
                                unreadCounts={initialUnreadCounts}
                            />
                        );

                        // Verify both badges are present initially
                        const badges = screen.queryAllByLabelText(/unread notifications/);
                        expect(badges.length).toBe(2);

                        // Update state: mark one category as read
                        const updatedUnreadCounts = {
                            main: categoryToMarkRead === 'main' ? 0 : count2,
                            content: categoryToMarkRead === 'content' ? 0 : count2,
                        };

                        rerender(
                            <NotificationsTabs
                                activeTab={categoryToMarkRead}
                                onTabChange={mockOnTabChange}
                                unreadCounts={updatedUnreadCounts}
                            />
                        );

                        // Verify only one badge remains (for the other category)
                        const remainingBadges = screen.queryAllByLabelText(/unread notifications/);
                        expect(remainingBadges.length).toBe(1);

                        // Verify the remaining badge is for the other category
                        const otherCategoryCount = otherCategory === 'main' ? count2 : count2;
                        expect(screen.getByLabelText(`${otherCategoryCount} unread notifications`)).toBeInTheDocument();

                        // Clean up
                        unmount();
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Unit tests for NotificationsTabs component
     * Validates: Requirements 1.1, 1.2, 1.3, 6.4, 6.5
     */
    describe('Unit Tests', () => {
        const mockOnTabChange = jest.fn();

        beforeEach(() => {
            mockOnTabChange.mockClear();
        });

        it('renders two tabs with correct labels', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            expect(screen.getByRole('tab', { name: 'Основные' })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'Контент' })).toBeInTheDocument();
        });

        it('displays badge when unread count > 0', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 5, content: 12 }}
                />
            );

            expect(screen.getByLabelText('5 unread notifications')).toBeInTheDocument();
            expect(screen.getByLabelText('12 unread notifications')).toBeInTheDocument();
        });

        it('hides badge when unread count is 0', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            expect(screen.queryByLabelText(/unread notifications/)).not.toBeInTheDocument();
        });

        it('calls onTabChange when tab is clicked', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            // Get the content tab by aria-controls to ensure we get the right one
            const tabs = screen.getAllByRole('tab');
            const contentTab = tabs.find(tab => tab.getAttribute('aria-controls') === 'content-panel');

            if (contentTab) {
                contentTab.click();
                expect(mockOnTabChange).toHaveBeenCalledWith('content');
                expect(mockOnTabChange).toHaveBeenCalledTimes(1);
            } else {
                throw new Error('Content tab not found');
            }
        });

        it('supports keyboard navigation with ArrowRight', async () => {
            const user = userEvent.setup();

            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const mainTab = screen.getByRole('tab', { name: 'Основные' });
            mainTab.focus();
            await user.keyboard('{ArrowRight}');

            expect(mockOnTabChange).toHaveBeenCalledWith('content');
        });

        it('supports keyboard navigation with ArrowLeft', async () => {
            const user = userEvent.setup();

            render(
                <NotificationsTabs
                    activeTab="content"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const contentTab = screen.getByRole('tab', { name: 'Контент' });
            contentTab.focus();
            await user.keyboard('{ArrowLeft}');

            expect(mockOnTabChange).toHaveBeenCalledWith('main');
        });

        it('wraps around when pressing ArrowRight on last tab', async () => {
            const user = userEvent.setup();

            render(
                <NotificationsTabs
                    activeTab="content"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const contentTab = screen.getByRole('tab', { name: 'Контент' });
            contentTab.focus();
            await user.keyboard('{ArrowRight}');

            expect(mockOnTabChange).toHaveBeenCalledWith('main');
        });

        it('wraps around when pressing ArrowLeft on first tab', async () => {
            const user = userEvent.setup();

            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const mainTab = screen.getByRole('tab', { name: 'Основные' });
            mainTab.focus();
            await user.keyboard('{ArrowLeft}');

            expect(mockOnTabChange).toHaveBeenCalledWith('content');
        });

        it('supports Home key to jump to first tab', async () => {
            const user = userEvent.setup();

            render(
                <NotificationsTabs
                    activeTab="content"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const contentTab = screen.getByRole('tab', { name: 'Контент' });
            contentTab.focus();
            await user.keyboard('{Home}');

            expect(mockOnTabChange).toHaveBeenCalledWith('main');
        });

        it('supports End key to jump to last tab', async () => {
            const user = userEvent.setup();

            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const mainTab = screen.getByRole('tab', { name: 'Основные' });
            mainTab.focus();
            await user.keyboard('{End}');

            expect(mockOnTabChange).toHaveBeenCalledWith('content');
        });

        it('has correct ARIA attributes', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 5, content: 0 }}
                />
            );

            const tablist = screen.getByRole('tablist');
            expect(tablist).toHaveAttribute('aria-label', 'Notification categories');

            const mainTab = screen.getByRole('tab', { name: /Основные/ });
            const contentTab = screen.getByRole('tab', { name: 'Контент' });

            expect(mainTab).toHaveAttribute('aria-selected', 'true');
            expect(mainTab).toHaveAttribute('aria-controls', 'main-panel');
            expect(mainTab).toHaveAttribute('tabIndex', '0');

            expect(contentTab).toHaveAttribute('aria-selected', 'false');
            expect(contentTab).toHaveAttribute('aria-controls', 'content-panel');
            expect(contentTab).toHaveAttribute('tabIndex', '-1');
        });

        it('applies active styling to selected tab', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const mainTab = screen.getByRole('tab', { name: 'Основные' });
            const contentTab = screen.getByRole('tab', { name: 'Контент' });

            expect(mainTab).toHaveClass('text-blue-600');
            expect(mainTab).toHaveClass('border-blue-600');

            expect(contentTab).toHaveClass('text-gray-600');
            expect(contentTab).toHaveClass('border-transparent');
        });

        it('applies different badge styling for active vs inactive tabs', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 5, content: 8 }}
                />
            );

            const mainTab = screen.getByRole('tab', { name: /Основные/ });
            const contentTab = screen.getByRole('tab', { name: /Контент/ });

            const mainBadge = mainTab.querySelector('[aria-label*="unread notifications"]');
            const contentBadge = contentTab.querySelector('[aria-label*="unread notifications"]');

            // Active tab (main) should have blue badge
            expect(mainBadge).toHaveClass('bg-blue-600');
            expect(mainBadge).toHaveClass('text-white');

            // Inactive tab (content) should have gray badge
            expect(contentBadge).toHaveClass('bg-gray-200');
            expect(contentBadge).toHaveClass('text-gray-700');
        });

        it('has visible focus indicators', () => {
            render(
                <NotificationsTabs
                    activeTab="main"
                    onTabChange={mockOnTabChange}
                    unreadCounts={{ main: 0, content: 0 }}
                />
            );

            const mainTab = screen.getByRole('tab', { name: 'Основные' });
            expect(mainTab).toHaveClass('focus-visible:ring-2');
            expect(mainTab).toHaveClass('focus-visible:ring-blue-500');
        });
    });
});

/**
 * Responsive Design Tests
 * Validates: Requirements 6.1, 6.2, 6.3
 */
describe('Responsive Design', () => {
    const defaultProps = {
        activeTab: 'main' as const,
        onTabChange: jest.fn(),
        unreadCounts: { main: 5, content: 3 },
    };

    it('applies mobile layout styles (< 768px)', () => {
        const { container } = render(
            <NotificationsTabs {...defaultProps} />
        );

        const tabs = container.querySelectorAll('button[role="tab"]');
        const firstTab = tabs[0] as HTMLElement;

        // Mobile: compact padding and font size
        expect(firstTab).toHaveClass('px-4');
        expect(firstTab).toHaveClass('py-3');
        expect(firstTab).toHaveClass('text-sm');

        // Mobile: minimum touch target
        expect(firstTab).toHaveClass('min-h-[44px]');

        // Badge: mobile sizing
        const badge = firstTab.querySelector('span[role="status"]');
        expect(badge).toHaveClass('min-w-[20px]');
        expect(badge).toHaveClass('h-5');
        expect(badge).toHaveClass('px-1.5');
        expect(badge).toHaveClass('text-xs');

        // Container: mobile responsive
        const tablist = container.querySelector('[role="tablist"]');
        expect(tablist).toHaveClass('overflow-x-auto');
    });

    it('applies tablet layout styles (768px - 1024px)', () => {
        const { container } = render(
            <NotificationsTabs {...defaultProps} />
        );

        const tabs = container.querySelectorAll('button[role="tab"]');
        const firstTab = tabs[0] as HTMLElement;

        // Tablet: more spacing
        expect(firstTab).toHaveClass('sm:px-6');
        expect(firstTab).toHaveClass('sm:py-3.5');

        // Badge: tablet sizing
        const badge = firstTab.querySelector('span[role="status"]');
        expect(badge).toHaveClass('sm:min-w-[22px]');
        expect(badge).toHaveClass('sm:h-5.5');
        expect(badge).toHaveClass('sm:px-2');

        // Container: no overflow on tablet
        const tablist = container.querySelector('[role="tablist"]');
        expect(tablist).toHaveClass('sm:overflow-x-visible');
    });

    it('applies desktop layout styles (>= 1024px)', () => {
        const { container } = render(
            <NotificationsTabs {...defaultProps} />
        );

        const tabs = container.querySelectorAll('button[role="tab"]');
        const firstTab = tabs[0] as HTMLElement;

        // Desktop: optimal spacing and font size
        expect(firstTab).toHaveClass('md:px-8');
        expect(firstTab).toHaveClass('md:py-4');
        expect(firstTab).toHaveClass('md:text-base');

        // Desktop: hover states
        expect(firstTab).toHaveClass('md:hover:text-gray-700');

        // Badge: desktop sizing
        const badge = firstTab.querySelector('span[role="status"]');
        expect(badge).toHaveClass('md:min-w-[24px]');
        expect(badge).toHaveClass('md:h-6');
        expect(badge).toHaveClass('md:px-2.5');
        expect(badge).toHaveClass('md:text-sm');
    });

    it('applies responsive styles to both tabs', () => {
        const { container } = render(
            <NotificationsTabs {...defaultProps} />
        );

        const tabs = container.querySelectorAll('button[role="tab"]');

        // Both tabs should have responsive classes
        tabs.forEach(tab => {
            expect(tab).toHaveClass('px-4');
            expect(tab).toHaveClass('sm:px-6');
            expect(tab).toHaveClass('md:px-8');
        });
    });

    it('maintains touch-friendly targets on mobile', () => {
        const { container } = render(
            <NotificationsTabs {...defaultProps} />
        );

        const tabs = container.querySelectorAll('button[role="tab"]');

        // All tabs should have minimum touch target height
        tabs.forEach(tab => {
            expect(tab).toHaveClass('min-h-[44px]');
        });
    });
});
