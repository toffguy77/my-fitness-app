'use client'

import { useEffect } from 'react'
import { chatApi } from '../api/chatApi'
import { useChatStore } from '../store/chatStore'
import { useWebSocketContext } from '../components/WebSocketProvider'

/**
 * Returns the total unread message count.
 * Fetches on mount and updates in real-time via WebSocket events.
 */
export function useUnreadCount() {
    const { unreadTotal, setUnreadTotal, incrementUnread } = useChatStore()
    const ws = useWebSocketContext()

    // Fetch initial count on mount
    useEffect(() => {
        chatApi
            .getUnreadCount()
            .then((data) => setUnreadTotal(data.count))
            .catch(() => {
                // Silently fail — unread count is non-critical
            })
    }, [setUnreadTotal])

    // Listen for WebSocket events
    useEffect(() => {
        if (!ws?.lastEvent) return

        const { type, data } = ws.lastEvent

        if (type === 'unread_count_update' && typeof data.count === 'number') {
            setUnreadTotal(data.count)
        } else if (type === 'new_message' && data.conversation_id) {
            incrementUnread(data.conversation_id as string)
        }
    }, [ws?.lastEvent, setUnreadTotal, incrementUnread])

    return unreadTotal
}
