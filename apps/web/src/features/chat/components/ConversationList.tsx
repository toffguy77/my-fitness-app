/**
 * ConversationList Component
 *
 * Fetches and renders all conversations for the curator.
 * Shows avatar, client name, last message preview, timestamp, and unread badge.
 * Sorted: unread conversations first, then by updated_at descending.
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { chatApi } from '../api/chatApi'
import type { Conversation } from '../types'

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

    if (diffMin < 1) return 'только что'
    if (diffMin < 60) return `${diffMin} мин назад`
    if (diffHours < 24) return `${diffHours} ч назад`

    // Check if yesterday
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (
        date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear()
    ) {
        return 'вчера'
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
    if (!conv.last_message) return 'Нет сообщений'

    switch (conv.last_message.type) {
        case 'text':
            return truncate(conv.last_message.content ?? '', 50)
        case 'image':
            return 'Фото'
        case 'file':
            return 'Файл'
        case 'food_entry':
            return 'КБЖУ запись'
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

    // Sort: unread first, then by updated_at descending
    const sorted = useMemo(() => {
        return [...conversations].sort((a, b) => {
            // Unread conversations first
            const aUnread = a.unread_count > 0 ? 1 : 0
            const bUnread = b.unread_count > 0 ? 1 : 0
            if (bUnread !== aUnread) return bUnread - aUnread

            // Then by updated_at descending
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
    }, [conversations])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-gray-400 text-sm">Загрузка чатов...</p>
            </div>
        )
    }

    if (sorted.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <p className="text-gray-400 text-sm">Нет чатов</p>
            </div>
        )
    }

    return (
        <ul className="divide-y divide-gray-100">
            {sorted.map((conv) => (
                <li key={conv.id}>
                    <button
                        type="button"
                        onClick={() => onSelectConversation(conv)}
                        className="flex items-center gap-3 w-full px-2 py-3 hover:bg-gray-50 transition-colors text-left rounded-lg"
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
                            <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                <span className="text-sm font-medium text-blue-700">
                                    {getInitials(conv.participant.name)}
                                </span>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                    {conv.participant.name}
                                </span>
                                <span className="text-xs text-gray-400 shrink-0 ml-2">
                                    {conv.last_message
                                        ? formatRelativeTime(conv.last_message.created_at)
                                        : formatRelativeTime(conv.updated_at)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                                <p className="text-sm text-gray-500 truncate">
                                    {getPreview(conv)}
                                </p>
                                {conv.unread_count > 0 && (
                                    <span className="ml-2 shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
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
