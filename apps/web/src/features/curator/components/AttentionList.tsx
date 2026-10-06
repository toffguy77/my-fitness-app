'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/shared/utils/cn'
import type { AttentionItem } from '../types'

import { t } from '@/shared/i18n'
interface AttentionListProps {
    items: AttentionItem[]
}

const reasonLabels: Record<AttentionItem['reason'], string> = {
    red_alert: t('curator.attention.red_alert'),
    overdue_task: t('curator.attention.overdue_task'),
    inactive: t('curator.attention.inactive'),
    unread_message: t('curator.attention.unread_message'),
    awaiting_feedback: t('curator.attention.awaiting_feedback'),
    incomplete_profile: t('curator.attention.incomplete_profile'),
}

function getPriorityBadgeClass(priority: number): string {
    if (priority <= 2) return 'bg-danger-soft text-danger-fg'
    if (priority === 3) return 'bg-warning-soft text-warning-fg'
    // Низкий приоритет сообщает, а не тревожит — информационная роль.
    return 'bg-info-soft text-info-fg'
}

interface GroupedClient {
    clientId: number
    clientName: string
    clientAvatar?: string
    actionUrl: string
    items: AttentionItem[]
    topPriority: number
}

export function AttentionList({ items }: AttentionListProps) {
    const router = useRouter()

    const grouped = useMemo(() => {
        const map = new Map<number, GroupedClient>()
        for (const item of items) {
            const existing = map.get(item.client_id)
            if (existing) {
                existing.items.push(item)
                if (item.priority < existing.topPriority) {
                    existing.topPriority = item.priority
                    existing.actionUrl = item.action_url
                }
            } else {
                map.set(item.client_id, {
                    clientId: item.client_id,
                    clientName: item.client_name,
                    clientAvatar: item.client_avatar,
                    actionUrl: item.action_url,
                    items: [item],
                    topPriority: item.priority,
                })
            }
        }
        return Array.from(map.values()).sort((a, b) => a.topPriority - b.topPriority)
    }, [items])

    if (grouped.length === 0) return null

    return (
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {grouped.map((group) => {
                const initials = group.clientName
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()

                return (
                    <button
                        key={group.clientId}
                        type="button"
                        // Строка на клиента, а не на причину: список сгруппирован
                        // выше. По этой зацепке набор E2E сверяет число в
                        // карточке «требуют внимания» с тем, что нарисовано под
                        // ней, — раньше эти два числа считались разными
                        // правилами и расходились.
                        data-testid="attention-item"
                        onClick={() => router.push(group.actionUrl)}
                        className={cn(
                            'flex min-h-14 w-full items-center gap-3 px-4 py-3',
                            'text-left transition-colors hover:bg-subtle/60',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'
                        )}
                    >
                        {group.clientAvatar ? (
                            <Image
                                src={group.clientAvatar}
                                alt={group.clientName}
                                width={36}
                                height={36}
                                className="h-9 w-9 rounded-full object-cover"
                                unoptimized
                            />
                        ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-fg-muted" aria-hidden="true">
                                {initials}
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <p
                                className="type-headline truncate text-fg"
                                data-testid="attention-client-name"
                            >
                                {group.clientName}
                            </p>
                            <p className="truncate text-sm text-fg-muted">
                                {group.items.map((i) => i.detail).join(' · ')}
                            </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                            {group.items.map((item) => (
                                <span
                                    key={`${item.reason}-${item.detail}`}
                                    className={cn(
                                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                        getPriorityBadgeClass(item.priority)
                                    )}
                                >
                                    {reasonLabels[item.reason]}
                                </span>
                            ))}
                        </div>
                    </button>
                )
            })}
        </div>
    )
}
