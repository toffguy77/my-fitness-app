'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/shared/utils/cn'
import type { AttentionItem } from '../types'

interface AttentionListProps {
    items: AttentionItem[]
}

const reasonLabels: Record<AttentionItem['reason'], string> = {
    red_alert: 'Алерт КБЖУ',
    overdue_task: 'Просроченная задача',
    inactive: 'Нет активности',
    unread_message: 'Сообщение',
    awaiting_feedback: 'Ожидает отзыв',
}

function getPriorityBadgeClass(priority: number): string {
    if (priority <= 2) return 'bg-red-100 text-red-800'
    if (priority === 3) return 'bg-yellow-100 text-yellow-800'
    return 'bg-blue-100 text-blue-800'
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
        <div className="space-y-2">
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
                        onClick={() => router.push(group.actionUrl)}
                        className={cn(
                            'w-full rounded-xl bg-white p-3 shadow-sm border border-gray-100',
                            'text-left transition-shadow hover:shadow-md',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                            'flex items-center gap-3'
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
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600 shrink-0">
                                {initials}
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                                {group.clientName}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                                {group.items.map((i) => i.detail).join(' · ')}
                            </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                            {group.items.map((item) => (
                                <span
                                    key={item.reason}
                                    className={cn(
                                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
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
