'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocketContext } from '../components/WebSocketProvider'
import type { WebSocketEvent } from '../types'

// Close codes that indicate auth failure — no point reconnecting
const AUTH_FAILURE_CODES = [1008, 4401, 4403]

/**
 * Hook for WebSocket communication.
 * When inside a WebSocketProvider, delegates to the shared connection.
 * Falls back to creating its own connection when used outside the provider.
 */
export function useWebSocket() {
    const ctx = useWebSocketContext()

    // Fallback state for when used outside the provider
    const wsRef = useRef<WebSocket | null>(null)
    const [fallbackConnected, setFallbackConnected] = useState(false)
    const [fallbackLastEvent, setFallbackLastEvent] = useState<WebSocketEvent | null>(null)
    const reconnectDelay = useRef(1000)
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isMounted = useRef(true)

    useEffect(() => {
        // If context is available, don't create a standalone connection
        if (ctx) return

        isMounted.current = true

        const clearReconnectTimer = () => {
            if (reconnectTimer.current !== null) {
                clearTimeout(reconnectTimer.current)
                reconnectTimer.current = null
            }
        }

        const connect = () => {
            if (!isMounted.current) return

            const token = localStorage.getItem('auth_token')
            if (!token) return

            // Close any existing connection before creating a new one
            if (wsRef.current) {
                wsRef.current.onclose = null
                wsRef.current.close()
                wsRef.current = null
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`)

            ws.onopen = () => {
                if (!isMounted.current) return
                setFallbackConnected(true)
                reconnectDelay.current = 1000
            }

            ws.onclose = (e) => {
                if (!isMounted.current) return
                setFallbackConnected(false)

                if (AUTH_FAILURE_CODES.includes(e.code)) return
                if (e.code === 1006 && reconnectDelay.current > 8000) return

                const currentToken = localStorage.getItem('auth_token')
                if (currentToken && document.visibilityState === 'visible') {
                    clearReconnectTimer()
                    reconnectTimer.current = setTimeout(connect, reconnectDelay.current)
                    reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
                }
            }

            ws.onmessage = (e) => {
                if (!isMounted.current) return
                try {
                    const event = JSON.parse(e.data) as WebSocketEvent
                    setFallbackLastEvent(event)
                } catch {
                    // Ignore malformed messages
                }
            }

            wsRef.current = ws
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !wsRef.current?.OPEN) {
                reconnectDelay.current = 1000
                connect()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        connect()

        return () => {
            isMounted.current = false
            clearReconnectTimer()
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            wsRef.current?.close()
        }
    }, [ctx])

    const fallbackSendEvent = useCallback((event: WebSocketEvent) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(event))
        }
    }, [])

    if (ctx) {
        return { sendEvent: ctx.sendEvent, lastEvent: ctx.lastEvent, isConnected: ctx.isConnected }
    }

    return { sendEvent: fallbackSendEvent, lastEvent: fallbackLastEvent, isConnected: fallbackConnected }
}
