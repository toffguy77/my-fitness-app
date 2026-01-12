/**
 * Утилиты для работы с real-time чатом через Supabase Realtime
 */

import { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/client'
import { logger } from '@/utils/logger'
import { chatMetrics } from './metrics'
import { createChatLogger, ChatErrorType } from './logger'

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
    lastConnected?: Date
    reconnectAttempts?: number
    errorType?: 'network' | 'auth' | 'server' | 'timeout' | 'unknown'
}

// Callback для изменения статуса подключения
export type ConnectionStatusCallback = (status: ConnectionStatus) => void

/**
 * Категоризация типа ошибки подключения
 */
function categorizeConnectionError(status: string, error?: any): ConnectionStatus['errorType'] {
    switch (status) {
        case 'CHANNEL_ERROR':
            if (error?.message?.includes('auth') || error?.message?.includes('unauthorized')) {
                return 'auth'
            }
            if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
                return 'network'
            }
            return 'server'
        case 'TIMED_OUT':
            return 'timeout'
        default:
            return 'unknown'
    }
}

/**
 * Map connection error type to chat error type
 */
function mapToChatErrorType(errorType: ConnectionStatus['errorType']): ChatErrorType {
    switch (errorType) {
        case 'auth':
            return 'authentication_error'
        case 'network':
            return 'network_error'
        case 'server':
            return 'server_error'
        case 'timeout':
            return 'timeout_error'
        default:
            return 'connection_error'
    }
}

/**
 * Создание пользовательского сообщения об ошибке
 */
function createUserFriendlyErrorMessage(errorType: ConnectionStatus['errorType'], reconnectAttempts: number): string {
    switch (errorType) {
        case 'network':
            return reconnectAttempts > 2
                ? 'Проблемы с сетью. Проверьте подключение к интернету.'
                : 'Переподключение...'
        case 'auth':
            return 'Ошибка авторизации. Попробуйте обновить страницу.'
        case 'server':
            return reconnectAttempts > 3
                ? 'Проблемы с сервером. Попробуйте позже.'
                : 'Переподключение к серверу...'
        case 'timeout':
            return 'Превышено время ожидания. Переподключение...'
        default:
            return reconnectAttempts > 2
                ? 'Проблемы с подключением. Обновите страницу.'
                : 'Переподключение...'
    }
}

/**
 * Валидация синтаксиса фильтра для Supabase Realtime
 */
