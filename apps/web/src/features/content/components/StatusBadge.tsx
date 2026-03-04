'use client'

import { cn } from '@/shared/utils/cn'
import type { ContentStatus } from '@/features/content/types'

const STATUS_CONFIG: Record<ContentStatus, { label: string; className: string }> = {
    draft: {
        label: 'Черновик',
        className: 'bg-gray-100 text-gray-700',
    },
    scheduled: {
        label: 'Запланирован',
        className: 'bg-amber-100 text-amber-700',
    },
    published: {
        label: 'Опубликован',
        className: 'bg-green-100 text-green-700',
    },
}

export interface StatusBadgeProps {
    status: ContentStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const config = STATUS_CONFIG[status]

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
