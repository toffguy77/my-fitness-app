/**
 * Chat hook combining REST API and WebSocket for a single conversation
 * Handles message loading, sending, file uploads, and real-time updates
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { chatApi } from '../api/chatApi'
import { useWebSocket } from './useWebSocket'
import type { Message, WebSocketEvent } from '../types'

/**
 * Custom hook for managing a single conversation's messages and interactions.
 *
 * - Loads messages on mount
 * - Listens for new messages via WebSocket
 * - Supports cursor-based pagination (loadMore)
 * - Provides sendMessage, sendFile, sendTyping
 */
export function useChat(conversationId: string | null) {
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const { sendEvent, lastEvent } = useWebSocket()

    // Load initial messages when conversation changes
    useEffect(() => {
        if (!conversationId) return

        let cancelled = false
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Setting loading before async fetch
        setIsLoading(true)

        chatApi
            .getMessages(conversationId)
            .then((msgs) => {
                if (!cancelled) {
                    // API returns DESC order (newest first); reverse for chronological display
                    setMessages(msgs.reverse())
                    setHasMore(msgs.length >= 50)
                    setIsLoading(false)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setIsLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [conversationId])

    // Listen for new messages via WebSocket
    useEffect(() => {
        if (!lastEvent || lastEvent.type !== 'new_message') return

        const msg = lastEvent.data as unknown as Message
        if (msg.conversation_id === conversationId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- WebSocket subscription update
            setMessages((prev) => {
                // Avoid duplicates if the message was already added by sendMessage
                if (prev.some((m) => m.id === msg.id)) return prev
                return [...prev, msg]
            })
        }
    }, [lastEvent, conversationId])

    // Load older messages (cursor pagination)
    const loadMore = useCallback(async () => {
        if (!conversationId || !hasMore || isLoading) return

        const cursor = messages[0]?.id
        const older = await chatApi.getMessages(conversationId, cursor)
        // API returns DESC order; reverse and prepend for chronological display
        setMessages((prev) => [...older.reverse(), ...prev])
        setHasMore(older.length >= 50)
    }, [conversationId, hasMore, isLoading, messages])

    // Send a text message
    const sendMessage = useCallback(
        async (content: string) => {
            if (!conversationId) return
            const msg = await chatApi.sendMessage(conversationId, {
                type: 'text',
                content,
            })
            setMessages((prev) => [...prev, msg])
        },
        [conversationId]
    )

    // Send a file (upload then send message)
    const sendFile = useCallback(
        async (file: File) => {
            if (!conversationId) return
            const att = await chatApi.uploadFile(conversationId, file)
            const type = file.type.startsWith('image/') ? 'image' : 'file'
            const msg = await chatApi.sendMessage(conversationId, {
                type,
                content: att.file_url,
            })
            setMessages((prev) => [...prev, msg])
        },
        [conversationId]
    )

    // Send typing indicator
    const sendTyping = useCallback(() => {
        if (!conversationId) return
        sendEvent({
            type: 'typing',
            data: { conversation_id: conversationId },
        })
    }, [conversationId, sendEvent])

    return {
        messages,
        isLoading,
        hasMore,
        loadMore,
        sendMessage,
        sendFile,
        sendTyping,
        lastEvent: lastEvent as WebSocketEvent | null,
    }
}
