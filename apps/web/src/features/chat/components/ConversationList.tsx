/**
 * ConversationList Component
 *
 * Fetches and renders all conversations for the curator.
 * Shows avatar, client name, last message preview, timestamp, and unread badge.
 *
 * Время в строке означает одно: когда здесь последний раз писали. У разговора
 * без сообщений его нет вовсе — раньше на его месте печаталась дата создания
 * записи, и пустой чат выглядел как чат, в котором что-то было. Строка при этом
 * противоречила сама себе: «вчера» рядом с «Нет сообщений».
 *
 * Порядок: непрочитанные первыми, затем по времени последнего сообщения, и
 * разговоры без сообщений — группой в конце, по имени участника. Раньше
 * сортировка шла по `updated_at`, и только что созданный пустой разговор
 * вставал выше переписки, в которой писали позавчера.
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { chatApi } from '../api/chatApi'
import type { Conversation } from '../types'
import { t } from '@/shared/i18n'

// ============================================================================
// Types
// ============================================================================

interface ConversationListProps {
    onSelectConversation: (conversation: Conversation) => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Truncate text to a maximum length, appending ellipsis if needed.
 */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen).trimEnd() + '...'
}

/**
 * Format a timestamp into a relative Russian string:
 * - < 1 min: "только что"
 * - < 60 min: "X мин назад"
 * - < 24 hours: "X ч назад"
 * - yesterday: "вчера"
 * - else: DD.MM.YYYY
 */
function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMin < 1) return t('chat.justNow')
    if (diffMin < 60) return t('chat.minutesAgo', { minutes: diffMin })
    if (diffHours < 24) return t('chat.hoursAgo', { hours: diffHours })

    // Check if yesterday
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (
        date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear()
    ) {
        return t('chat.yesterday')
    }

    // Format as DD.MM.YYYY
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yyyy = date.getFullYear()
    return `${dd}.${mm}.${yyyy}`
}

/**
 * Get initials from a name (first letter of first and last name).
 */
function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Get the last message preview text.
 */
function getPreview(conv: Conversation): string {
    if (!conv.last_message) return t('chat.noMessages')

    switch (conv.last_message.type) {
        case 'text':
            return truncate(conv.last_message.content ?? '', 50)
        case 'image':
            return t('chat.photo')
        case 'file':
            return t('chat.file')
        case 'food_entry':
            return t('chat.macroEntry')
        default:
            return truncate(conv.last_message.content ?? '', 50)
    }
}

// ============================================================================
// Component
// ============================================================================

export function ConversationList({ onSelectConversation }: ConversationListProps) {
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        chatApi
            .getConversations()
            .then((convs) => {
                setConversations(convs)
                setIsLoading(false)
            })
            .catch(() => {
                setIsLoading(false)
            })
    }, [])

    const sorted = useMemo(() => {
        return [...conversations].sort((a, b) => {
            // Непрочитанные первыми.
            const aUnread = a.unread_count > 0 ? 1 : 0
            const bUnread = b.unread_count > 0 ? 1 : 0
            if (bUnread !== aUnread) return bUnread - aUnread

            // Затем те, в которых писали, — по времени последнего сообщения.
            // Разговоры без сообщений уходят группой в конец: дата создания
            // записи о разговоре — не активность и за верх списка не
            // соревнуется.
            const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : null
            const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : null
            if (aTime === null && bTime === null) {
                // Внутри группы — по имени, иначе порядок меняется между
                // загрузками и список переставляется сам собой.
                return a.participant.name.localeCompare(b.participant.name, 'ru')
            }
            if (aTime === null) return 1
            if (bTime === null) return -1
            return bTime - aTime
        })
    }, [conversations])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-fg-subtle text-sm">{t('chat.loadingChats')}</p>
            </div>
        )
    }

    if (sorted.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-fg-subtle text-sm">{t('chat.noChats')}</p>
            </div>
        )
    }

    return (
        <ul className="divide-y divide-line">
            {sorted.map((conv) => (
                <li key={conv.id}>
                    <button
                        type="button"
                        onClick={() => onSelectConversation(conv)}
                        className="flex items-center gap-3 w-full px-2 py-3 hover:bg-canvas transition-colors text-left rounded-lg"
                    >
                        {/* Avatar */}
                        {conv.participant.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={conv.participant.avatar_url}
                                alt={conv.participant.name}
                                className="w-11 h-11 rounded-full object-cover shrink-0"
                            />
                        ) : (
                            <div className="w-11 h-11 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                                <span className="text-sm font-medium text-primary">
                                    {getInitials(conv.participant.name)}
                                </span>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-fg truncate">
                                    {conv.participant.name}
                                </span>
                                {conv.last_message && (
                                    <span className="text-xs text-fg-subtle shrink-0 ml-2">
                                        {formatRelativeTime(conv.last_message.created_at)}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                                <p className="text-sm text-fg-muted truncate">
                                    {getPreview(conv)}
                                </p>
                                {conv.unread_count > 0 && (
                                    <span className="ml-2 shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-on-primary text-xs font-medium">
                                        {conv.unread_count}
                                    </span>
                                )}
                            </div>
                        </div>
                    </button>
                </li>
            ))}
        </ul>
    )
}
