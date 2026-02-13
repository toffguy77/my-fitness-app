/**
 * AttentionBadge Component
 *
 * Visual indicator for items requiring user attention.
 * Supports different urgency levels with consistent styling.
 * Fully accessible with ARIA labels, live regions, and keyboard navigation.
 *
 * Requirements: 15.10, 15.12
 */

'use client';

import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useEffect, useRef } from 'react';

/**
 * Urgency levels for attention indicators
 */
export type UrgencyLevel = 'normal' | 'high' | 'critical';

/**
 * AttentionBadge Props
 */
export interface AttentionBadgeProps {
    /** Urgency level determines color and animation */
    urgency?: UrgencyLevel;
    /** Optional count to display in badge */
    count?: number;
    /** Optional custom label */
    label?: string;
    /** Additional CSS classes */
    className?: string;
    /** Whether to show pulsing animation (for critical items) */
    pulse?: boolean;
    /** ARIA label for accessibility */
    ariaLabel?: string;
    /** Whether to announce changes to screen readers (uses aria-live) */
    announceChanges?: boolean;
    /** ID for linking to the indicated element */
    indicatesId?: string;
}

/**
 * Get color classes based on urgency level
 */
function getColorClasses(urgency: UrgencyLevel): string {
    switch (urgency) {
        case 'critical':
            return 'bg-red-500 text-white border-red-600';
        case 'high':
            return 'bg-orange-500 text-white border-orange-600';
        case 'normal':
        default:
            return 'bg-blue-500 text-white border-blue-600';
    }
}

/**
 * AttentionBadge Component
 */
export function AttentionBadge({
    urgency = 'normal',
    count,
    label,
    className = '',
    pulse = false,
    ariaLabel,
    announceChanges = false,
    indicatesId,
}: AttentionBadgeProps) {
    const colorClasses = getColorClasses(urgency);
    const shouldPulse = pulse || urgency === 'critical';
    const previousCountRef = useRef<number | undefined>(count);

    // Generate default ARIA label if not provided
    const defaultAriaLabel = count
        ? `${count} ${urgency === 'critical' ? 'срочных' : urgency === 'high' ? 'важных' : ''} элементов требуют внимания`
        : label
            ? `${label} требует внимания`
            : 'Требует внимания';

    const finalAriaLabel = ariaLabel || defaultAriaLabel;

    // Announce changes to screen readers when count changes
    useEffect(() => {
        if (announceChanges && count !== undefined && previousCountRef.current !== count) {
            previousCountRef.current = count;
        }
    }, [count, announceChanges]);

    // Determine aria-live politeness based on urgency
    const ariaLive = announceChanges
        ? urgency === 'critical'
            ? 'assertive'
            : 'polite'
        : undefined;

    // Render icon based on urgency level
    const renderIcon = () => {
        const iconClass = "w-3 h-3";
        switch (urgency) {
            case 'critical':
                return <AlertTriangle className={iconClass} aria-hidden="true" />;
            case 'high':
                return <AlertCircle className={iconClass} aria-hidden="true" />;
            case 'normal':
            default:
                return <Info className={iconClass} aria-hidden="true" />;
        }
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border',
                colorClasses,
                shouldPulse && 'animate-pulse',
                className
            )}
            role="status"
            aria-label={finalAriaLabel}
            aria-live={ariaLive}
            aria-atomic="true"
            aria-describedby={indicatesId}
            data-urgency={urgency}
            tabIndex={0}
        >
            {renderIcon()}
            {count !== undefined && <span>{count}</span>}
            {label && <span>{label}</span>}
        </span>
    );
}

/**
 * AttentionDot Component
 * Smaller dot indicator for inline use
 */
export interface AttentionDotProps {
    urgency?: UrgencyLevel;
    pulse?: boolean;
    className?: string;
    ariaLabel?: string;
    /** Whether to announce changes to screen readers */
    announceChanges?: boolean;
    /** ID for linking to the indicated element */
    indicatesId?: string;
}

export function AttentionDot({
    urgency = 'normal',
    pulse = false,
    className = '',
    ariaLabel = 'Требует внимания',
    announceChanges = false,
    indicatesId,
}: AttentionDotProps) {
    const colorClasses = getColorClasses(urgency);
    const shouldPulse = pulse || urgency === 'critical';

    // Determine aria-live politeness based on urgency
    const ariaLive = announceChanges
        ? urgency === 'critical'
            ? 'assertive'
            : 'polite'
        : undefined;

    return (
        <span
            className={cn(
                'inline-block w-2 h-2 rounded-full',
                colorClasses,
                shouldPulse && 'animate-pulse',
                className
            )}
            role="status"
            aria-label={ariaLabel}
            aria-live={ariaLive}
            aria-atomic="true"
            aria-describedby={indicatesId}
            data-urgency={urgency}
            tabIndex={0}
        />
    );
}

/**
 * AttentionIcon Component
 * Icon-only indicator for compact spaces
 */
export interface AttentionIconProps {
    urgency?: UrgencyLevel;
    size?: 'sm' | 'md' | 'lg';
    pulse?: boolean;
    className?: string;
    ariaLabel?: string;
    /** Whether to announce changes to screen readers */
    announceChanges?: boolean;
    /** ID for linking to the indicated element */
    indicatesId?: string;
}

export function AttentionIcon({
    urgency = 'normal',
    size = 'md',
    pulse = false,
    className = '',
    ariaLabel = 'Требует внимания',
    announceChanges = false,
    indicatesId,
}: AttentionIconProps) {
    const shouldPulse = pulse || urgency === 'critical';

    const sizeClasses = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5',
    };

    const colorClasses = urgency === 'critical'
        ? 'text-red-500'
        : urgency === 'high'
            ? 'text-orange-500'
            : 'text-blue-500';

    // Determine aria-live politeness based on urgency
    const ariaLive = announceChanges
        ? urgency === 'critical'
            ? 'assertive'
            : 'polite'
        : undefined;

    const iconClassName = cn(
        sizeClasses[size],
        colorClasses,
        shouldPulse && 'animate-pulse',
        className
    );

    const commonProps = {
        className: iconClassName,
        role: "img" as const,
        "aria-label": ariaLabel,
        "aria-live": ariaLive as "assertive" | "polite" | "off" | undefined,
        "aria-atomic": true as const,
        "aria-describedby": indicatesId,
        "data-urgency": urgency,
        tabIndex: 0,
    };

    switch (urgency) {
        case 'critical':
            return <AlertTriangle {...commonProps} />;
        case 'high':
            return <AlertCircle {...commonProps} />;
        case 'normal':
        default:
            return <Info {...commonProps} />;
    }
}