export function validateFilterSyntax(filter: string): void {
    if (process.env.NODE_ENV === 'development') {
        // Проверяем, что используется правильный синтаксис с .and. вместо запятой
        if (filter.includes(',') && !filter.includes('.and.')) {
            logger.error('Chat Realtime: неправильный синтаксис фильтра', new Error('Filter should use .and. instead of comma'), { filter })
            throw new Error(`Invalid filter syntax: ${filter}. Use .and. instead of comma for multiple conditions.`)
        }

        // Проверяем базовую структуру фильтра
        if (!filter.includes('=eq.')) {
            logger.warn('Chat Realtime: подозрительный синтаксис фильтра', { filter })
        }

        logger.debug('Chat Realtime: валидация фильтра прошла успешно', { filter })
    }
}

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

    // Create enhanced logger with user context
    const chatLogger = createChatLogger({
        userId,
        otherUserId,
        channelName,
        sessionId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    })

    const updateStatus = (status: Partial<ConnectionStatus>) => {
        if (onStatusChange) {
            const fullStatus: ConnectionStatus = {
                connected: false,
                reconnecting: false,
                error: null,
                reconnectAttempts,
                ...status,
            }

            // Логируем изменения статуса для отладки
            logger.debug('Chat Realtime: изменение статуса подключения', {
                channelName,
                oldStatus: { connected: false, reconnecting: false, error: null }, // Предыдущий статус можно сохранять отдельно
                newStatus: fullStatus,
            })

            // Enhanced logging with user context
            chatLogger.logEvent('subscription_created', 'Connection status changed', {
                connectionStatus: fullStatus,
                reconnectAttempts,
            })

            onStatusChange(fullStatus)
        }
    }

    let currentChannel: RealtimeChannel | null = null

    const subscribe = (): RealtimeChannel => {
        const operationId = `subscribe-${Date.now()}`
        chatLogger.startTimer(operationId)

        logger.debug('Chat Realtime: подписка на сообщения', { channelName, attempt: reconnectAttempts + 1 })
        chatLogger.logEvent('subscription_created', 'Starting message subscription', {
            attempt: reconnectAttempts + 1,
        })

        // Удаляем предыдущий канал, если он существует
        if (currentChannel) {
            supabase.removeChannel(currentChannel)
        }

        // Создаем и валидируем фильтр
        const filter = `sender_id=eq.${otherUserId}.and.receiver_id=eq.${userId}`
        try {
            validateFilterSyntax(filter)
            chatLogger.logEvent('filter_validation', 'Filter syntax validated successfully', {
                filter,
            })
        } catch (error) {
            chatLogger.logError('validation_error', 'Filter syntax validation failed', error, {
                filter,
            })
            throw error
        }

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter,
                },
                (payload) => {
                    logger.debug('Chat Realtime: новое сообщение получено', { messageId: payload.new.id })

                    // Record message delivery
                    const message = payload.new as Message
                    chatMetrics.recordMessageDelivered(message.id, message.sender_id, message.receiver_id)

                    // Enhanced logging
                    chatLogger.logEvent('message_received', 'New message received via realtime', {
                        messageId: message.id,
                        senderId: message.sender_id,
                        receiverId: message.receiver_id,
                    })

                    onNewMessage(message)
                }
            )
            .subscribe((status) => {
                logger.info('Chat Realtime: изменение статуса подписки', {
                    channelName,
                    status,
                    attempt: reconnectAttempts + 1,
                    userId,
                    otherUserId
                })

                if (status === 'SUBSCRIBED') {
                    chatLogger.endTimer(operationId, 'message_subscription', {
                        reconnectAttempts,
                    })

                    logger.info('Chat Realtime: успешно подключено', {
                        channelName,
                        reconnectAttempts: reconnectAttempts,
                        userId,
                        otherUserId
                    })

                    // Enhanced logging
                    chatLogger.logEvent('connection_established', 'Successfully connected to realtime channel', {
                        reconnectAttempts,
                    })

                    // Record successful connection
                    chatMetrics.recordConnectionEstablished(userId, otherUserId, channelName)

                    reconnectAttempts = 0
                    updateStatus({
                        connected: true,
                        reconnecting: false,
                        error: null,
                        lastConnected: new Date(),
                        errorType: undefined
                    })
                    if (reconnectTimeout) {
                        clearTimeout(reconnectTimeout)
                        reconnectTimeout = null
                    }
                } else if (status === 'CHANNEL_ERROR') {
                    const errorType = categorizeConnectionError(status)
                    const chatErrorType = mapToChatErrorType(errorType)
                    const userMessage = createUserFriendlyErrorMessage(errorType, reconnectAttempts)

                    logger.error('Chat Realtime: ошибка канала', new Error(`Channel error: ${status}`), {
                        channelName,
                        errorType,
                        reconnectAttempts,
                        userId,
                        otherUserId,
                        userMessage
                    })

                    // Enhanced error logging
                    chatLogger.logError(chatErrorType, 'Channel connection error occurred', new Error(`Channel error: ${status}`), {
                        reconnectAttempts,
                        userMessage,
                    })

                    // Record connection failure
                    chatMetrics.recordConnectionFailed(userId, otherUserId, channelName, errorType)

                    updateStatus({
                        connected: false,
                        reconnecting: false,
                        error: userMessage,
                        errorType
                    })

                    // Пытаемся переподключиться
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !reconnectTimeout) {
                        reconnectAttempts++

                        // Record reconnection attempt
                        chatMetrics.recordReconnectionAttempt(userId, otherUserId, channelName, reconnectAttempts)

                        // Enhanced logging for reconnection
                        chatLogger.logEvent('reconnection_attempt', 'Attempting to reconnect after channel error', {
                            attempt: reconnectAttempts,
                            maxAttempts: MAX_RECONNECT_ATTEMPTS,
                        })

                        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1)
                        const reconnectMessage = `Переподключение через ${Math.ceil(delay / 1000)} сек... (попытка ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`

                        logger.info('Chat Realtime: планирование переподключения', {
                            channelName,
                            attempt: reconnectAttempts,
                            delay,
                            maxAttempts: MAX_RECONNECT_ATTEMPTS
                        })

                        updateStatus({
                            reconnecting: true,
                            error: reconnectMessage,
                            errorType
                        })

                        reconnectTimeout = setTimeout(() => {
                            reconnectTimeout = null
                            logger.info('Chat Realtime: выполнение переподключения', {
                                channelName,
                                attempt: reconnectAttempts
                            })
                            subscribe()
                        }, delay)
                    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                        const finalErrorMessage = createUserFriendlyErrorMessage(errorType, reconnectAttempts)
                        logger.error('Chat Realtime: превышено максимальное количество попыток переподключения',
                            new Error('Max reconnect attempts reached'), {
                            channelName,
                            maxAttempts: MAX_RECONNECT_ATTEMPTS,
                            errorType,
                            finalMessage: finalErrorMessage
                        })
                        updateStatus({
                            error: finalErrorMessage,
                            errorType
                        })
                    }
                } else if (status === 'TIMED_OUT') {
                    const errorType = categorizeConnectionError(status)
                    const chatErrorType = mapToChatErrorType(errorType)
                    const userMessage = createUserFriendlyErrorMessage(errorType, reconnectAttempts)

                    logger.warn('Chat Realtime: таймаут подключения', {
                        channelName,
                        reconnectAttempts,
                        errorType,
                        userMessage
                    })

                    // Enhanced error logging
                    chatLogger.logError(chatErrorType, 'Connection timeout occurred', undefined, {
                        reconnectAttempts,
                        userMessage,
                    })

                    // Record connection failure due to timeout
                    chatMetrics.recordConnectionFailed(userId, otherUserId, channelName, errorType)

                    updateStatus({
                        connected: false,
                        reconnecting: true,
                        error: userMessage,
                        errorType
                    })

                    // Пытаемся переподключиться
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !reconnectTimeout) {
                        reconnectAttempts++

                        // Record reconnection attempt
                        chatMetrics.recordReconnectionAttempt(userId, otherUserId, channelName, reconnectAttempts)

                        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1)

                        reconnectTimeout = setTimeout(() => {
                            reconnectTimeout = null
                            logger.info('Chat Realtime: переподключение после таймаута', {
                                channelName,
                                attempt: reconnectAttempts
                            })
                            subscribe()
                        }, delay)
                    }
                } else if (status === 'CLOSED') {
                    logger.info('Chat Realtime: канал закрыт', {
                        channelName,
                        reconnectAttempts,
                        userId,
                        otherUserId
                    })

                    // Enhanced logging
                    chatLogger.logEvent('connection_closed', 'Realtime channel connection closed', {
                        reconnectAttempts,
                    })

                    // Record connection closed
                    chatMetrics.recordConnectionClosed(userId, otherUserId, channelName)

                    updateStatus({
                        connected: false,
                        reconnecting: false,
                        error: 'Соединение закрыто',
                        errorType: 'unknown'
                    })
                } else {
                    // Обработка неизвестных статусов
                    logger.warn('Chat Realtime: неизвестный статус подписки', {
                        channelName,
                        status,
                        reconnectAttempts
                    })
                    updateStatus({
                        connected: false,
                        reconnecting: false,
                        error: `Неизвестный статус: ${status}`,
                        errorType: 'unknown'
                    })
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

    // Create enhanced logger with user context
    const chatLogger = createChatLogger({
        userId,
        otherUserId,
        channelName,
    })

    logger.debug('Chat Realtime: подписка на события печатания', { channelName })
    chatLogger.logEvent('subscription_created', 'Subscribing to typing events', {})

    const channel = supabase
        .channel(channelName)
        .on('broadcast', { event: 'typing' }, (payload) => {
            logger.debug('Chat Realtime: событие печатания', { payload })
            chatLogger.logEvent('typing_started', 'Typing event received', {
                isTyping: payload.payload.isTyping || false,
            })
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

    // Create enhanced logger with user context
    const chatLogger = createChatLogger({
        userId,
        otherUserId,
        channelName,
    })

    const operationId = `typing-${Date.now()}`
    chatLogger.startTimer(operationId)

    try {
        logger.debug('Chat Realtime: начало отправки события печатания', {
            channelName,
            userId,
            otherUserId,
            isTyping
        })

        // Record typing event
        chatMetrics.recordTypingEvent(userId, otherUserId, isTyping)

        // Enhanced logging
        chatLogger.logEvent(isTyping ? 'typing_started' : 'typing_stopped', 'Sending typing event', {
            isTyping,
        })

        const channel = supabase.channel(channelName)
        await channel.subscribe()

        await channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, isTyping },
        })

        logger.debug('Chat Realtime: событие печатания успешно отправлено', {
            channelName,
            userId,
            isTyping
        })

        // Log successful completion
        chatLogger.endTimer(operationId, 'typing_event_send', {
            isTyping,
        })
    } catch (error) {
        // Категоризируем ошибку для лучшего понимания
        const errorType = error instanceof Error ? error.name : 'UnknownError'
        const errorMessage = error instanceof Error ? error.message : String(error)

        logger.error('Chat Realtime: ошибка отправки события печатания', error, {
            channelName,
            userId,
            otherUserId,
            isTyping,
            errorType,
            errorMessage
        })

        // Enhanced error logging
        chatLogger.logError('network_error', 'Failed to send typing event', error, {
            isTyping,
            errorType,
            errorMessage,
        })

        // Не пробрасываем ошибку дальше, так как typing events не критичны
        // Но логируем для мониторинга
    }
}

