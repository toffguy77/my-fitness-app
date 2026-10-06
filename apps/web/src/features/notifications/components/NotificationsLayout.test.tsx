/**
 * Tests for NotificationsLayout Component
 *
 * Validates: Requirements 1.1, 1.4, 6.1, 6.2, 6.3
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { NotificationsLayout } from './NotificationsLayout';

// Mock Next.js router
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}));

describe('NotificationsLayout', () => {
    const mockChildren = <div data-testid="mock-children">Test Content</div>;
    const mockPush = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useRouter as unknown as jest.Mock).mockReturnValue({
            push: mockPush,
        });
    });

    describe('Rendering', () => {
        it('renders the layout with children', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            expect(screen.getByTestId('notifications-layout')).toBeInTheDocument();
            expect(screen.getByTestId('mock-children')).toBeInTheDocument();
        });

        it('renders the page title "Уведомления"', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            expect(screen.getByRole('heading', { name: /уведомления/i })).toBeInTheDocument();
        });

        it('renders the back button (Requirement 1.1)', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const backButton = screen.getByRole('button', { name: /back to dashboard/i });
            expect(backButton).toBeInTheDocument();
        });

        it('renders the settings icon button (Requirement 1.4)', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            expect(settingsButton).toBeInTheDocument();
        });

        it('applies custom className when provided', () => {
            render(
                <NotificationsLayout className="custom-class">
                    {mockChildren}
                </NotificationsLayout>
            );

            const layout = screen.getByTestId('notifications-layout');
            expect(layout).toHaveClass('custom-class');
        });
    });

    describe('Back Button Interaction', () => {
        it('navigates to dashboard when back button is clicked', async () => {
            const user = userEvent.setup();

            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const backButton = screen.getByRole('button', { name: /back to dashboard/i });
            await user.click(backButton);

            expect(mockPush).toHaveBeenCalledWith('/dashboard');
            expect(mockPush).toHaveBeenCalledTimes(1);
        });

        it('has proper ARIA label for accessibility', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const backButton = screen.getByRole('button', { name: /back to dashboard/i });
            expect(backButton).toHaveAttribute('aria-label', 'Back to dashboard');
        });

        it('has title attribute for tooltip', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const backButton = screen.getByRole('button', { name: /back to dashboard/i });
            expect(backButton).toHaveAttribute('title', 'Вернуться на дашборд');
        });

        it('has focus-visible styles', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const backButton = screen.getByRole('button', { name: /back to dashboard/i });
            expect(backButton).toHaveClass('focus-visible:outline-none', 'focus-visible:ring-2');
        });
    });

    describe('Settings Button Interaction', () => {
        it('handles settings button click', async () => {
            const user = userEvent.setup();

            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });

            // Button should be clickable without errors
            await user.click(settingsButton);

            // Verify button is still in the document after click
            expect(settingsButton).toBeInTheDocument();
        });

        it('has proper ARIA label for accessibility', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            expect(settingsButton).toHaveAttribute('aria-label', 'Notification settings');
        });

        it('has title attribute for tooltip', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            expect(settingsButton).toHaveAttribute('title', 'Настройки уведомлений');
        });
    });

    describe('Layout (Requirements 6.1, 6.2, 6.3)', () => {
        it('keeps header buttons at a 44 px touch target', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const header = screen.getByRole('banner');
            within(header).getAllByRole('button').forEach((button) => {
                expect(button).toHaveClass('h-11', 'w-11');
            });
        });

        it('shows the screen title in serif', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const title = screen.getByRole('heading', { level: 1, name: /уведомления/i });
            expect(title).toHaveClass('type-title-1');
        });

        it('keeps content in the content column', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const main = screen.getByRole('main');
            expect(main).toHaveClass('max-w-content', 'mx-auto', 'w-full');
        });
    });

    describe('Layout Structure', () => {
        it('has sticky header at top', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const header = screen.getByRole('banner');
            expect(header).toHaveClass('sticky', 'top-0', 'z-10');
        });

        it('has proper semantic HTML structure', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            expect(screen.getByRole('banner')).toBeInTheDocument(); // header
            expect(screen.getByRole('main')).toBeInTheDocument();   // main
            expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(); // h1
        });

        it('applies flex layout for full height', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const layout = screen.getByTestId('notifications-layout');
            expect(layout).toHaveClass('flex', 'flex-col', 'min-h-screen');
        });

        it('main content area is flex-1 to fill available space', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const main = screen.getByRole('main');
            expect(main).toHaveClass('flex-1');
        });
    });

    describe('Accessibility', () => {
        it('settings button has focus-visible styles', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            expect(settingsButton).toHaveClass('focus-visible:outline-none', 'focus-visible:ring-2');
        });

        it('settings icon has aria-hidden attribute', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            const icon = settingsButton.querySelector('svg');

            expect(icon).toHaveAttribute('aria-hidden', 'true');
        });

        it('has proper color contrast classes', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const title = screen.getByRole('heading', { name: /уведомления/i });
            expect(title).toHaveClass('text-fg'); // High contrast text
        });
    });

    describe('Visual Styling', () => {
        it('applies background color to layout', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const layout = screen.getByTestId('notifications-layout');
            expect(layout).toHaveClass('bg-canvas');
        });

        it('applies the navigation surface and border to header', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const header = screen.getByRole('banner');
            expect(header).toHaveClass('bg-nav', 'border-b', 'border-line');
        });

        it('applies hover styles to settings button', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            expect(settingsButton).toHaveClass('hover:bg-subtle');
        });

        it('applies transition to settings button', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            expect(settingsButton).toHaveClass('transition-colors');
        });
    });

    describe('Edge Cases', () => {
        it('renders with null children', () => {
            render(<NotificationsLayout>{null}</NotificationsLayout>);

            expect(screen.getByTestId('notifications-layout')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: /уведомления/i })).toBeInTheDocument();
        });

        it('renders with multiple children', () => {
            render(
                <NotificationsLayout>
                    <div data-testid="child-1">Child 1</div>
                    <div data-testid="child-2">Child 2</div>
                    <div data-testid="child-3">Child 3</div>
                </NotificationsLayout>
            );

            expect(screen.getByTestId('child-1')).toBeInTheDocument();
            expect(screen.getByTestId('child-2')).toBeInTheDocument();
            expect(screen.getByTestId('child-3')).toBeInTheDocument();
        });

        it('renders with complex nested children', () => {
            render(
                <NotificationsLayout>
                    <div>
                        <div>
                            <span data-testid="nested-content">Nested Content</span>
                        </div>
                    </div>
                </NotificationsLayout>
            );

            expect(screen.getByTestId('nested-content')).toBeInTheDocument();
        });
    });
});
