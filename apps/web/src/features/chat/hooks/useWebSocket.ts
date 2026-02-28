/**
 * WebSocket hook for real-time chat communication
 * Connects to the backend WebSocket endpoint with auto-reconnect
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { WebSocketEvent } from '../types'

/**
 * Custom hook that manages a WebSocket connection with exponential backoff reconnection.
 *
 * - Connects to ws(s)://<host>/ws?token=<jwt>
 * - Auto-reconnects with exponential backoff (1s, 2s, 4s, ... max 30s)
 * - Provides sendEvent, lastEvent, and isConnected
 */
export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null)
    const reconnectDelay = useRef(1000)
    const isMounted = useRef(true)

    useEffect(() => {
        isMounted.current = true

        const connect = () => {
            if (!isMounted.current) return

            const token = localStorage.getItem('auth_token')
            if (!token) {
                // No token available — don't attempt connection or schedule reconnect
                return
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`)

            ws.onopen = () => {
                if (!isMounted.current) return
                setIsConnected(true)
                reconnectDelay.current = 1000
            }

            ws.onclose = () => {
                if (!isMounted.current) return
                setIsConnected(false)
                // Only reconnect if token still exists (user hasn't logged out)
                const currentToken = localStorage.getItem('auth_token')
                if (currentToken) {
                    setTimeout(connect, reconnectDelay.current)
                    reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
                }
            }

            ws.onmessage = (e) => {
                if (!isMounted.current) return
                try {
                    const event = JSON.parse(e.data) as WebSocketEvent
                    setLastEvent(event)
                } catch {
                    // Ignore malformed messages
                }
            }

            wsRef.current = ws
        }

        connect()

        return () => {
            isMounted.current = false
            wsRef.current?.close()
        }
    }, [])

    const sendEvent = useCallback((event: WebSocketEvent) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(event))
        }
    }, [])

    return { sendEvent, lastEvent, isConnected }
}
