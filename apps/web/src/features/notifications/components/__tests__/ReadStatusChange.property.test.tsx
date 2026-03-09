/**
 * Property-based test for visual update on read status change
 * Feature: notifications-page
 * Property 9: Visual Update on Read Status Change
 * Validates: Requirements 3.2
 */

import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { NotificationItem } from '../NotificationItem';
import { unreadNotificationGenerator } from '../../testing/generators';

// Mock next/navigation for useRouter
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

// Mock next/image to avoid hostname configuration issues in tests
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: { src: string; alt: string;[key: string]: unknown }) => {
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        return <img {...props} />;
    },
}));

describe('Property 9: Visual Update on Read Status Change', () => {
    /**
     * For any notification whose read status changes from false to true,
     * the system should immediately update its visual styling to reflect
     * the read state.
     */
    it('Feature: notifications-page, Property 9: Visual Update on Read Status Change', async () => {
        await fc.assert(
            fc.asyncProperty(
                unreadNotificationGenerator(),
                async (notification) => {
                    const user = userEvent.setup();
                    let currentNotification = { ...notification };
                    const mockOnMarkAsRead = jest.fn((id: string) => {
                        // Simulate marking as read by updating the notification
                        currentNotification = {
                            ...currentNotification,
                            readAt: new Date().toISOString(),
                        };
                    });

                    const { container, rerender } = render(
                        <NotificationItem
                            notification={currentNotification}
                            onMarkAsRead={mockOnMarkAsRead}
                        />
                    );

                    // Verify initial unread styling
                    let notificationElement = container.firstChild as HTMLElement;
                    expect(notificationElement).toHaveClass('bg-blue-50');
                    expect(notificationElement).not.toHaveClass('opacity-70');

                    // Click to mark as read - use the specific notification element
                    await user.click(notificationElement);

                    // Verify callback was called
                    expect(mockOnMarkAsRead).toHaveBeenCalledWith(notification.id);

                    // Rerender with updated notification (simulating state update)
                    rerender(
                        <NotificationItem
                            notification={currentNotification}
                            onMarkAsRead={mockOnMarkAsRead}
                        />
                    );

                    // Verify visual styling has updated to read state
                    notificationElement = container.firstChild as HTMLElement;
                    await waitFor(() => {
                        expect(notificationElement).toHaveClass('opacity-70');
                        expect(notificationElement).not.toHaveClass('bg-blue-50');
                    });

                    // Verify title styling changed from semibold to normal
                    const titleElement = notificationElement.querySelector('h3');
                    expect(titleElement).toHaveClass('font-normal');
                    expect(titleElement).not.toHaveClass('font-semibold');

                    // Verify unread indicator is removed
                    const unreadDot = notificationElement.querySelector('[role="presentation"]');
                    expect(unreadDot).not.toBeInTheDocument();
                }
            ),
            { numRuns: 10 }
        );
    });

    /**
     * Verify that the visual update happens immediately without delay
     */
    it('updates styling immediately after read status change', async () => {
        await fc.assert(
            fc.asyncProperty(
                unreadNotificationGenerator(),
                async (notification) => {
                    const user = userEvent.setup();
                    let currentNotification = { ...notification };
                    const mockOnMarkAsRead = jest.fn((id: string) => {
                        currentNotification = {
                            ...currentNotification,
                            readAt: new Date().toISOString(),
                        };
                    });

                    const { container, rerender } = render(
                        <NotificationItem
                            notification={currentNotification}
                            onMarkAsRead={mockOnMarkAsRead}
                        />
                    );

                    // Click to mark as read - use the specific notification element
                    const notificationElement = container.firstChild as HTMLElement;
                    await user.click(notificationElement);

                    // Rerender immediately
                    rerender(
                        <NotificationItem
                            notification={currentNotification}
                            onMarkAsRead={mockOnMarkAsRead}
                        />
                    );

                    // Styling should update immediately (no delay)
                    const updatedElement = container.firstChild as HTMLElement;
                    expect(updatedElement).toHaveClass('opacity-70');
                }
            ),
            { numRuns: 10 }
        );
    });
});
