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

export function WebSocketProvider({ children }: { children: ReactNode }) {
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
            if (!token) return

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

    return (
        <WebSocketContext value={{ sendEvent, lastEvent, isConnected }}>
            {children}
        </WebSocketContext>
    )
}

export function useWebSocketContext(): WebSocketContextValue | null {
    return useContext(WebSocketContext)
}
