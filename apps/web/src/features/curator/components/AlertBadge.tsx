'use client'

import { cn } from '@/shared/utils/cn'

export interface AlertBadgeProps {
    level: 'red' | 'yellow' | 'green'
    message: string
}

const levelStyles: Record<AlertBadgeProps['level'], string> = {
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    green: 'bg-green-100 text-green-800',
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
