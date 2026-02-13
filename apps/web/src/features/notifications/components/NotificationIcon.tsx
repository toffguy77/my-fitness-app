/**
 * NotificationIcon Component
 *
 * Displays an icon for a notification based on its type.
 * Supports both Lucide icons (based on type) and custom image URLs.
 * Implements lazy loading and caching for custom images.
 */

'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { NotificationType } from '../types';
import {
    MessageSquare,
    Trophy,
    Bell,
    Settings,
    Star,
    Info,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface NotificationIconProps {
    /** Notification type to determine which icon to display */
    type: NotificationType;
    /** Optional custom image URL to display instead of the type-based icon */
    iconUrl?: string;
    /** Additional CSS classes */
    className?: string;
}

/**
 * NotificationIcon component renders an appropriate icon for a notification
 * with lazy loading and caching for custom images.
 *
 * @example
 * // With type-based icon
 * <NotificationIcon type="trainer_feedback" />
 *
 * @example
 * // With custom image URL (lazy loaded)
 * <NotificationIcon type="achievement" iconUrl="https://example.com/trophy.png" />
 */
export function NotificationIcon({
    type,
    iconUrl,
    className,
}: NotificationIconProps) {
    const [imageError, setImageError] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);

    // If custom icon URL is provided and hasn't errored, render an image with lazy loading
    if (iconUrl && !imageError) {
        return (
            <div
                className={cn(
                    'relative rounded-full overflow-hidden bg-gray-100',
                    // Responsive icon sizing (Requirement 6.1, 6.2, 6.3)
                    'h-8 w-8',          // Mobile: compact
                    'sm:h-10 sm:w-10',  // Tablet: standard
                    'md:h-12 md:w-12',  // Desktop: larger
                    className
                )}
            >
                {/* Loading placeholder */}
                {imageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                        <div className="h-4 w-4 animate-pulse rounded-full bg-gray-300" />
                    </div>
                )}

                {/* Lazy-loaded image with Next.js Image component */}
                <Image
                    src={iconUrl}
                    alt={`${type} notification icon`}
                    fill
                    sizes="(max-width: 640px) 32px, (max-width: 1024px) 40px, 48px"
                    className="object-cover"
                    loading="lazy"
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                        setImageError(true);
                        setImageLoading(false);
                    }}
                />
            </div>
        );
    }

    // Otherwise, render the appropriate Lucide icon based on type
    const iconClassName = cn(
        'text-gray-600',
        // Responsive icon sizing (Requirement 6.1, 6.2, 6.3)
        'h-4 w-4',          // Mobile
        'sm:h-5 sm:w-5',    // Tablet
        'md:h-6 md:w-6'     // Desktop
    );

    const containerClassName = cn(
        'flex items-center justify-center rounded-full bg-gray-100',
        // Responsive icon container sizing (Requirement 6.1, 6.2, 6.3)
        'h-8 w-8',          // Mobile: compact
        'sm:h-10 sm:w-10',  // Tablet: standard
        'md:h-12 md:w-12',  // Desktop: larger
        className
    );

    // Render icon based on notification type
    const renderIcon = () => {
        switch (type) {
            case 'trainer_feedback':
                return <MessageSquare className={iconClassName} />;
            case 'achievement':
                return <Trophy className={iconClassName} />;
            case 'reminder':
                return <Bell className={iconClassName} />;
            case 'system_update':
                return <Settings className={iconClassName} />;
            case 'new_feature':
                return <Star className={iconClassName} />;
            case 'general':
            default:
                return <Info className={iconClassName} />;
        }
    };

    return (
        <div
            className={containerClassName}
            aria-hidden="true"
        >
            {renderIcon()}
        </div>
    );
}
