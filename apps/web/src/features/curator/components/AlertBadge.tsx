'use client'

import { cn } from '@/shared/utils/cn'

export interface AlertBadgeProps {
    level: 'red' | 'yellow' | 'green'
    message: string
}

const levelStyles: Record<AlertBadgeProps['level'], string> = {
    red: 'bg-danger-soft text-danger-fg',
    yellow: 'bg-warning-soft text-warning-fg',
    green: 'bg-success-soft text-success-fg',
}

export function AlertBadge({ level, message }: AlertBadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                levelStyles[level]
            )}
        >
            {message}
        </span>
    )
}
