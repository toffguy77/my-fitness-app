/**
 * Tests for NotificationsLayout Component
 *
 * Validates: Requirements 1.1, 1.4, 6.1, 6.2, 6.3
 */

import { render, screen } from '@testing-library/react';
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
        (useRouter as jest.Mock).mockReturnValue({
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
            expect(backButton).toHaveClass('focus:outline-none', 'focus-visible:ring-2');
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

    describe('Responsive Design (Requirements 6.1, 6.2, 6.3)', () => {
        it('applies fixed height matching dashboard header', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const header = screen.getByRole('banner');

            // Check for fixed height and padding (matching dashboard)
            expect(header).toHaveClass('h-16', 'px-4');
        });

        it('applies responsive font sizes to title', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const title = screen.getByRole('heading', { name: /уведомления/i });

            // Check for responsive font size classes
            expect(title).toHaveClass('text-xl');     // Mobile
            expect(title).toHaveClass('sm:text-2xl'); // Tablet
            expect(title).toHaveClass('lg:text-3xl'); // Desktop
        });

        it('applies responsive padding to main content area', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const main = screen.getByRole('main');

            // Check for responsive padding classes
            expect(main).toHaveClass('px-0');      // Mobile (full width)
            expect(main).toHaveClass('sm:px-4');   // Tablet
            expect(main).toHaveClass('lg:px-8');   // Desktop
            expect(main).toHaveClass('py-4');      // Mobile vertical
            expect(main).toHaveClass('sm:py-6');   // Tablet vertical
            expect(main).toHaveClass('lg:py-8');   // Desktop vertical
        });

        it('applies max-width constraint for optimal reading', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const main = screen.getByRole('main');
            expect(main).toHaveClass('max-w-7xl', 'mx-auto', 'w-full');
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
            expect(settingsButton).toHaveClass('focus:outline-none', 'focus-visible:ring-2');
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
            expect(title).toHaveClass('text-gray-900'); // High contrast text
        });
    });

    describe('Visual Styling', () => {
        it('applies background color to layout', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const layout = screen.getByTestId('notifications-layout');
            expect(layout).toHaveClass('bg-gray-50');
        });

        it('applies white background and border to header', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const header = screen.getByRole('banner');
            expect(header).toHaveClass('bg-white', 'border-b', 'border-gray-200');
        });

        it('applies hover styles to settings button', () => {
            render(<NotificationsLayout>{mockChildren}</NotificationsLayout>);

            const settingsButton = screen.getByRole('button', { name: /notification settings/i });
            expect(settingsButton).toHaveClass('hover:text-gray-900', 'hover:bg-gray-100');
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
