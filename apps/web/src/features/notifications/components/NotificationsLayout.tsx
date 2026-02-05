/**
 * NotificationsLayout Component
 *
 * Layout wrapper for the notifications page with header and responsive design.
 * Provides consistent structure with page title, back navigation, and settings icon.
 */

'use client'

import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface NotificationsLayoutProps {
    /** Child components to render in the layout */
    children: React.ReactNode;
    /** Optional className for custom styling */
    className?: string;
}

/**
 * NotificationsLayout component provides the page structure for notifications
 *
 * Features:
 * - Page header with back button and title "Уведомления"
 * - Back navigation to dashboard
 * - Settings icon button (placeholder for future functionality)
 * - Responsive layout (mobile/tablet/desktop)
 * - Uses design tokens for spacing and colors
 *
 * Requirements: 1.1, 1.4, 6.1, 6.2, 6.3
 *
 * @example
 * <NotificationsLayout>
 *   <NotificationsTabs ... />
 *   <NotificationList ... />
 * </NotificationsLayout>
 */
export function NotificationsLayout({
    children,
    className,
}: NotificationsLayoutProps) {
    const router = useRouter();

    const handleBackClick = () => {
        // Navigate back to dashboard
        router.push('/dashboard');
    };

    const handleSettingsClick = () => {
        // TODO: Implement notification settings functionality
        // This will open a modal or navigate to settings page
    };

    return (
        <div
            className={cn(
                'flex flex-col min-h-screen bg-gray-50',
                className
            )}
            data-testid="notifications-layout"
        >
            {/* Skip link for keyboard navigation (Requirement 6.4, 6.7) */}
            <a
                href="#main-content"
                className={cn(
                    'sr-only focus:not-sr-only',
                    'focus:absolute focus:top-4 focus:left-4 focus:z-50',
                    'bg-blue-600 text-white px-4 py-2 rounded-lg',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                )}
            >
                Skip to main content
            </a>

            {/* Page Header (Requirement 1.1, 1.4) */}
            <header
                className={cn(
                    'bg-white border-b border-gray-200',
                    'sticky top-0 z-10',
                    // Fixed height matching dashboard header (h-16 = 64px)
                    'h-16 px-4',
                    'flex items-center'
                )}
                role="banner"
            >
                <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
                    {/* Left: Back Button + Page Title */}
                    <div className="flex items-center gap-3">
                        {/* Back Button */}
                        <button
                            onClick={handleBackClick}
                            className={cn(
                                'p-2 rounded-lg transition-colors',
                                'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                                // Enhanced focus-visible styles (Requirement 6.4, 6.7)
                                'focus:outline-none',
                                'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                                'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_#3b82f6]',
                                // Touch-friendly sizing on mobile (Requirement 6.1, 6.2)
                                'sm:p-2.5',
                                // Minimum touch target size (Requirement 6.4)
                                'min-h-[44px] min-w-[44px] flex items-center justify-center'
                            )}
                            aria-label="Back to dashboard"
                            title="Вернуться на дашборд"
                            type="button"
                        >
                            <ArrowLeft
                                className={cn(
                                    'w-5 h-5',      // Mobile: 20px
                                    'sm:w-6 sm:h-6' // Tablet/Desktop: 24px
                                )}
                                aria-hidden="true"
                            />
                        </button>

                        {/* Page Title */}
                        <h1
                            className={cn(
                                'font-semibold text-gray-900',
                                // Responsive font sizes (Requirement 6.1, 6.2, 6.3)
                                'text-xl',      // Mobile: 20px
                                'sm:text-2xl',  // Tablet: 24px
                                'lg:text-3xl'   // Desktop: 30px
                            )}
                        >
                            Уведомления
                        </h1>
                    </div>

                    {/* Right: Settings Icon Button (Requirement 1.4) */}
                    <button
                        onClick={handleSettingsClick}
                        className={cn(
                            'p-2 rounded-lg transition-colors',
                            'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                            // Enhanced focus-visible styles (Requirement 6.4, 6.7)
                            'focus:outline-none',
                            'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                            'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_#3b82f6]',
                            // Touch-friendly sizing on mobile (Requirement 6.1, 6.2)
                            'sm:p-2.5',
                            // Minimum touch target size (Requirement 6.4)
                            'min-h-[44px] min-w-[44px] flex items-center justify-center'
                        )}
                        aria-label="Notification settings"
                        title="Настройки уведомлений"
                        type="button"
                    >
                        <Settings
                            className={cn(
                                'w-5 h-5',      // Mobile: 20px
                                'sm:w-6 sm:h-6' // Tablet/Desktop: 24px
                            )}
                            aria-hidden="true"
                        />
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main
                id="main-content"
                className={cn(
                    'flex-1',
                    // Responsive container (Requirement 6.1, 6.2, 6.3)
                    'max-w-7xl mx-auto w-full',
                    // Responsive padding
                    'px-0',         // Mobile: no horizontal padding (full width)
                    'sm:px-4',      // Tablet: 16px padding
                    'lg:px-8',      // Desktop: 32px padding
                    // Vertical spacing
                    'py-4',         // Mobile: 16px
                    'sm:py-6',      // Tablet: 24px
                    'lg:py-8'       // Desktop: 32px
                )}
                role="main"
            >
                {children}
            </main>
        </div>
    );
}