/**
 * Record message sent event (to be called when sending a message)
 */
export function recordMessageSent(messageId: string, senderId: string, receiverId: string): void {
    chatMetrics.recordMessageSent(messageId, senderId, receiverId)
}

/**
 * Record message send failure (to be called when message sending fails)
 */
export function recordMessageSendFailed(
    messageId: string,
    senderId: string,
    receiverId: string,
    errorType: string = 'unknown'
): void {
    chatMetrics.recordMessageDeliveryFailed(messageId, senderId, receiverId, errorType)
}

/**
 * Отписка от канала
 */
export function unsubscribeFromChannel(channel: RealtimeChannel): void {
    try {
        const supabase = createClient()
        const channelTopic = channel.topic

        // Create enhanced logger for unsubscribe operation
        const chatLogger = createChatLogger({
            channelName: channelTopic,
        })

        logger.debug('Chat Realtime: начало отписки от канала', { channelTopic })
        chatLogger.logEvent('subscription_destroyed', 'Starting channel unsubscription', {})

        // Record connection closed if this is a message channel
        if (channelTopic.startsWith('chat:')) {
            const parts = channelTopic.split(':')
            if (parts.length >= 3) {
                const userId = parts[1]
                const otherUserId = parts[2]
                chatMetrics.recordConnectionClosed(userId, otherUserId, channelTopic)

                // Update logger context with user info
                chatLogger.logEvent('connection_closed', 'Recording connection closure for chat channel', {
                    userId,
                    otherUserId,
                })
            }
        }

        supabase.removeChannel(channel)

        logger.debug('Chat Realtime: успешная отписка от канала', { channelTopic })
        chatLogger.logEvent('subscription_destroyed', 'Successfully unsubscribed from channel', {})
    } catch (error) {
        const channelTopic = channel?.topic || 'unknown'
        const chatLogger = createChatLogger({
            channelName: channelTopic,
        })

        logger.error('Chat Realtime: ошибка отписки от канала', error, {
            channelTopic
        })

        chatLogger.logError('unknown_error', 'Failed to unsubscribe from channel', error, {})

        // Не пробрасываем ошибку, так как отписка не критична для работы приложения
    }
}

