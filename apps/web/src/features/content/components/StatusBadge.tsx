'use client'

import { cn } from '@/shared/utils/cn'
import type { ContentStatus } from '@/features/content/types'

const STATUS_CONFIG: Record<ContentStatus, { label: string; className: string }> = {
    draft: {
        label: 'Черновик',
        className: 'bg-subtle text-fg',
    },
    scheduled: {
        label: 'Запланирован',
        className: 'bg-warning-soft text-warning-fg',
    },
    published: {
        label: 'Опубликован',
        className: 'bg-success-soft text-success-fg',
    },
}

export interface StatusBadgeProps {
    status: ContentStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const config = STATUS_CONFIG[status] ?? {
        label: status,
        className: 'bg-subtle text-fg',
    }

    return (
        <span
            className={cn(
                'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                config.className,
            )}
        >
            {config.label}
        </span>
    )
}
