/**
 * MessageList Component
 *
 * Scrollable container that displays chat messages.
 * Auto-scrolls to bottom on new messages; shows "load more" at top for pagination.
 */

'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import type { Message } from '../types'
import { MessageBubble } from './MessageBubble'
import { DateSeparator } from './DateSeparator'
import { t } from '@/shared/i18n'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'

// ============================================================================
// Types
// ============================================================================

interface MessageListProps {
    messages: Message[]
    isLoading: boolean
    hasMore: boolean
    onLoadMore: () => void
    /** Optional callback for image action button on messages from others */
    onImageAction?: (message: Message) => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get current user ID from localStorage
 */
function getCurrentUserId(): number | null {
    if (typeof window === 'undefined') return null
    try {
        const user = localStorage.getItem('user')
        if (!user) return null
        const parsed = JSON.parse(user)
        return parsed.id ?? null
    } catch {
        // Молчим намеренно: это испорченный локальный слепок профиля, а не
        // отказ сервера — объяснять нечего и некому. Без идентификатора
        // сообщения просто не делятся на «мои» и «чужие»; это хуже, чем с
        // ним, но лучше, чем оборванный экран.
        return null
    }
}

// ============================================================================
// Component
// ============================================================================

export function MessageList({ messages, isLoading, hasMore, onLoadMore, onImageAction }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const prevLengthRef = useRef(0)

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messages.length > prevLengthRef.current) {
            const el = scrollRef.current
            if (el) {
                el.scrollTop = el.scrollHeight
            }
        }
        prevLengthRef.current = messages.length
    }, [messages.length])

    const handleLoadMore = useCallback(() => {
        if (!isLoading && hasMore) {
            onLoadMore()
        }
    }, [isLoading, hasMore, onLoadMore])

    const currentUserId = getCurrentUserId()

    type ListItem =
        | { type: 'date'; date: string; key: string }
        | { type: 'message'; msg: Message }

    const messagesWithDates = useMemo(() => {
        const items: ListItem[] = []
        let lastDateStr = ''

        for (const msg of messages) {
            const dateStr = new Date(msg.created_at).toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })
            if (dateStr !== lastDateStr) {
                items.push({ type: 'date', date: dateStr, key: `date-${msg.created_at}` })
                lastDateStr = dateStr
            }
            items.push({ type: 'message', msg })
        }

        return items
    }, [messages])

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
            {/* Load more button */}
            {hasMore && (
                <div className="flex justify-center mb-4">
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        className="text-fg-muted"
                    >
                        {isLoading ? t('common.loading') : t('chat.loadMore')}
                    </Button>
                </div>
            )}

            {/* Loading state */}
            {isLoading && messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3" role="status">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                    <p className="text-sm text-fg-muted">{t('chat.loadingMessages')}</p>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                        <MessageCircle className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} />
                    </span>
                    <p className="type-title-3 text-fg">{t('chat.noMessages')}</p>
                </div>
            )}

            {/* Messages with date separators */}
            {messagesWithDates.map((item) =>
                item.type === 'date' ? (
                    <DateSeparator key={item.key} date={item.date} />
                ) : (
                    <MessageBubble
                        key={item.msg.id}
                        message={item.msg}
                        isOwn={currentUserId !== null && item.msg.sender_id === currentUserId}
                        onImageAction={onImageAction}
                    />
                )
            )}
        </div>
    )
}
