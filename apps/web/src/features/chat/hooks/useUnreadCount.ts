/**
 * Hook for fetching and tracking unread message count
 */

'use client'

import { useEffect } from 'react'
import { chatApi } from '../api/chatApi'
import { useChatStore } from '../store/chatStore'

/**
 * Returns the total unread message count and fetches it on mount.
 */
export function useUnreadCount() {
    const { unreadTotal, setUnreadTotal } = useChatStore()

    useEffect(() => {
        chatApi
            .getUnreadCount()
            .then((data) => setUnreadTotal(data.count))
            .catch(() => {
                // Silently fail — unread count is non-critical
            })
    }, [setUnreadTotal])

    return unreadTotal
}
