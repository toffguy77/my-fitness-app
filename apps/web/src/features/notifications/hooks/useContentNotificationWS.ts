import { useEffect } from 'react'
import { useWebSocketContext } from '@/features/chat/components/WebSocketProvider'
import { useNotificationsStore } from '../store/notificationsStore'

export function useContentNotificationWS() {
    const ws = useWebSocketContext()
    const fetchUnreadCounts = useNotificationsStore((s) => s.fetchUnreadCounts)

    useEffect(() => {
        if (!ws?.lastEvent) return
        if (ws.lastEvent.type !== 'content_notification') return

        // Refresh unread counts when we get a content notification via WS
        fetchUnreadCounts()
    }, [ws?.lastEvent, fetchUnreadCounts])
}
