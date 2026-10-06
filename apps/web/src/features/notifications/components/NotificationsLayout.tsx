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
import { IconButton } from '@/shared/components/ui/Button';

import { t } from '@/shared/i18n'
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
        router.push('/settings/notifications');
    };

    return (
        <div
            className={cn(
                'flex flex-col min-h-screen bg-canvas',
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
                    'rounded-full bg-fg px-4 py-2 text-fg-inverse',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2'
                )}
            >
                Skip to main content
            </a>

            {/* Page Header (Requirement 1.1, 1.4) */}
            <header
                className="sticky top-0 z-10 border-b border-line bg-nav backdrop-blur"
                role="banner"
            >
                <div className="mx-auto flex h-16 w-full max-w-content items-center gap-1 px-2 sm:px-screen-x">
                    {/* Back Button */}
                    <IconButton
                        variant="ghost"
                        onClick={handleBackClick}
                        aria-label="Back to dashboard"
                        title={t('notifications.backToDashboard')}
                    >
                        <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>

                    {/* Page Title — заголовок экрана засечками */}
                    <h1 className="min-w-0 flex-1 truncate type-title-1 text-fg">
                        {t('notifications.title')}
                    </h1>

                    {/* Right: Settings Icon Button (Requirement 1.4) */}
                    <IconButton
                        variant="ghost"
                        onClick={handleSettingsClick}
                        aria-label="Notification settings"
                        title={t('notifications.settingsTitle')}
                    >
                        <Settings className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>
            </header>

            {/* Main Content Area — колонка контента; на телефоне строки списка во всю ширину */}
            <main
                id="main-content"
                className="mx-auto w-full max-w-content flex-1 py-5 sm:px-screen-x"
                role="main"
            >
                {children}
            </main>
        </div>
    );
}
