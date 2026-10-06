'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { adminApi } from '../api/adminApi'
import type { AdminMessage } from '../types'

import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'
import { AdminSpinner } from './adminUi'
export interface ReadOnlyMessageListProps {
    conversationId: string
}

export function ReadOnlyMessageList({ conversationId }: ReadOnlyMessageListProps) {
    const [messages, setMessages] = useState<AdminMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const prevLengthRef = useRef(0)

    useEffect(() => {
        adminApi.getConversationMessages(conversationId)
            .then((msgs) => {
                setMessages(msgs.reverse())
                setHasMore(msgs.length >= 50)
            })
            .catch(() => setError(t('admin.chats.messagesLoadFailed')))
            .finally(() => setLoading(false))
    }, [conversationId])

    // Auto-scroll when new messages load initially
    useEffect(() => {
        if (messages.length > prevLengthRef.current && prevLengthRef.current === 0) {
            const el = scrollRef.current
            if (el) {
                el.scrollTop = el.scrollHeight
            }
        }
        prevLengthRef.current = messages.length
    }, [messages.length])

    const handleLoadMore = useCallback(() => {
        if (loadingMore || !hasMore || messages.length === 0) return

        // First message (oldest) is cursor for loading older messages
        const oldest = messages[0]
        setLoadingMore(true)

        adminApi.getConversationMessages(conversationId, oldest.id)
            .then((olderMsgs) => {
                setMessages((prev) => [...olderMsgs.reverse(), ...prev])
                setHasMore(olderMsgs.length >= 50)
            })
            .catch(() => { /* silently fail for load more */ })
            .finally(() => setLoadingMore(false))
    }, [conversationId, loadingMore, hasMore, messages])

    if (loading) {
        return <AdminSpinner className="h-full" />
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
    }

    if (messages.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm text-fg-subtle">{t('admin.chats.noMessages')}</p>
            </div>
        )
    }

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-screen-x py-4">
            {hasMore && (
                <div className="mb-4 flex justify-center">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                    >
                        {loadingMore ? t('common.loading') : t('admin.chats.loadMore')}
                    </Button>
                </div>
            )}

            <div className="mx-auto max-w-3xl space-y-4">
                {messages.map((msg) => (
                    <div key={msg.id} className="space-y-1">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-semibold text-fg">{msg.sender_name}</span>
                            <span className="text-[11px] tabular-nums text-fg-subtle">
                                {new Date(msg.created_at).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        </div>
                        <div className="inline-block max-w-[85%] rounded-tile bg-subtle px-4 py-2.5 text-[15px] leading-[22px] text-fg">
                            {msg.type === 'food_entry' ? (
                                <span className="italic text-fg-muted">{msg.content || t('admin.chats.foodEntry')}</span>
                            ) : (
                                msg.content || <span className="text-fg-subtle">{t('admin.chats.attachment')}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
