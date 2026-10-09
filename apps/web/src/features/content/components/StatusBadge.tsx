'use client'

import { cn } from '@/shared/utils/cn'
import type { ContentStatus } from '@/features/content/types'

// Статус — роль состояния: черновик нейтрален, запланированное сообщает о
// будущем событии (info, а не warning — ничего не пошло мимо), опубликованное —
// успех.
const STATUS_CONFIG: Record<ContentStatus, { label: string; className: string }> = {
    draft: {
        label: 'Черновик',
        className: 'bg-subtle text-fg-muted',
    },
    scheduled: {
        label: 'Запланирован',
        className: 'bg-info-soft text-info-fg',
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
        className: 'bg-subtle text-fg-muted',
    }

    return (
        <span
            className={cn(
                'inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
                config.className,
            )}
        >
            {config.label}
        </span>
    )
}
