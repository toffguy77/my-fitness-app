/**
 * Property-based and unit tests for NotificationIcon component
 */

import { render, fireEvent, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { NotificationIcon } from './NotificationIcon';
import { typeGenerator } from '../testing/generators';
import type { NotificationType } from '../types';

// Mock Next.js Image component
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: any) => {
        const { fill, ...imgProps } = props;
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        return <img {...imgProps} data-fill={fill ? 'true' : 'false'} />;
    },
}));

describe('NotificationIcon', () => {
    /**
     * Feature: notifications-page
     * Property 4: Notification Type Icon Mapping
     * Validates: Requirements 2.2, 8.1, 8.2, 8.3, 8.4, 8.5
     *
     * For any notification with a valid type, the system should display
     * an appropriate icon corresponding to that type.
     */
    describe('Property 4: Notification Type Icon Mapping', () => {
        it('renders appropriate icon for any notification type', () => {
            fc.assert(
                fc.property(typeGenerator(), (type) => {
                    const { container } = render(
                        <NotificationIcon type={type} />
                    );

                    // Property: Icon container should always be present
                    const iconContainer = container.querySelector('[aria-hidden="true"]');
                    expect(iconContainer).toBeInTheDocument();

                    // Property: Icon should be rendered (SVG element)
                    const icon = container.querySelector('svg');
                    expect(icon).toBeInTheDocument();

                    // Property: Icon should have responsive sizing
                    expect(icon).toHaveClass('h-4', 'w-4'); // Mobile base size
                    expect(icon).toHaveClass('sm:h-5', 'sm:w-5'); // Tablet
                    expect(icon).toHaveClass('md:h-6', 'md:w-6'); // Desktop

                    // Property: Container should have consistent styling with responsive sizing
                    expect(iconContainer).toHaveClass('flex', 'items-center', 'justify-center', 'rounded-full');
                    expect(iconContainer).toHaveClass('h-8', 'w-8'); // Mobile base size
                    expect(iconContainer).toHaveClass('sm:h-10', 'sm:w-10'); // Tablet
                    expect(iconContainer).toHaveClass('md:h-12', 'md:w-12'); // Desktop
                }),
                { numRuns: 100 }
            );
        });

        it('renders custom image when iconUrl is provided', () => {
            fc.assert(
                fc.property(
                    typeGenerator(),
                    fc.webUrl(),
                    (type, iconUrl) => {
                        const { container } = render(
                            <NotificationIcon type={type} iconUrl={iconUrl} />
                        );

                        // Property: Image should be rendered instead of icon
                        const img = container.querySelector('img');
                        expect(img).toBeInTheDocument();
                        expect(img).toHaveAttribute('src', iconUrl);

                        // Property: Image should have alt text
                        expect(img).toHaveAttribute('alt', `${type} notification icon`);

                        // Property: Image should have lazy loading
                        expect(img).toHaveAttribute('loading', 'lazy');

                        // Property: SVG icon should NOT be rendered when custom image is used
                        const icon = container.querySelector('svg');
                        expect(icon).not.toBeInTheDocument();
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('applies custom className when provided', () => {
            fc.assert(
                fc.property(
                    typeGenerator(),
                    fc.constantFrom('custom-class', 'test-class', 'my-icon'),
                    (type, className) => {
                        const { container } = render(
                            <NotificationIcon type={type} className={className} />
                        );

                        // Property: Custom className should be applied
                        const iconContainer = container.querySelector('[aria-hidden="true"]');
                        expect(iconContainer).toHaveClass(className);
                    }
                ),
                { numRuns: 50 }
            );
        });
    });

    /**
     * Unit tests for NotificationIcon component
     * Validates: Requirements 2.2, 8.1-8.5, 9.5
     */
    describe('Unit Tests', () => {
        describe('Type-based icon rendering', () => {
            it('renders MessageSquare icon for trainer_feedback type', () => {
                const { container } = render(
                    <NotificationIcon type="trainer_feedback" />
                );

                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();
                expect(icon).toHaveClass('text-gray-600');
                expect(icon).toHaveClass('h-4', 'w-4', 'sm:h-5', 'sm:w-5', 'md:h-6', 'md:w-6');
            });

            it('renders Trophy icon for achievement type', () => {
                const { container } = render(
                    <NotificationIcon type="achievement" />
                );

                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();
                expect(icon).toHaveClass('text-gray-600');
                expect(icon).toHaveClass('h-4', 'w-4', 'sm:h-5', 'sm:w-5', 'md:h-6', 'md:w-6');
            });

            it('renders Bell icon for reminder type', () => {
                const { container } = render(
                    <NotificationIcon type="reminder" />
                );

                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();
                expect(icon).toHaveClass('text-gray-600');
                expect(icon).toHaveClass('h-4', 'w-4', 'sm:h-5', 'sm:w-5', 'md:h-6', 'md:w-6');
            });

            it('renders Settings icon for system_update type', () => {
                const { container } = render(
                    <NotificationIcon type="system_update" />
                );

                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();
                expect(icon).toHaveClass('text-gray-600');
                expect(icon).toHaveClass('h-4', 'w-4', 'sm:h-5', 'sm:w-5', 'md:h-6', 'md:w-6');
            });

            it('renders Star icon for new_feature type', () => {
                const { container } = render(
                    <NotificationIcon type="new_feature" />
                );

                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();
                expect(icon).toHaveClass('text-gray-600');
                expect(icon).toHaveClass('h-4', 'w-4', 'sm:h-5', 'sm:w-5', 'md:h-6', 'md:w-6');
            });

            it('renders Info icon for general type', () => {
                const { container } = render(
                    <NotificationIcon type="general" />
                );

                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();
                expect(icon).toHaveClass('text-gray-600');
                expect(icon).toHaveClass('h-4', 'w-4', 'sm:h-5', 'sm:w-5', 'md:h-6', 'md:w-6');
            });
        });

        describe('Custom icon URL rendering with lazy loading', () => {
            it('renders custom image when iconUrl is provided', () => {
                const iconUrl = 'https://example.com/custom-icon.png';
                const { container } = render(
                    <NotificationIcon type="general" iconUrl={iconUrl} />
                );

                const img = container.querySelector('img');
                expect(img).toBeInTheDocument();
                expect(img).toHaveAttribute('src', iconUrl);
                expect(img).toHaveAttribute('alt', 'general notification icon');
            });

            it('enables lazy loading for custom images', () => {
                const iconUrl = 'https://example.com/icon.png';
                const { container } = render(
                    <NotificationIcon type="trainer_feedback" iconUrl={iconUrl} />
                );

                const img = container.querySelector('img');
                expect(img).toHaveAttribute('loading', 'lazy');
            });

            it('shows loading placeholder while image loads', () => {
                const iconUrl = 'https://example.com/icon.png';
                const { container } = render(
                    <NotificationIcon type="achievement" iconUrl={iconUrl} />
                );

                // Loading placeholder should be present initially
                const placeholder = container.querySelector('.animate-pulse');
                expect(placeholder).toBeInTheDocument();
            });

            it('hides loading placeholder after image loads', async () => {
                const iconUrl = 'https://example.com/icon.png';
                const { container } = render(
                    <NotificationIcon type="achievement" iconUrl={iconUrl} />
                );

                const img = container.querySelector('img');

                // Simulate image load
                fireEvent.load(img!);

                await waitFor(() => {
                    const placeholder = container.querySelector('.animate-pulse');
                    expect(placeholder).not.toBeInTheDocument();
                });
            });

            it('falls back to icon when image fails to load', async () => {
                const iconUrl = 'https://example.com/broken-icon.png';
                const { container } = render(
                    <NotificationIcon type="trainer_feedback" iconUrl={iconUrl} />
                );

                const img = container.querySelector('img');

                // Simulate image error
                fireEvent.error(img!);

                await waitFor(() => {
                    // Should now show the icon instead
                    const icon = container.querySelector('svg');
                    expect(icon).toBeInTheDocument();
                });
            });

            it('does not render SVG icon when custom image is provided', () => {
                const iconUrl = 'https://example.com/icon.png';
                const { container } = render(
                    <NotificationIcon type="trainer_feedback" iconUrl={iconUrl} />
                );

                const icon = container.querySelector('svg');
                expect(icon).not.toBeInTheDocument();
            });

            it('renders image container with correct styling', () => {
                const iconUrl = 'https://example.com/icon.png';
                const { container } = render(
                    <NotificationIcon type="achievement" iconUrl={iconUrl} />
                );

                const imgContainer = container.querySelector('.relative.rounded-full');
                expect(imgContainer).toBeInTheDocument();
                expect(imgContainer).toHaveClass('overflow-hidden', 'bg-gray-100');
                expect(imgContainer).toHaveClass('h-8', 'w-8', 'sm:h-10', 'sm:w-10', 'md:h-12', 'md:w-12');
            });
        });

        describe('Styling and customization', () => {
            it('applies default styling to icon container', () => {
                const { container } = render(
                    <NotificationIcon type="reminder" />
                );

                const iconContainer = container.querySelector('[aria-hidden="true"]');
                expect(iconContainer).toHaveClass(
                    'flex',
                    'items-center',
                    'justify-center',
                    'rounded-full',
                    'bg-gray-100'
                );
                // Responsive sizing
                expect(iconContainer).toHaveClass('h-8', 'w-8', 'sm:h-10', 'sm:w-10', 'md:h-12', 'md:w-12');
            });

            it('applies custom className to icon container', () => {
                const { container } = render(
                    <NotificationIcon type="general" className="custom-class" />
                );

                const iconContainer = container.querySelector('[aria-hidden="true"]');
                expect(iconContainer).toHaveClass('custom-class');
            });

            it('applies custom className to image container when iconUrl is provided', () => {
                const { container } = render(
                    <NotificationIcon
                        type="general"
                        iconUrl="https://example.com/icon.png"
                        className="custom-image-class"
                    />
                );

                const imgContainer = container.querySelector('.relative.rounded-full');
                expect(imgContainer).toHaveClass('custom-image-class');
            });

            it('merges custom className with default classes', () => {
                const { container } = render(
                    <NotificationIcon type="achievement" className="bg-blue-100" />
                );

                const iconContainer = container.querySelector('[aria-hidden="true"]');
                // Should have both default and custom classes
                expect(iconContainer).toHaveClass('flex', 'bg-blue-100');
                // Responsive sizing
                expect(iconContainer).toHaveClass('h-8', 'w-8', 'sm:h-10', 'sm:w-10', 'md:h-12', 'md:w-12');
            });
        });

        describe('Accessibility', () => {
            it('has aria-hidden attribute on icon container', () => {
                const { container } = render(
                    <NotificationIcon type="trainer_feedback" />
                );

                const iconContainer = container.querySelector('[aria-hidden="true"]');
                expect(iconContainer).toBeInTheDocument();
            });

            it('has descriptive alt text on custom image', () => {
                const { container } = render(
                    <NotificationIcon
                        type="system_update"
                        iconUrl="https://example.com/icon.png"
                    />
                );

                const img = container.querySelector('img');
                expect(img).toHaveAttribute('alt', 'system_update notification icon');
            });
        });

        describe('Edge cases', () => {
            it('handles undefined iconUrl gracefully', () => {
                const { container } = render(
                    <NotificationIcon type="general" iconUrl={undefined} />
                );

                // Should render icon, not image
                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();

                const img = container.querySelector('img');
                expect(img).not.toBeInTheDocument();
            });

            it('handles empty string iconUrl', () => {
                const { container } = render(
                    <NotificationIcon type="general" iconUrl="" />
                );

                // Empty string is falsy, should render icon
                const icon = container.querySelector('svg');
                expect(icon).toBeInTheDocument();
            });

            it('renders consistently for all notification types', () => {
                const types: NotificationType[] = [
                    'trainer_feedback',
                    'achievement',
                    'reminder',
                    'system_update',
                    'new_feature',
                    'general',
                ];

                types.forEach((type) => {
                    const { container } = render(
                        <NotificationIcon type={type} />
                    );

                    const icon = container.querySelector('svg');
                    expect(icon).toBeInTheDocument();

                    const iconContainer = container.querySelector('[aria-hidden="true"]');
                    expect(iconContainer).toHaveClass('rounded-full');
                    // Responsive sizing
                    expect(iconContainer).toHaveClass('h-8', 'w-8', 'sm:h-10', 'sm:w-10', 'md:h-12', 'md:w-12');
                });
            });
        });
    });
});
