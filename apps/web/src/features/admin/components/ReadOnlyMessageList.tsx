'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { adminApi } from '../api/adminApi'
import type { AdminMessage } from '../types'

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
            .catch(() => setError('Не удалось загрузить сообщения'))
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
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-red-500">{error}</p>
    }

    if (messages.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-gray-400 text-sm">Нет сообщений</p>
            </div>
        )
    }

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 px-4">
            {hasMore && (
                <div className="flex justify-center mb-4">
                    <button
                        type="button"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="text-sm text-blue-500 hover:text-blue-600 disabled:text-gray-300 transition-colors"
                    >
                        {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {messages.map((msg) => (
                    <div key={msg.id} className="space-y-0.5">
                        <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-gray-700">{msg.sender_name}</span>
                            <span className="text-[10px] text-gray-400">
                                {new Date(msg.created_at).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        </div>
                        <div className={cn(
                            'inline-block rounded-lg px-3 py-2 text-sm max-w-[85%]',
                            'bg-gray-100 text-gray-900'
                        )}>
                            {msg.type === 'food_entry' ? (
                                <span className="italic text-gray-600">{msg.content || 'Запись о питании'}</span>
                            ) : (
                                msg.content || <span className="text-gray-400">{'[вложение]'}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
