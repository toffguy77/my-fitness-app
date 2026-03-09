/**
 * Property-based and unit tests for NotificationItem component
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { NotificationItem } from './NotificationItem';
import {
    unreadNotificationGenerator,
    readNotificationGenerator,
} from '../testing/generators';

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

describe('NotificationItem', () => {
    /**
     * Feature: notifications-page
     * Property 6: Read Status Styling
     * Validates: Requirements 2.4, 2.5
     *
     * For any notification, the system should apply distinct visual styling
     * when read status is false (bold, highlighted) and muted styling when
     * read status is true.
     */
    describe('Property 6: Read Status Styling', () => {
        it('applies distinct styling for unread notifications', () => {
            fc.assert(
                fc.property(unreadNotificationGenerator(), (notification) => {
                    const { container } = render(
                        <NotificationItem
                            notification={notification}
                            onMarkAsRead={() => { }}
                        />
                    );

                    // Unread notifications should have blue background
                    const notificationElement = container.firstChild as HTMLElement;
                    expect(notificationElement).toHaveClass('bg-blue-50');

                    // Title should be bold/semibold for unread - use querySelector to avoid text matching issues
                    const titleElement = notificationElement.querySelector('h3');
                    expect(titleElement).toHaveClass('font-semibold');
                    expect(titleElement).toHaveClass('text-gray-900');

                    // Content should have appropriate styling
                    const contentElement = notificationElement.querySelector('p');
                    expect(contentElement).toHaveClass('text-gray-700');

                    // Should have unread indicator dot
                    const unreadDot = notificationElement.querySelector('[role="presentation"]');
                    expect(unreadDot).toBeInTheDocument();

                    // Should have aria-label indicating unread status
                    expect(notificationElement).toHaveAttribute(
                        'aria-label',
                        expect.stringContaining('Unread notification')
                    );
                }),
                { numRuns: 100 }
            );
        });

        it('applies muted styling for read notifications', () => {
            fc.assert(
                fc.property(readNotificationGenerator(), (notification) => {
                    const { container } = render(
                        <NotificationItem
                            notification={notification}
                            onMarkAsRead={() => { }}
                        />
                    );

                    // Read notifications should have reduced opacity
                    const notificationElement = container.firstChild as HTMLElement;
                    expect(notificationElement).toHaveClass('opacity-70');

                    // Title should be normal weight for read - use querySelector to avoid text matching issues
                    const titleElement = notificationElement.querySelector('h3');
                    expect(titleElement).toHaveClass('font-normal');
                    expect(titleElement).toHaveClass('text-gray-700');

                    // Content should have muted styling
                    const contentElement = notificationElement.querySelector('p');
                    expect(contentElement).toHaveClass('text-gray-500');

                    // Should NOT have unread indicator dot
                    const unreadDot = notificationElement.querySelector('[role="presentation"]');
                    expect(unreadDot).not.toBeInTheDocument();

                    // Should have aria-label indicating read status
                    expect(notificationElement).toHaveAttribute(
                        'aria-label',
                        expect.stringContaining('Read notification')
                    );
                }),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Feature: notifications-page
     * Property 5: Preview Text Display
     * Validates: Requirements 2.3
     *
     * For any notification, the system should display preview text
     * that summarizes the notification content.
     */
    describe('Property 5: Preview Text Display', () => {
        it('displays preview text for any notification', () => {
            fc.assert(
                fc.property(
                    fc.oneof(unreadNotificationGenerator(), readNotificationGenerator()),
                    (notification) => {
                        const { container } = render(
                            <NotificationItem
                                notification={notification}
                                onMarkAsRead={() => { }}
                            />
                        );

                        // Find the content paragraph element
                        const contentElement = container.querySelector('p[id^="notification-content-"]');
                        expect(contentElement).toBeInTheDocument();

                        // Content should display the notification content (trimmed)
                        const displayedContent = contentElement?.textContent?.trim() || '';
                        const expectedContent = notification.content.trim();
                        expect(displayedContent).toBe(expectedContent);

                        // Content should be truncated with line-clamp-2
                        expect(contentElement).toHaveClass('line-clamp-2');
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    /**
     * Unit tests for NotificationItem component
     * Validates: Requirements 2.1-2.5, 3.1, 6.4, 6.5
     */
    describe('Unit Tests', () => {
        const mockOnMarkAsRead = jest.fn();

        beforeEach(() => {
            mockOnMarkAsRead.mockClear();
        });

        it('renders unread notification with correct styling', () => {
            const notification = {
                id: '1',
                userId: 'user-1',
                category: 'main' as const,
                type: 'trainer_feedback' as const,
                title: 'New feedback from trainer',
                content: 'Your trainer left feedback on your progress',
                createdAt: new Date().toISOString(),
            };

            const { container } = render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            // Check unread styling
            const notificationElement = container.firstChild as HTMLElement;
            expect(notificationElement).toHaveClass('bg-blue-50');

            // Check title is bold
            const title = screen.getByText('New feedback from trainer');
            expect(title).toHaveClass('font-semibold');

            // Check unread indicator is present
            const unreadDot = container.querySelector('[role="presentation"]');
            expect(unreadDot).toBeInTheDocument();
        });

        it('renders read notification with muted styling', () => {
            const notification = {
                id: '2',
                userId: 'user-1',
                category: 'content' as const,
                type: 'system_update' as const,
                title: 'System maintenance scheduled',
                content: 'We will be performing maintenance tonight',
                createdAt: new Date().toISOString(),
                readAt: new Date().toISOString(),
            };

            const { container } = render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            // Check read styling
            const notificationElement = container.firstChild as HTMLElement;
            expect(notificationElement).toHaveClass('opacity-70');

            // Check title is normal weight
            const title = screen.getByText('System maintenance scheduled');
            expect(title).toHaveClass('font-normal');

            // Check unread indicator is NOT present
            const unreadDot = container.querySelector('[role="presentation"]');
            expect(unreadDot).not.toBeInTheDocument();
        });

        it('calls onMarkAsRead when unread notification is clicked', async () => {
            const user = userEvent.setup();
            const notification = {
                id: '3',
                userId: 'user-1',
                category: 'main' as const,
                type: 'achievement' as const,
                title: 'Achievement unlocked!',
                content: 'You completed your first week',
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const notificationElement = screen.getByRole('button');
            await user.click(notificationElement);

            expect(mockOnMarkAsRead).toHaveBeenCalledWith('3');
            expect(mockOnMarkAsRead).toHaveBeenCalledTimes(1);
        });

        it('does not call onMarkAsRead when read notification is clicked', async () => {
            const user = userEvent.setup();
            const notification = {
                id: '4',
                userId: 'user-1',
                category: 'main' as const,
                type: 'reminder' as const,
                title: 'Time to log your meals',
                content: 'Don\'t forget to track your nutrition',
                createdAt: new Date().toISOString(),
                readAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const notificationElement = screen.getByRole('button');
            await user.click(notificationElement);

            expect(mockOnMarkAsRead).not.toHaveBeenCalled();
        });

        it('supports keyboard interaction with Enter key', async () => {
            const user = userEvent.setup();
            const notification = {
                id: '5',
                userId: 'user-1',
                category: 'main' as const,
                type: 'trainer_feedback' as const,
                title: 'New message',
                content: 'Check your progress report',
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const notificationElement = screen.getByRole('button');
            notificationElement.focus();
            await user.keyboard('{Enter}');

            expect(mockOnMarkAsRead).toHaveBeenCalledWith('5');
        });

        it('supports keyboard interaction with Space key', async () => {
            const user = userEvent.setup();
            const notification = {
                id: '6',
                userId: 'user-1',
                category: 'content' as const,
                type: 'new_feature' as const,
                title: 'New feature available',
                content: 'Try our new meal planning tool',
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const notificationElement = screen.getByRole('button');
            notificationElement.focus();
            await user.keyboard(' ');

            expect(mockOnMarkAsRead).toHaveBeenCalledWith('6');
        });

        it('has correct ARIA attributes for unread notification', () => {
            const notification = {
                id: '7',
                userId: 'user-1',
                category: 'main' as const,
                type: 'achievement' as const,
                title: 'Goal reached',
                content: 'You hit your protein target',
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const notificationElement = screen.getByRole('button');
            expect(notificationElement).toHaveAttribute('tabIndex', '0');
            expect(notificationElement).toHaveAttribute(
                'aria-label',
                expect.stringContaining('Goal reached. Unread notification')
            );
        });

        it('has correct ARIA attributes for read notification', () => {
            const notification = {
                id: '8',
                userId: 'user-1',
                category: 'content' as const,
                type: 'general' as const,
                title: 'Weekly summary',
                content: 'Your weekly nutrition summary is ready',
                createdAt: new Date().toISOString(),
                readAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const notificationElement = screen.getByRole('button');
            expect(notificationElement).toHaveAttribute('tabIndex', '0');
            expect(notificationElement).toHaveAttribute(
                'aria-label',
                expect.stringContaining('Weekly summary. Read notification')
            );
        });

        it('renders trainer_feedback icon correctly', () => {
            const notification = {
                id: '9',
                userId: 'user-1',
                category: 'main' as const,
                type: 'trainer_feedback' as const,
                title: 'Trainer feedback',
                content: 'Great progress this week',
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            // Icon should be rendered (NotificationIcon component)
            const iconContainer = screen.getByRole('button').querySelector('.flex-shrink-0');
            expect(iconContainer).toBeInTheDocument();
        });

        it('renders achievement icon correctly', () => {
            const notification = {
                id: '10',
                userId: 'user-1',
                category: 'main' as const,
                type: 'achievement' as const,
                title: 'Achievement unlocked',
                content: 'First week completed',
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const iconContainer = screen.getByRole('button').querySelector('.flex-shrink-0');
            expect(iconContainer).toBeInTheDocument();
        });

        it('renders custom icon URL when provided', () => {
            const notification = {
                id: '11',
                userId: 'user-1',
                category: 'main' as const,
                type: 'general' as const,
                title: 'Custom notification',
                content: 'With custom icon',
                iconUrl: 'https://example.com/icon.png',
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const img = screen.getByAltText('general notification icon');
            // Next.js Image component transforms and encodes the src URL
            expect(img).toHaveAttribute('src');
            const src = img.getAttribute('src');
            expect(src).toContain('example.com');
            expect(src).toContain('icon.png');
        });

        it('displays relative timestamp correctly', () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const notification = {
                id: '12',
                userId: 'user-1',
                category: 'main' as const,
                type: 'reminder' as const,
                title: 'Reminder',
                content: 'Time to log meals',
                createdAt: twoHoursAgo,
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            const timestamp = screen.getByText(/ago|just now/i);
            expect(timestamp).toBeInTheDocument();
            expect(timestamp.tagName).toBe('TIME');
            expect(timestamp).toHaveAttribute('dateTime', twoHoursAgo);
        });

        it('truncates long content with line-clamp', () => {
            const longContent = 'This is a very long notification content that should be truncated after two lines. '.repeat(10);
            const notification = {
                id: '13',
                userId: 'user-1',
                category: 'content' as const,
                type: 'system_update' as const,
                title: 'Long notification',
                content: longContent,
                createdAt: new Date().toISOString(),
            };

            render(
                <NotificationItem
                    notification={notification}
                    onMarkAsRead={mockOnMarkAsRead}
                />
            );

            // Find the content element by partial text match
            const contentElement = screen.getByText((content, element) => {
                return element?.tagName === 'P' && content.startsWith('This is a very long');
            });
            expect(contentElement).toHaveClass('line-clamp-2');
        });
    });
});

/**
 * Responsive Design Tests
 * Validates: Requirements 6.1, 6.2, 6.3
 */
describe('Responsive Design', () => {
    const notification = {
        id: 'responsive-1',
        userId: 'user-1',
        category: 'main' as const,
        type: 'trainer_feedback' as const,
        title: 'Test notification',
        content: 'Testing responsive design',
        createdAt: new Date().toISOString(),
    };

    it('applies mobile layout styles (< 768px)', () => {
        const { container } = render(
            <NotificationItem
                notification={notification}
                onMarkAsRead={() => { }}
            />
        );

        const notificationElement = container.firstChild as HTMLElement;

        // Mobile: compact padding
        expect(notificationElement).toHaveClass('p-3');

        // Mobile: minimum touch target
        expect(notificationElement).toHaveClass('min-h-[80px]');

        // Title: mobile font size
        const titleElement = notificationElement.querySelector('h3');
        expect(titleElement).toHaveClass('text-sm');

        // Content: mobile font size
        const contentElement = notificationElement.querySelector('p');
        expect(contentElement).toHaveClass('text-xs');

        // Timestamp: mobile font size
        const timeElement = notificationElement.querySelector('time');
        expect(timeElement).toHaveClass('text-xs');

        // Unread dot: mobile size
        const dotElement = notificationElement.querySelector('[role="presentation"] > div');
        expect(dotElement).toHaveClass('h-2');
        expect(dotElement).toHaveClass('w-2');
    });

    it('applies tablet layout styles (768px - 1024px)', () => {
        const { container } = render(
            <NotificationItem
                notification={notification}
                onMarkAsRead={() => { }}
            />
        );

        const notificationElement = container.firstChild as HTMLElement;

        // Tablet: more padding
        expect(notificationElement).toHaveClass('sm:p-4');

        // Tablet: larger touch target
        expect(notificationElement).toHaveClass('sm:min-h-[90px]');

        // Title: tablet font size
        const titleElement = notificationElement.querySelector('h3');
        expect(titleElement).toHaveClass('sm:text-base');

        // Content: tablet font size
        const contentElement = notificationElement.querySelector('p');
        expect(contentElement).toHaveClass('sm:text-sm');

        // Timestamp: tablet font size
        const timeElement = notificationElement.querySelector('time');
        expect(timeElement).toHaveClass('sm:text-xs');

        // Unread dot: tablet size
        const dotElement = notificationElement.querySelector('[role="presentation"] > div');
        expect(dotElement).toHaveClass('sm:h-2.5');
        expect(dotElement).toHaveClass('sm:w-2.5');
    });

    it('applies desktop layout styles (>= 1024px)', () => {
        const { container } = render(
            <NotificationItem
                notification={notification}
                onMarkAsRead={() => { }}
            />
        );

        const notificationElement = container.firstChild as HTMLElement;

        // Desktop: optimal padding
        expect(notificationElement).toHaveClass('md:p-5');

        // Desktop: hover states (unread notifications have blue hover)
        expect(notificationElement).toHaveClass('md:hover:bg-blue-200');

        // Title: desktop font size
        const titleElement = notificationElement.querySelector('h3');
        expect(titleElement).toHaveClass('md:text-base');

        // Content: desktop font size
        const contentElement = notificationElement.querySelector('p');
        expect(contentElement).toHaveClass('md:text-sm');

        // Timestamp: desktop font size (slightly larger)
        const timeElement = notificationElement.querySelector('time');
        expect(timeElement).toHaveClass('md:text-sm');

        // Unread dot: desktop size
        const dotElement = notificationElement.querySelector('[role="presentation"] > div');
        expect(dotElement).toHaveClass('md:h-3');
        expect(dotElement).toHaveClass('md:w-3');
    });
});
