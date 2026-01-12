/**
 * Tests for chat monitoring and metrics functionality
 */

import { chatMetrics, ChatMetricsCollector } from '../chat/metrics'
import { chatMonitor, ChatSystemMonitor } from '../chat/monitoring'
import { createChatLogger, ChatLogger } from '../chat/logger'
import { metricsCollector } from '../metrics/collector'

describe('Chat Monitoring and Metrics', () => {
    beforeEach(() => {
        // Clear metrics before each test
        metricsCollector.clear()
        chatMetrics.clear()
    })

    describe('ChatMetricsCollector', () => {
        it('should record message sent and delivered events', () => {
            const messageId = 'test-message-1'
            const senderId = 'user-1'
            const receiverId = 'user-2'

            // Record message sent
            chatMetrics.recordMessageSent(messageId, senderId, receiverId)

            // Record message delivered
            chatMetrics.recordMessageDelivered(messageId, senderId, receiverId)

            const summary = chatMetrics.getChatMetricsSummary()
            expect(summary.messagesSent).toBe(1)
            expect(summary.messagesDelivered).toBe(1)
            expect(summary.messagesFailedToSend).toBe(0)
        })

        it('should record connection events', () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'
            const channelName = 'chat:user-1:user-2'

            // Record connection established
            chatMetrics.recordConnectionEstablished(userId, otherUserId, channelName)

            // Record connection closed
            chatMetrics.recordConnectionClosed(userId, otherUserId, channelName)

            const summary = chatMetrics.getChatMetricsSummary()
            expect(summary.connectionsEstablished).toBe(1)
            expect(summary.connectionsFailed).toBe(0)
        })

        it('should record message delivery failures', () => {
            const messageId = 'test-message-1'
            const senderId = 'user-1'
            const receiverId = 'user-2'

            // Record message sent
            chatMetrics.recordMessageSent(messageId, senderId, receiverId)

            // Record message delivery failure
            chatMetrics.recordMessageDeliveryFailed(messageId, senderId, receiverId, 'network_error')

            const summary = chatMetrics.getChatMetricsSummary()
            expect(summary.messagesSent).toBe(1)
            expect(summary.messagesDelivered).toBe(0)
            expect(summary.messagesFailedToSend).toBe(1)
        })

        it('should record reconnection attempts', () => {
            const userId = 'user-1'
            const otherUserId = 'user-2'
            const channelName = 'chat:user-1:user-2'

            // Record multiple reconnection attempts
            chatMetrics.recordReconnectionAttempt(userId, otherUserId, channelName, 1)
            chatMetrics.recordReconnectionAttempt(userId, otherUserId, channelName, 2)

            const summary = chatMetrics.getChatMetricsSummary()
            expect(summary.reconnectionAttempts).toBe(2)
        })
    })

    describe('ChatLogger', () => {
        it('should create logger with user context', () => {
            const logger = createChatLogger({
                userId: 'user-1',
                otherUserId: 'user-2',
                channelName: 'chat:user-1:user-2',
            })

            expect(logger).toBeInstanceOf(ChatLogger)
        })

        it('should log events with structured context', () => {
            const logger = createChatLogger({
                userId: 'user-1',
                otherUserId: 'user-2',
            })

            // This should not throw
            expect(() => {
                logger.logEvent('message_sent', 'Test message sent', {
                    messageId: 'test-message-1',
                })
            }).not.toThrow()
        })

        it('should log errors with categorization', () => {
            const logger = createChatLogger({
                userId: 'user-1',
                otherUserId: 'user-2',
            })

            // This should not throw
            expect(() => {
                logger.logError('connection_error', 'Test connection error', new Error('Test error'))
            }).not.toThrow()
        })

        it('should track performance metrics', () => {
            const logger = createChatLogger({
                userId: 'user-1',
                otherUserId: 'user-2',
            })

            const operationId = 'test-operation'
            logger.startTimer(operationId)

            // Simulate some work
            setTimeout(() => {
                const duration = logger.endTimer(operationId, 'test_operation')
                expect(duration).toBeGreaterThan(0)
            }, 10)
        })
    })

    describe('ChatSystemMonitor', () => {
        it('should get health status', () => {
            const monitor = new ChatSystemMonitor()
            const health = monitor.getHealthStatus()

            expect(health).toHaveProperty('status')
            expect(health).toHaveProperty('messageDeliveryRate')
            expect(health).toHaveProperty('connectionSuccessRate')
            expect(health).toHaveProperty('averageDeliveryTime')
            expect(health).toHaveProperty('activeConnections')
            expect(health).toHaveProperty('criticalErrors')
            expect(health).toHaveProperty('lastUpdated')
        })

        it('should get metrics summary', () => {
            const monitor = new ChatSystemMonitor()
            const summary = monitor.getMetricsSummary()

            expect(summary).toHaveProperty('messageMetrics')
            expect(summary).toHaveProperty('connectionMetrics')
            expect(summary).toHaveProperty('performanceMetrics')
            expect(summary).toHaveProperty('errorMetrics')
            expect(summary).toHaveProperty('timestamp')
        })

        it('should calculate health status based on metrics', () => {
            const monitor = new ChatSystemMonitor()

            // Record some successful operations
            chatMetrics.recordMessageSent('msg-1', 'user-1', 'user-2')
            chatMetrics.recordMessageDelivered('msg-1', 'user-1', 'user-2')
            chatMetrics.recordConnectionEstablished('user-1', 'user-2', 'chat:user-1:user-2')

            const health = monitor.getHealthStatus()
            expect(health.status).toBe('healthy')
            expect(health.messageDeliveryRate).toBe(100)
            expect(health.connectionSuccessRate).toBe(100)
        })

        it('should detect degraded health status', () => {
            const monitor = new ChatSystemMonitor()

            // Record some failures
            chatMetrics.recordMessageSent('msg-1', 'user-1', 'user-2')
            chatMetrics.recordMessageDeliveryFailed('msg-1', 'user-1', 'user-2', 'network_error')
            chatMetrics.recordConnectionFailed('user-1', 'user-2', 'chat:user-1:user-2', 'timeout')

            const health = monitor.getHealthStatus()
            expect(health.status).toBe('unhealthy')
            expect(health.messageDeliveryRate).toBe(0)
            expect(health.connectionSuccessRate).toBe(0)
        })

        it('should start and stop health checks', () => {
            const monitor = new ChatSystemMonitor()

            // This should not throw
            expect(() => {
                monitor.startHealthChecks(1000)
                monitor.stopHealthChecks()
            }).not.toThrow()
        })

        it('should reset metrics', () => {
            const monitor = new ChatSystemMonitor()

            // Add some metrics
            chatMetrics.recordMessageSent('msg-1', 'user-1', 'user-2')
            chatMetrics.recordConnectionEstablished('user-1', 'user-2', 'chat:user-1:user-2')

            // Reset metrics
            monitor.resetMetrics()

            const summary = monitor.getMetricsSummary()
            expect(summary.messageMetrics.sent).toBe(0)
            expect(summary.connectionMetrics.established).toBe(0)
        })
    })

    describe('Integration', () => {
        it('should integrate metrics, logging, and monitoring', () => {
            const logger = createChatLogger({
                userId: 'user-1',
                otherUserId: 'user-2',
                channelName: 'chat:user-1:user-2',
            })

            // Record some chat activity
            chatMetrics.recordMessageSent('msg-1', 'user-1', 'user-2')
            logger.logEvent('message_sent', 'Message sent successfully', {
                messageId: 'msg-1',
            })

            chatMetrics.recordMessageDelivered('msg-1', 'user-1', 'user-2')
            logger.logEvent('message_delivered', 'Message delivered successfully', {
                messageId: 'msg-1',
            })

            chatMetrics.recordConnectionEstablished('user-1', 'user-2', 'chat:user-1:user-2')
            logger.logEvent('connection_established', 'Connection established successfully')

            // Check monitoring
            const health = chatMonitor.getHealthStatus()
            const summary = chatMonitor.getMetricsSummary()

            expect(health.status).toBe('healthy')
            expect(summary.messageMetrics.sent).toBe(1)
            expect(summary.messageMetrics.delivered).toBe(1)
            expect(summary.connectionMetrics.established).toBe(1)
        })
    })
})