'use client'

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

export function AttentionList({ items }: AttentionListProps) {
    const router = useRouter()

    if (items.length === 0) return null

    return (
        <div className="space-y-2">
            {items.map((item, idx) => {
                const initials = item.client_name
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()

                return (
                    <button
                        key={`${item.client_id}-${item.reason}-${idx}`}
                        type="button"
                        onClick={() => router.push(item.action_url)}
                        className={cn(
                            'w-full rounded-xl bg-white p-3 shadow-sm border border-gray-100',
                            'text-left transition-shadow hover:shadow-md',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                            'flex items-center gap-3'
                        )}
                    >
                        {item.client_avatar ? (
                            <Image
                                src={item.client_avatar}
                                alt={item.client_name}
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
                                {item.client_name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{item.detail}</p>
                        </div>

                        <span
                            className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0',
                                getPriorityBadgeClass(item.priority)
                            )}
                        >
                            {reasonLabels[item.reason]}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
