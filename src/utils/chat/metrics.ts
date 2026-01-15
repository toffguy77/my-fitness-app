/**
 * Chat system metrics collection
 * Tracks message delivery, connection status, and performance metrics
 */

import { metricsCollector } from '@/utils/metrics/collector'
import { logger } from '@/utils/logger'

export interface ChatMetrics {
    // Message delivery metrics
    messagesSent: number
    messagesDelivered: number
    messagesFailedToSend: number

    // Connection metrics
    connectionsEstablished: number
    connectionsFailed: number
    reconnectionAttempts: number

    // Performance metrics
    averageDeliveryTime: number
    connectionUptime: number
}

export interface MessageDeliveryMetrics {
    messageId: string
    senderId: string
    receiverId: string
    sentAt: Date
    deliveredAt?: Date
    failedAt?: Date
    deliveryTimeMs?: number
    errorType?: string
}

export interface ConnectionMetrics {
    userId: string
    otherUserId: string
    channelName: string
    connectedAt: Date
    disconnectedAt?: Date
    connectionDurationMs?: number
    errorType?: string
    reconnectAttempts: number
}

/**
 * Chat Metrics Collector
 * Provides methods to track chat system performance and reliability
 */
export class ChatMetricsCollector {
    private messageDeliveryTimes: Map<string, number> = new Map()
    private connectionStartTimes: Map<string, number> = new Map()

