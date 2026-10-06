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
import { t } from '@/shared/i18n'

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
 * Цвет — роль состояния, не бренд: терракота принадлежит главному действию
 * экрана. «Не записано сегодня» сообщает, а не тревожит — `info`; важное —
 * `warning`; срочное — `danger`. Метка — мягкой подложкой с текстом `-fg`,
 * точка — сплошной заливкой роли.
 */
function getBadgeClasses(urgency: UrgencyLevel): string {
    switch (urgency) {
        case 'critical':
            return 'bg-danger-soft text-danger-fg';
        case 'high':
            return 'bg-warning-soft text-warning-fg';
        case 'normal':
        default:
            return 'bg-info-soft text-info-fg';
    }
}

function getDotClasses(urgency: UrgencyLevel): string {
    switch (urgency) {
        case 'critical':
            return 'bg-danger';
        case 'high':
            return 'bg-warning';
        case 'normal':
        default:
            return 'bg-info';
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
    const colorClasses = getBadgeClasses(urgency);
    const shouldPulse = pulse || urgency === 'critical';
    const previousCountRef = useRef<number | undefined>(count);

    // Generate default ARIA label if not provided
    const defaultAriaLabel = count
        ? t('dashboard.attention.countAria', {
            count,
            urgency: urgency === 'critical'
                ? t('dashboard.attention.critical')
                : urgency === 'high'
                    ? t('dashboard.attention.high')
                    : '',
        })
        : label
            ? t('dashboard.attention.labelled', { label })
            : t('dashboard.attention.plain');

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
        const iconClass = "h-3.5 w-3.5";
        switch (urgency) {
            case 'critical':
                return <AlertTriangle className={iconClass} strokeWidth={2} aria-hidden="true" />;
            case 'high':
                return <AlertCircle className={iconClass} strokeWidth={2} aria-hidden="true" />;
            case 'normal':
            default:
                return <Info className={iconClass} strokeWidth={2} aria-hidden="true" />;
        }
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
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
    ariaLabel = t('dashboard.attention.plain'),
    announceChanges = false,
    indicatesId,
}: AttentionDotProps) {
    const colorClasses = getDotClasses(urgency);
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
    ariaLabel = t('dashboard.attention.plain'),
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
        ? 'text-danger-fg'
        : urgency === 'high'
            ? 'text-warning-fg'
            : 'text-info-fg';

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
