/**
 * Утилиты для работы с real-time чатом через Supabase Realtime
 */

import { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { logger } from '@/utils/logger'

export interface Message {
    id: string
    sender_id: string
    receiver_id: string
    content: string
    created_at: string
    read_at: string | null
    is_deleted: boolean
}

export interface TypingEvent {
    userId: string
    isTyping: boolean
}

export interface ConnectionStatus {
    connected: boolean
    reconnecting: boolean
    error: string | null
}

// Callback для изменения статуса подключения
export type ConnectionStatusCallback = (status: ConnectionStatus) => void

/**
 * Подписка на новые сообщения с обработкой ошибок и переподключением
 */
export function subscribeToMessages(
    userId: string,
    otherUserId: string,
    onNewMessage: (message: Message) => void,
    onStatusChange?: ConnectionStatusCallback
): RealtimeChannel {
    const supabase = createClient()
    const channelName = `chat:${userId}:${otherUserId}`
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 5
    const INITIAL_RECONNECT_DELAY = 1000 // 1 секунда
    let reconnectTimeout: NodeJS.Timeout | null = null

    const updateStatus = (status: Partial<ConnectionStatus>) => {
        if (onStatusChange) {
            onStatusChange({
                connected: false,
                reconnecting: false,
                error: null,
                ...status,
            })
        }
    }

    let currentChannel: RealtimeChannel | null = null

    const subscribe = (): RealtimeChannel => {
        logger.debug('Chat Realtime: подписка на сообщения', { channelName, attempt: reconnectAttempts + 1 })

        // Удаляем предыдущий канал, если он существует
        if (currentChannel) {
            supabase.removeChannel(currentChannel)
        }

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `sender_id=eq.${otherUserId},receiver_id=eq.${userId}`,
                },
                (payload) => {
                    logger.debug('Chat Realtime: новое сообщение получено', { messageId: payload.new.id })
                    onNewMessage(payload.new as Message)
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    logger.debug('Chat Realtime: успешно подключено', { channelName })
                    reconnectAttempts = 0
                    updateStatus({ connected: true, reconnecting: false, error: null })
                    if (reconnectTimeout) {
                        clearTimeout(reconnectTimeout)
                        reconnectTimeout = null
                    }
                } else if (status === 'CHANNEL_ERROR') {
                    logger.error('Chat Realtime: ошибка канала', null, { channelName })
                    updateStatus({ connected: false, reconnecting: false, error: 'Ошибка подключения' })
                    
                    // Пытаемся переподключиться
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !reconnectTimeout) {
                        reconnectAttempts++
                        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1) // Экспоненциальная задержка
                        updateStatus({ reconnecting: true, error: `Переподключение через ${Math.ceil(delay / 1000)} сек...` })
                        
                        reconnectTimeout = setTimeout(() => {
                            reconnectTimeout = null
                            subscribe()
                        }, delay)
                    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                        updateStatus({ error: 'Не удалось подключиться. Обновите страницу.' })
                    }
                } else if (status === 'TIMED_OUT') {
                    logger.warn('Chat Realtime: таймаут подключения', { channelName })
                    updateStatus({ connected: false, reconnecting: true, error: 'Переподключение...' })
                    
                    // Пытаемся переподключиться
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !reconnectTimeout) {
                        reconnectAttempts++
                        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1)
                        
                        reconnectTimeout = setTimeout(() => {
                            reconnectTimeout = null
                            subscribe()
                        }, delay)
                    }
                } else if (status === 'CLOSED') {
                    logger.debug('Chat Realtime: канал закрыт', { channelName })
                    updateStatus({ connected: false, reconnecting: false })
                }
            })

        currentChannel = channel
        return channel
    }

    return subscribe()
}

/**
 * Подписка на события "печатает..."
 */
export function subscribeToTyping(
    userId: string,
    otherUserId: string,
    onTyping: (isTyping: boolean) => void
): RealtimeChannel {
    const supabase = createClient()
    const channelName = `typing:${userId}:${otherUserId}`

    logger.debug('Chat Realtime: подписка на события печатания', { channelName })

    const channel = supabase
        .channel(channelName)
        .on('broadcast', { event: 'typing' }, (payload) => {
            logger.debug('Chat Realtime: событие печатания', { payload })
            onTyping(payload.payload.isTyping || false)
        })
        .subscribe()

    return channel
}

/**
 * Отправка события "печатает..."
 */
export async function sendTypingEvent(
    userId: string,
    otherUserId: string,
    isTyping: boolean
): Promise<void> {
    const supabase = createClient()
    const channelName = `typing:${otherUserId}:${userId}`

    try {
        const channel = supabase.channel(channelName)
        await channel.subscribe()

        await channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, isTyping },
        })

        logger.debug('Chat Realtime: отправлено событие печатания', { userId, isTyping })
    } catch (error) {
        logger.error('Chat Realtime: ошибка отправки события печатания', error, { userId, isTyping })
    }
}

/**
 * Отписка от канала
 */
export function unsubscribeFromChannel(channel: RealtimeChannel): void {
    const supabase = createClient()
    supabase.removeChannel(channel)
    logger.debug('Chat Realtime: отписка от канала', { channel: channel.topic })
}