    /**
     * Record message sent event
     */
    recordMessageSent(messageId: string, senderId: string, receiverId: string): void {
        try {
            const timestamp = Date.now()
            this.messageDeliveryTimes.set(messageId, timestamp)

            metricsCollector.counter(
                'chat_messages_sent_total',
                'Total number of chat messages sent',
                {
                    sender_id: senderId,
                    receiver_id: receiverId,
                }
            )

            logger.debug('Chat Metrics: сообщение отправлено', {
                messageId,
                senderId,
                receiverId,
                timestamp
            })
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики отправки сообщения', error, {
                messageId,
                senderId,
                receiverId
            })
        }
    }

    /**
     * Record message delivered event
     */
    recordMessageDelivered(messageId: string, senderId: string, receiverId: string): void {
        try {
            const deliveredAt = Date.now()
            const sentAt = this.messageDeliveryTimes.get(messageId)

            metricsCollector.counter(
                'chat_messages_delivered_total',
                'Total number of chat messages successfully delivered',
                {
                    sender_id: senderId,
                    receiver_id: receiverId,
                }
            )

            // Calculate delivery time if we have the sent timestamp
            if (sentAt) {
                const deliveryTimeMs = deliveredAt - sentAt
                this.messageDeliveryTimes.delete(messageId) // Clean up

                metricsCollector.histogram(
                    'chat_message_delivery_duration_seconds',
                    'Time taken to deliver chat messages',
                    deliveryTimeMs / 1000, // Convert to seconds
                    {
                        sender_id: senderId,
                        receiver_id: receiverId,
                    }
                )

                // Update success rate gauge
                this.updateMessageSuccessRate()

                logger.debug('Chat Metrics: сообщение доставлено', {
                    messageId,
                    senderId,
                    receiverId,
                    deliveryTimeMs,
                    deliveredAt
                })
            } else {
                logger.warn('Chat Metrics: не найдено время отправки для сообщения', {
                    messageId,
                    senderId,
                    receiverId
                })
            }
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики доставки сообщения', error, {
                messageId,
                senderId,
                receiverId
            })
        }
    }

    /**
     * Record message delivery failure
     */
    recordMessageDeliveryFailed(
        messageId: string,
        senderId: string,
        receiverId: string,
        errorType: string = 'unknown'
    ): void {
        try {
            const failedAt = Date.now()
            const sentAt = this.messageDeliveryTimes.get(messageId)

            metricsCollector.counter(
                'chat_messages_failed_total',
                'Total number of chat messages that failed to deliver',
                {
                    sender_id: senderId,
                    receiver_id: receiverId,
                    error_type: errorType,
                }
            )

            // Clean up delivery time tracking
            if (sentAt) {
                this.messageDeliveryTimes.delete(messageId)
            }

            // Update success rate gauge
            this.updateMessageSuccessRate()

            logger.error('Chat Metrics: ошибка доставки сообщения', new Error(`Message delivery failed: ${errorType}`), {
                messageId,
                senderId,
                receiverId,
                errorType,
                failedAt
            })
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики неудачной доставки', error, {
                messageId,
                senderId,
                receiverId,
                errorType
            })
        }
    }

    /**
     * Record connection established
     */
    recordConnectionEstablished(userId: string, otherUserId: string, channelName: string): void {
        try {
            const timestamp = Date.now()
            this.connectionStartTimes.set(channelName, timestamp)

            metricsCollector.counter(
                'chat_connections_established_total',
                'Total number of chat connections established',
                {
                    user_id: userId,
                    other_user_id: otherUserId,
                }
            )

            // Track current active connections
            metricsCollector.gaugeInc(
                'chat_active_connections',
                'Number of currently active chat connections',
                {
                    user_id: userId,
                }
            )

            // Update connection success rate
            this.updateConnectionSuccessRate()

            logger.info('Chat Metrics: соединение установлено', {
                userId,
                otherUserId,
                channelName,
                timestamp
            })
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики установки соединения', error, {
                userId,
                otherUserId,
                channelName
            })
        }
    }

    /**
     * Record connection failed
     */
    recordConnectionFailed(
        userId: string,
        otherUserId: string,
        channelName: string,
        errorType: string = 'unknown'
    ): void {
        try {
            metricsCollector.counter(
                'chat_connections_failed_total',
                'Total number of chat connections that failed',
                {
                    user_id: userId,
                    other_user_id: otherUserId,
                    error_type: errorType,
                }
            )

            // Update connection success rate
            this.updateConnectionSuccessRate()

            logger.error('Chat Metrics: ошибка соединения', new Error(`Connection failed: ${errorType}`), {
                userId,
                otherUserId,
                channelName,
                errorType
            })
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики неудачного соединения', error, {
                userId,
                otherUserId,
                channelName,
                errorType
            })
        }
    }

    /**
     * Record connection closed
     */
    recordConnectionClosed(userId: string, otherUserId: string, channelName: string): void {
        try {
            const closedAt = Date.now()
            const connectedAt = this.connectionStartTimes.get(channelName)

            // Track connection duration if we have start time
            if (connectedAt) {
                const durationMs = closedAt - connectedAt
                this.connectionStartTimes.delete(channelName) // Clean up

                metricsCollector.histogram(
                    'chat_connection_duration_seconds',
                    'Duration of chat connections',
                    durationMs / 1000, // Convert to seconds
                    {
                        user_id: userId,
                        other_user_id: otherUserId,
                    }
                )

                logger.debug('Chat Metrics: соединение закрыто', {
                    userId,
                    otherUserId,
                    channelName,
                    durationMs,
                    closedAt
                })
            }

            // Decrease active connections count
            metricsCollector.gaugeDec(
                'chat_active_connections',
                'Number of currently active chat connections',
                {
                    user_id: userId,
                }
            )
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики закрытия соединения', error, {
                userId,
                otherUserId,
                channelName
            })
        }
    }

    /**
     * Record reconnection attempt
     */
    recordReconnectionAttempt(
        userId: string,
        otherUserId: string,
        channelName: string,
        attemptNumber: number
    ): void {
        try {
            metricsCollector.counter(
                'chat_reconnection_attempts_total',
                'Total number of chat reconnection attempts',
                {
                    user_id: userId,
                    other_user_id: otherUserId,
                    attempt_number: String(attemptNumber),
                }
            )

            logger.info('Chat Metrics: попытка переподключения', {
                userId,
                otherUserId,
                channelName,
                attemptNumber
            })
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики попытки переподключения', error, {
                userId,
                otherUserId,
                channelName,
                attemptNumber
            })
        }
    }

    /**
     * Record typing event
     */
    recordTypingEvent(userId: string, otherUserId: string, isTyping: boolean): void {
        try {
            metricsCollector.counter(
                'chat_typing_events_total',
                'Total number of typing events',
                {
                    user_id: userId,
                    other_user_id: otherUserId,
                    is_typing: String(isTyping),
                }
            )

            logger.debug('Chat Metrics: событие печатания', {
                userId,
                otherUserId,
                isTyping
            })
        } catch (error) {
            logger.error('Chat Metrics: ошибка записи метрики события печатания', error, {
                userId,
                otherUserId,
                isTyping
            })
        }
    }

    /**
     * Update message success rate gauge
     */
    private updateMessageSuccessRate(): void {
        try {
            const sentMetrics = metricsCollector.getMetricsByName('chat_messages_sent_total')
            const deliveredMetrics = metricsCollector.getMetricsByName('chat_messages_delivered_total')
            const failedMetrics = metricsCollector.getMetricsByName('chat_messages_failed_total')

            const totalSent = sentMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const totalDelivered = deliveredMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const totalFailed = failedMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)

            const totalProcessed = totalDelivered + totalFailed
            const successRate = totalProcessed > 0 ? (totalDelivered / totalProcessed) * 100 : 100

            metricsCollector.gauge(
                'chat_message_success_rate_percent',
                'Percentage of successfully delivered messages',
                successRate
            )
        } catch (error) {
            logger.error('Chat Metrics: ошибка обновления коэффициента успешности сообщений', error)
        }
    }

    /**
     * Update connection success rate gauge
     */
    private updateConnectionSuccessRate(): void {
        try {
            const establishedMetrics = metricsCollector.getMetricsByName('chat_connections_established_total')
            const failedMetrics = metricsCollector.getMetricsByName('chat_connections_failed_total')

            const totalEstablished = establishedMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const totalFailed = failedMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)

            const totalAttempts = totalEstablished + totalFailed
            const successRate = totalAttempts > 0 ? (totalEstablished / totalAttempts) * 100 : 100

            metricsCollector.gauge(
                'chat_connection_success_rate_percent',
                'Percentage of successful chat connections',
                successRate
            )
        } catch (error) {
            logger.error('Chat Metrics: ошибка обновления коэффициента успешности соединений', error)
        }
    }

    /**
     * Get current chat metrics summary
     */
    getChatMetricsSummary(): ChatMetrics {
        try {
            const sentMetrics = metricsCollector.getMetricsByName('chat_messages_sent_total')
            const deliveredMetrics = metricsCollector.getMetricsByName('chat_messages_delivered_total')
            const failedMetrics = metricsCollector.getMetricsByName('chat_messages_failed_total')
            const establishedMetrics = metricsCollector.getMetricsByName('chat_connections_established_total')
            const connectionFailedMetrics = metricsCollector.getMetricsByName('chat_connections_failed_total')
            const reconnectMetrics = metricsCollector.getMetricsByName('chat_reconnection_attempts_total')
            const deliveryTimeMetrics = metricsCollector.getMetricsByName('chat_message_delivery_duration_seconds')
            const connectionDurationMetrics = metricsCollector.getMetricsByName('chat_connection_duration_seconds')

            const messagesSent = sentMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const messagesDelivered = deliveredMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const messagesFailedToSend = failedMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const connectionsEstablished = establishedMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const connectionsFailed = connectionFailedMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)
            const reconnectionAttempts = reconnectMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)

            // Calculate average delivery time
            let averageDeliveryTime = 0
            if (deliveryTimeMetrics.length > 0) {
                const totalDeliveryTime = deliveryTimeMetrics.reduce((sum, metric) => {
                    if (metric.type === 'histogram') {
                        return sum + metric.sum
                    }
                    return sum
                }, 0)
                const totalDeliveries = deliveryTimeMetrics.reduce((sum, metric) => {
                    if (metric.type === 'histogram') {
                        return sum + metric.count
                    }
                    return sum
                }, 0)
                averageDeliveryTime = totalDeliveries > 0 ? totalDeliveryTime / totalDeliveries : 0
            }

            // Calculate average connection uptime
            let connectionUptime = 0
            if (connectionDurationMetrics.length > 0) {
                const totalUptime = connectionDurationMetrics.reduce((sum, metric) => {
                    if (metric.type === 'histogram') {
                        return sum + metric.sum
                    }
                    return sum
                }, 0)
                const totalConnections = connectionDurationMetrics.reduce((sum, metric) => {
                    if (metric.type === 'histogram') {
                        return sum + metric.count
                    }
                    return sum
                }, 0)
                connectionUptime = totalConnections > 0 ? totalUptime / totalConnections : 0
            }

            return {
                messagesSent,
                messagesDelivered,
                messagesFailedToSend,
                connectionsEstablished,
                connectionsFailed,
                reconnectionAttempts,
                averageDeliveryTime,
                connectionUptime,
            }
        } catch (error) {
            logger.error('Chat Metrics: ошибка получения сводки метрик', error)
            return {
                messagesSent: 0,
                messagesDelivered: 0,
                messagesFailedToSend: 0,
                connectionsEstablished: 0,
                connectionsFailed: 0,
                reconnectionAttempts: 0,
                averageDeliveryTime: 0,
                connectionUptime: 0,
            }
        }
    }

    /**
     * Clear all tracking data (useful for testing)
     */
    clear(): void {
        this.messageDeliveryTimes.clear()
        this.connectionStartTimes.clear()
    }
}

// Singleton instance
export const chatMetrics = new ChatMetricsCollector()
