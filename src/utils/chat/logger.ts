/**
 * Enhanced structured logging for chat system
 * Provides user context, error categorization, and performance metrics
 */

import { logger } from '@/utils/logger'
import { metricsCollector } from '@/utils/metrics/collector'

export interface ChatLogContext {
    userId?: string
    otherUserId?: string
    channelName?: string
    messageId?: string
    sessionId?: string
    userAgent?: string
    connectionId?: string
    performanceMetrics?: PerformanceMetrics
    // Monitoring fields
    messageDeliveryRate?: number
    status?: string
    intervalMs?: number
    connectionStatus?: string | any
    attempt?: number
    filter?: string
    senderId?: string
    receiverId?: string
    reconnectAttempts?: number
    isTyping?: boolean
    connectionSuccessRate?: number
    userMessage?: any
    maxAttempts?: number
    errorType?: string
    averageDeliveryTime?: number
    activeConnections?: number
    errorMessage?: string
    criticalErrors?: number
}

export interface PerformanceMetrics {
    startTime?: number
    endTime?: number
    duration?: number
    memoryUsage?: number
    cpuUsage?: number
}

export interface ChatErrorContext extends ChatLogContext {
    errorType: ChatErrorType
    errorCode?: string
    stackTrace?: string
    userImpact: 'low' | 'medium' | 'high' | 'critical'
    retryable: boolean
}

export type ChatErrorType =
    | 'connection_error'
    | 'message_delivery_error'
    | 'authentication_error'
    | 'validation_error'
    | 'network_error'
    | 'server_error'
    | 'timeout_error'
    | 'permission_error'
    | 'rate_limit_error'
    | 'unknown_error'

export type ChatEventType =
    | 'connection_established'
    | 'connection_closed'
    | 'message_sent'
    | 'message_received'
    | 'message_delivered'
    | 'typing_started'
    | 'typing_stopped'
    | 'reconnection_attempt'
    | 'subscription_created'
    | 'subscription_destroyed'
    | 'filter_validation'
    | 'performance_measurement'

/**
 * Enhanced Chat Logger
 * Provides structured logging with user context and performance metrics
 */
export class ChatLogger {
    private baseContext: ChatLogContext
    private performanceTimers: Map<string, number> = new Map()

    constructor(baseContext: ChatLogContext = {}) {
        this.baseContext = baseContext
    }

    /**
     * Create a child logger with additional context
     */
    child(additionalContext: ChatLogContext): ChatLogger {
        return new ChatLogger({
            ...this.baseContext,
            ...additionalContext,
        })
    }

    /**
     * Log chat events with structured context
     */
    logEvent(
        eventType: ChatEventType,
        message: string,
        context: ChatLogContext = {}
    ): void {
        const fullContext = this.buildFullContext(context, {
            eventType,
            timestamp: new Date().toISOString(),
        })

        // Record event metrics
        this.recordEventMetrics(eventType, fullContext)

        logger.info(`[Chat Event: ${eventType}] ${message}`, fullContext)
    }

    /**
     * Log chat errors with categorization and user impact assessment
     */
    logError(
        errorType: ChatErrorType,
        message: string,
        error?: Error | unknown,
        context: ChatLogContext = {}
    ): void {
        const errorContext = this.buildErrorContext(errorType, error, context)
        const fullContext = this.buildFullContext(errorContext, {
            timestamp: new Date().toISOString(),
        })

        // Record error metrics
        this.recordErrorMetrics(errorType, errorContext)

        // Log with appropriate level based on user impact
        switch (errorContext.userImpact) {
            case 'critical':
                logger.error(`[Chat Critical Error: ${errorType}] ${message}`, error, fullContext)
                break
            case 'high':
                logger.error(`[Chat Error: ${errorType}] ${message}`, error, fullContext)
                break
            case 'medium':
                logger.warn(`[Chat Warning: ${errorType}] ${message}`, fullContext)
                break
            case 'low':
                logger.info(`[Chat Info: ${errorType}] ${message}`, fullContext)
                break
        }
    }

    /**
     * Log performance metrics
     */
    logPerformance(
        operation: string,
        metrics: PerformanceMetrics,
        context: ChatLogContext = {}
    ): void {
        const fullContext = this.buildFullContext(context, {
            operation,
            performanceMetrics: metrics,
            timestamp: new Date().toISOString(),
        })

        // Record performance metrics
        if (metrics.duration !== undefined) {
            metricsCollector.histogram(
                'chat_operation_duration_seconds',
                'Duration of chat operations',
                metrics.duration / 1000, // Convert to seconds
                {
                    operation,
                    user_id: String(fullContext.userId || 'unknown'),
                }
            )
        }

        logger.debug(`[Chat Performance: ${operation}] Operation completed`, fullContext)
    }

    /**
     * Start performance timer for an operation
     */
    startTimer(operationId: string): void {
        this.performanceTimers.set(operationId, Date.now())
    }

    /**
     * End performance timer and log metrics
     */
    endTimer(
        operationId: string,
        operation: string,
        context: ChatLogContext = {}
    ): number {
        const startTime = this.performanceTimers.get(operationId)
        if (!startTime) {
            this.logError(
                'unknown_error',
                `Performance timer not found for operation: ${operationId}`,
                undefined,
                context
            )
            return 0
        }

        const endTime = Date.now()
        const duration = endTime - startTime
        this.performanceTimers.delete(operationId)

        const metrics: PerformanceMetrics = {
            startTime,
            endTime,
            duration,
        }

        // Add memory usage if available
        if (typeof process !== 'undefined' && process.memoryUsage) {
            try {
                const memUsage = process.memoryUsage()
                metrics.memoryUsage = memUsage.heapUsed
            } catch {
                // Ignore if memory usage is not available
            }
        }

        this.logPerformance(operation, metrics, context)
        return duration
    }

