/**
 * Property-based tests for NotificationList component
 * Uses fast-check for property-based testing
 */

import fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import { NotificationList } from '../NotificationList';
import { categoryGenerator } from '../../testing/generators';

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null,
});
window.IntersectionObserver = mockIntersectionObserver as any;

describe('NotificationList - Property Tests', () => {
    /**
     * Property 18: Empty State Display
     *
     * For any notification category with zero notifications,
     * the system should display an empty state message with an appropriate icon.
     *
     * Validates: Requirements 7.1
     */
    it('Feature: notifications-page, Property 18: Empty State Display', () => {
        fc.assert(
            fc.property(
                categoryGenerator(),
                (category) => {
                    // Render with empty notifications array
                    const { container, unmount } = render(
                        <NotificationList
                            category={category}
                            notifications={[]}
                            isLoading={false}
                            error={null}
                            onLoadMore={() => { }}
                            hasMore={false}
                            onMarkAsRead={() => { }}
                        />
                    );

                    try {
                        // Verify empty state is displayed
                        const emptyStateElement = container.querySelector('[role="status"][aria-label="No notifications"]');
                        expect(emptyStateElement).toBeInTheDocument();

                        // Verify empty state message is present
                        const emptyMessage = container.querySelector('h3');
                        expect(emptyMessage).toHaveTextContent(/нет уведомлений/i);

                        // Verify appropriate icon is present (Inbox icon)
                        const icon = container.querySelector('svg');
                        expect(icon).toBeInTheDocument();

                        // Verify category-specific message
                        const description = container.querySelector('p');
                        if (category === 'main') {
                            expect(description).toHaveTextContent(/личных уведомлений/i);
                        } else {
                            expect(description).toHaveTextContent(/уведомлений о контенте/i);
                        }

                        // Verify no notification items are rendered
                        const notificationItems = container.querySelectorAll('[role="button"]');
                        expect(notificationItems.length).toBe(0);
                    } finally {
                        // Clean up after each iteration
                        unmount();
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Property 13: Infinite Scroll Loading
     *
     * For any notification list with more than 50 total notifications,
     * when the user scrolls to the bottom, the system should load the next batch of up to 50 notifications.
     *
     * Validates: Requirements 4.3
     */
    it('Feature: notifications-page, Property 13: Infinite Scroll Loading', () => {
        fc.assert(
            fc.property(
                categoryGenerator(),
                fc.boolean(),
                fc.boolean(),
                (category, hasMore, isLoading) => {
                    const mockOnLoadMore = jest.fn();

                    // Create a mock IntersectionObserver that triggers immediately
                    let observerCallback: IntersectionObserverCallback | null = null;
                    const mockObserver = jest.fn((callback: IntersectionObserverCallback) => {
                        observerCallback = callback;
                        return {
                            observe: jest.fn(),
                            unobserve: jest.fn(),
                            disconnect: jest.fn(),
                        };
                    });
                    window.IntersectionObserver = mockObserver as any;

                    const { unmount } = render(
                        <NotificationList
                            category={category}
                            notifications={[]}
                            isLoading={isLoading}
                            error={null}
                            onLoadMore={mockOnLoadMore}
                            hasMore={hasMore}
                            onMarkAsRead={() => { }}
                        />
                    );

                    try {
                        // Verify IntersectionObserver was created
                        expect(mockObserver).toHaveBeenCalled();

                        // Simulate intersection (scrolling to bottom)
                        const callback = observerCallback as IntersectionObserverCallback | null;
                        if (callback && hasMore && !isLoading) {
                            const mockEntry = {
                                isIntersecting: true,
                                target: document.createElement('div'),
                            } as unknown as IntersectionObserverEntry;

                            callback([mockEntry], {} as IntersectionObserver);

                            // Verify onLoadMore was called when hasMore is true and not loading
                            expect(mockOnLoadMore).toHaveBeenCalled();
                        } else if (callback && (!hasMore || isLoading)) {
                            const mockEntry = {
                                isIntersecting: true,
                                target: document.createElement('div'),
                            } as unknown as IntersectionObserverEntry;

                            callback([mockEntry], {} as IntersectionObserver);

                            // Verify onLoadMore was NOT called when hasMore is false or isLoading is true
                            expect(mockOnLoadMore).not.toHaveBeenCalled();
                        }
                    } finally {
                        unmount();
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
