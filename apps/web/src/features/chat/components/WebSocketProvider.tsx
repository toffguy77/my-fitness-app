'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { WebSocketEvent } from '../types'

interface WebSocketContextValue {
    sendEvent: (event: WebSocketEvent) => void
    lastEvent: WebSocketEvent | null
    isConnected: boolean
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

// Close codes that indicate auth failure — no point reconnecting
const AUTH_FAILURE_CODES = [1008, 4401, 4403]

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const wsRef = useRef<WebSocket | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null)
    const reconnectDelay = useRef(1000)
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isMounted = useRef(true)

    useEffect(() => {
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
                setIsConnected(true)
                reconnectDelay.current = 1000
            }

            ws.onclose = (e) => {
                if (!isMounted.current) return
                setIsConnected(false)

                // Don't reconnect on auth failures — token is invalid
                if (AUTH_FAILURE_CODES.includes(e.code)) return

                // Don't reconnect if the connection never opened (immediate reject)
                // This prevents a storm when the server is down or rejecting
                if (e.code === 1006 && reconnectDelay.current > 8000) return

                // Only reconnect if tab is visible and token exists
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
                    setLastEvent(event)
                } catch {
                    // Ignore malformed messages
                }
            }

            wsRef.current = ws
        }

        // Reconnect when tab becomes visible again
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
    }, [])

    const sendEvent = useCallback((event: WebSocketEvent) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(event))
        }
    }, [])

    return (
        <WebSocketContext value={{ sendEvent, lastEvent, isConnected }}>
            {children}
        </WebSocketContext>
    )
}

export function useWebSocketContext(): WebSocketContextValue | null {
    return useContext(WebSocketContext)
}
