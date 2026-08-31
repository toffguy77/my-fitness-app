'use client'

import { useWebSocketContext } from '../components/WebSocketProvider'
import type { WebSocketEvent } from '../types'

interface UseWebSocketResult {
    sendEvent: (event: WebSocketEvent) => void
    lastEvent: WebSocketEvent | null
    isConnected: boolean
}

const noop = () => {}

/**
 * Access to the shared WebSocket connection.
 *
 * This used to carry a full fallback implementation — its own connect,
 * reconnect-with-backoff and visibility handling — duplicating
 * `WebSocketProvider` almost line for line. That fallback could open a second
 * socket for the same user, and in practice never ran: every screen using chat
 * sits inside a provider (DashboardLayout, CuratorLayout).
 *
 * One connection per user is now a property of the provider, and this hook is
 * just the accessor.
 */
export function useWebSocket(): UseWebSocketResult {
    const ctx = useWebSocketContext()

    if (!ctx) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                'useWebSocket() was called outside <WebSocketProvider>. ' +
                    'Real-time updates are inactive for this subtree; wrap it in a provider.',
            )
        }
        return { sendEvent: noop, lastEvent: null, isConnected: false }
    }

    return { sendEvent: ctx.sendEvent, lastEvent: ctx.lastEvent, isConnected: ctx.isConnected }
}