    /**
     * Log user action with context
     */
    logUserAction(
        action: string,
        userId: string,
        context: ChatLogContext = {}
    ): void {
        const fullContext = this.buildFullContext(context, {
            userId,
            action,
            timestamp: new Date().toISOString(),
        })

        // Record user action metrics
        metricsCollector.counter(
            'chat_user_actions_total',
            'Total number of chat user actions',
            {
                action,
                user_id: userId,
            }
        )

        logger.userAction(`[Chat] ${action}`, fullContext)
    }

    /**
     * Log debug information with context
     */
    debug(message: string, context: ChatLogContext = {}): void {
        const fullContext = this.buildFullContext(context, {
            timestamp: new Date().toISOString(),
        })

        logger.debug(`[Chat Debug] ${message}`, fullContext)
    }

    /**
     * Log info with context
     */
    info(message: string, context: ChatLogContext = {}): void {
        const fullContext = this.buildFullContext(context, {
            timestamp: new Date().toISOString(),
        })

        logger.info(`[Chat] ${message}`, fullContext)
    }

    /**
     * Log warning with context
     */
    warn(message: string, context: ChatLogContext = {}): void {
        const fullContext = this.buildFullContext(context, {
            timestamp: new Date().toISOString(),
        })

        logger.warn(`[Chat Warning] ${message}`, fullContext)
    }

    /**
     * Build full context by merging base context with additional context
     */
    private buildFullContext(
        additionalContext: ChatLogContext,
        systemContext: Record<string, unknown> = {}
    ): Record<string, unknown> {
        return {
            ...this.baseContext,
            ...additionalContext,
            ...systemContext,
            // Add system information
            environment: process.env.NODE_ENV,
            isClient: typeof window !== 'undefined',
        }
    }

    /**
     * Build error context with categorization and impact assessment
     */
    private buildErrorContext(
        errorType: ChatErrorType,
        error: Error | unknown,
        context: ChatLogContext
    ): ChatErrorContext {
        const errorContext: ChatErrorContext = {
            ...context,
            errorType,
            userImpact: this.assessUserImpact(errorType),
            retryable: this.isRetryableError(errorType),
        }

        // Extract error details
        if (error instanceof Error) {
            errorContext.errorCode = (error as any).code || (error as any).status
            errorContext.stackTrace = error.stack
        } else if (error && typeof error === 'object') {
            errorContext.errorCode = (error as any).code || (error as any).status
        }

        return errorContext
    }

    /**
     * Assess user impact based on error type
     */
    private assessUserImpact(errorType: ChatErrorType): 'low' | 'medium' | 'high' | 'critical' {
        switch (errorType) {
            case 'connection_error':
            case 'message_delivery_error':
                return 'high'
            case 'authentication_error':
            case 'permission_error':
                return 'critical'
            case 'network_error':
            case 'timeout_error':
                return 'medium'
            case 'server_error':
                return 'high'
            case 'rate_limit_error':
                return 'medium'
            case 'validation_error':
                return 'low'
            default:
                return 'medium'
        }
    }

    /**
     * Determine if error is retryable
     */
    private isRetryableError(errorType: ChatErrorType): boolean {
        switch (errorType) {
            case 'network_error':
            case 'timeout_error':
            case 'server_error':
            case 'connection_error':
                return true
            case 'authentication_error':
            case 'permission_error':
            case 'validation_error':
                return false
            case 'rate_limit_error':
                return true // After delay
            default:
                return false
        }
    }

    /**
     * Record event metrics
     */
    private recordEventMetrics(eventType: ChatEventType, context: Record<string, unknown>): void {
        try {
            metricsCollector.counter(
                'chat_events_total',
                'Total number of chat events',
                {
                    event_type: eventType,
                    user_id: String(context.userId || 'unknown'),
                }
            )
        } catch (error) {
            // Ignore metrics errors to prevent infinite loops
        }
    }

    /**
     * Record error metrics
     */
    private recordErrorMetrics(errorType: ChatErrorType, context: ChatErrorContext): void {
        try {
            metricsCollector.counter(
                'chat_errors_total',
                'Total number of chat errors',
                {
                    error_type: errorType,
                    user_impact: context.userImpact,
                    retryable: String(context.retryable),
                    user_id: String(context.userId || 'unknown'),
                }
            )

            if (context.userImpact === 'critical') {
                metricsCollector.counter(
                    'chat_critical_errors_total',
                    'Total number of critical chat errors',
                    {
                        error_type: errorType,
                        user_id: String(context.userId || 'unknown'),
                    }
                )
            }
        } catch (error) {
            // Ignore metrics errors to prevent infinite loops
        }
    }

    /**
     * Clear performance timers (useful for testing)
     */
    clearTimers(): void {
        this.performanceTimers.clear()
    }
}

/**
 * Create a chat logger with user context
 */
export function createChatLogger(context: ChatLogContext = {}): ChatLogger {
    return new ChatLogger(context)
}

/**
 * Default chat logger instance
 */
export const chatLogger = new ChatLogger()
