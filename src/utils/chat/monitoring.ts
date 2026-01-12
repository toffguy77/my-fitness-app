/**
 * Chat system monitoring utilities
 * Provides endpoints and utilities for monitoring chat system health
 */

import { chatMetrics } from './metrics'
import { metricsCollector } from '@/utils/metrics/collector'
import { chatLogger } from './logger'

export interface ChatHealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy'
    messageDeliveryRate: number
    connectionSuccessRate: number
    averageDeliveryTime: number
    activeConnections: number
    criticalErrors: number
    lastUpdated: string
}

export interface ChatMetricsSummary {
    messageMetrics: {
        sent: number
        delivered: number
        failed: number
        successRate: number
    }
    connectionMetrics: {
        established: number
        failed: number
        successRate: number
        activeConnections: number
    }
    performanceMetrics: {
        averageDeliveryTime: number
        averageConnectionUptime: number
    }
    errorMetrics: {
        totalErrors: number
        criticalErrors: number
        errorsByType: Record<string, number>
    }
    timestamp: string
}

/**
 * Chat System Monitor
 * Provides health checks and metrics aggregation for monitoring
 */
export class ChatSystemMonitor {
    private healthCheckInterval: NodeJS.Timeout | null = null
    private lastHealthStatus: ChatHealthStatus | null = null

    /**
     * Get current chat system health status
     */
    getHealthStatus(): ChatHealthStatus {
        try {
            const summary = chatMetrics.getChatMetricsSummary()

            // Calculate success rates
            const messageSuccessRate = summary.messagesSent > 0
                ? (summary.messagesDelivered / (summary.messagesDelivered + summary.messagesFailedToSend)) * 100
                : 100

            const connectionSuccessRate = (summary.connectionsEstablished + summary.connectionsFailed) > 0
                ? (summary.connectionsEstablished / (summary.connectionsEstablished + summary.connectionsFailed)) * 100
                : 100

            // Get active connections
            const activeConnectionsMetrics = metricsCollector.getMetricsByName('chat_active_connections')
            const activeConnections = activeConnectionsMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)

            // Get critical errors
            const criticalErrorsMetrics = metricsCollector.getMetricsByName('chat_critical_errors_total')
            const criticalErrors = criticalErrorsMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)

            // Determine overall health status
            let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

            if (criticalErrors > 0 || connectionSuccessRate < 50 || messageSuccessRate < 50) {
                status = 'unhealthy'
            } else if (connectionSuccessRate < 90 || messageSuccessRate < 90 || summary.averageDeliveryTime > 5) {
                status = 'degraded'
            }

            const healthStatus: ChatHealthStatus = {
                status,
                messageDeliveryRate: messageSuccessRate,
                connectionSuccessRate,
                averageDeliveryTime: summary.averageDeliveryTime,
                activeConnections,
                criticalErrors,
                lastUpdated: new Date().toISOString(),
            }

            this.lastHealthStatus = healthStatus

            // Log health status changes
            if (status !== 'healthy') {
                chatLogger.warn(`Chat system health status: ${status}`, {
                    messageDeliveryRate: messageSuccessRate,
                    connectionSuccessRate,
                    averageDeliveryTime: summary.averageDeliveryTime,
                    criticalErrors,
                })
            }

            return healthStatus
        } catch (error) {
            chatLogger.logError('unknown_error', 'Failed to get chat health status', error)

            return {
                status: 'unhealthy',
                messageDeliveryRate: 0,
                connectionSuccessRate: 0,
                averageDeliveryTime: 0,
                activeConnections: 0,
                criticalErrors: 1,
                lastUpdated: new Date().toISOString(),
            }
        }
    }

    /**
     * Get comprehensive chat metrics summary
     */
    getMetricsSummary(): ChatMetricsSummary {
        try {
            const summary = chatMetrics.getChatMetricsSummary()

            // Get error metrics by type
            const errorMetrics = metricsCollector.getMetricsByName('chat_errors_total')
            const errorsByType: Record<string, number> = {}
            let totalErrors = 0

            errorMetrics.forEach(metric => {
                const errorType = String(metric.labels.error_type || 'unknown')
                const value = metric.type === 'histogram' ? metric.count : metric.value
                errorsByType[errorType] = (errorsByType[errorType] || 0) + value
                totalErrors += value
            })

            // Get critical errors
            const criticalErrorsMetrics = metricsCollector.getMetricsByName('chat_critical_errors_total')
            const criticalErrors = criticalErrorsMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)

            // Get active connections
            const activeConnectionsMetrics = metricsCollector.getMetricsByName('chat_active_connections')
            const activeConnections = activeConnectionsMetrics.reduce((sum, metric) => {
                return sum + (metric.type === 'histogram' ? metric.count : metric.value)
            }, 0)

            // Calculate success rates
            const messageSuccessRate = summary.messagesSent > 0
                ? (summary.messagesDelivered / (summary.messagesDelivered + summary.messagesFailedToSend)) * 100
                : 100

            const connectionSuccessRate = (summary.connectionsEstablished + summary.connectionsFailed) > 0
                ? (summary.connectionsEstablished / (summary.connectionsEstablished + summary.connectionsFailed)) * 100
                : 100

            return {
                messageMetrics: {
                    sent: summary.messagesSent,
                    delivered: summary.messagesDelivered,
                    failed: summary.messagesFailedToSend,
                    successRate: messageSuccessRate,
                },
                connectionMetrics: {
                    established: summary.connectionsEstablished,
                    failed: summary.connectionsFailed,
                    successRate: connectionSuccessRate,
                    activeConnections,
                },
                performanceMetrics: {
                    averageDeliveryTime: summary.averageDeliveryTime,
                    averageConnectionUptime: summary.connectionUptime,
                },
                errorMetrics: {
                    totalErrors,
                    criticalErrors,
                    errorsByType,
                },
                timestamp: new Date().toISOString(),
            }
        } catch (error) {
            chatLogger.logError('unknown_error', 'Failed to get chat metrics summary', error)

            return {
                messageMetrics: {
                    sent: 0,
                    delivered: 0,
                    failed: 0,
                    successRate: 0,
                },
                connectionMetrics: {
                    established: 0,
                    failed: 0,
                    successRate: 0,
                    activeConnections: 0,
                },
                performanceMetrics: {
                    averageDeliveryTime: 0,
                    averageConnectionUptime: 0,
                },
                errorMetrics: {
                    totalErrors: 0,
                    criticalErrors: 0,
                    errorsByType: {},
                },
                timestamp: new Date().toISOString(),
            }
        }
    }

    /**
     * Start periodic health checks
     */
    startHealthChecks(intervalMs: number = 60000): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval)
        }

        this.healthCheckInterval = setInterval(() => {
            const health = this.getHealthStatus()

            // Log health status periodically
            chatLogger.info('Periodic chat health check', {
                status: health.status,
                messageDeliveryRate: health.messageDeliveryRate,
                connectionSuccessRate: health.connectionSuccessRate,
                activeConnections: health.activeConnections,
            })

            // Record health metrics
            metricsCollector.gauge(
                'chat_system_health_score',
                'Overall chat system health score (0-100)',
                this.calculateHealthScore(health)
            )
        }, intervalMs)

        chatLogger.info('Started chat system health checks', {
            intervalMs,
        })
    }

    /**
     * Stop periodic health checks
     */
    stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval)
            this.healthCheckInterval = null

            chatLogger.info('Stopped chat system health checks')
        }
    }

    /**
     * Calculate overall health score (0-100)
     */
    private calculateHealthScore(health: ChatHealthStatus): number {
        let score = 100

        // Deduct points for poor performance
        if (health.messageDeliveryRate < 95) {
            score -= (95 - health.messageDeliveryRate) * 2
        }

        if (health.connectionSuccessRate < 95) {
            score -= (95 - health.connectionSuccessRate) * 2
        }

        // Deduct points for slow delivery
        if (health.averageDeliveryTime > 2) {
            score -= Math.min(health.averageDeliveryTime * 5, 30)
        }

        // Deduct points for critical errors
        if (health.criticalErrors > 0) {
            score -= Math.min(health.criticalErrors * 10, 50)
        }

        return Math.max(0, Math.min(100, score))
    }

    /**
     * Get last known health status
     */
    getLastHealthStatus(): ChatHealthStatus | null {
        return this.lastHealthStatus
    }

    /**
     * Reset all chat metrics (useful for testing)
     */
    resetMetrics(): void {
        chatMetrics.clear()
        metricsCollector.clear()
        this.lastHealthStatus = null

        chatLogger.info('Chat metrics reset')
    }
}

// Singleton instance
export const chatMonitor = new ChatSystemMonitor()

/**
 * Export chat metrics in Prometheus format
 */
export function exportPrometheusMetrics(): string {
    try {
        const allMetrics = metricsCollector.getAllMetrics()
        const chatMetrics = allMetrics.filter(metric =>
            metric.name.startsWith('chat_') ||
            metric.name.includes('chat')
        )

        let output = ''

        for (const metric of chatMetrics) {
            // Add help text
            output += `# HELP ${metric.name} ${metric.help}\n`
            output += `# TYPE ${metric.name} ${metric.type}\n`

            if (metric.type === 'histogram') {
                // Handle histogram metrics
                const buckets = metric.buckets
                let cumulativeCount = 0

                // Add bucket metrics
                for (const bucket of buckets) {
                    const count = metric.observations.filter(obs => obs <= bucket).length
                    cumulativeCount = count

                    const labels = Object.entries(metric.labels)
                        .map(([key, value]) => `${key}="${value}"`)
                        .join(',')
                    const bucketLabels = labels ? `{${labels},le="${bucket}"}` : `{le="${bucket}"}`

                    output += `${metric.name}_bucket${bucketLabels} ${cumulativeCount}\n`
                }

                // Add +Inf bucket
                const labels = Object.entries(metric.labels)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(',')
                const infLabels = labels ? `{${labels},le="+Inf"}` : `{le="+Inf"}`
                output += `${metric.name}_bucket${infLabels} ${metric.count}\n`

                // Add sum and count
                const sumLabels = labels ? `{${labels}}` : ''
                output += `${metric.name}_sum${sumLabels} ${metric.sum}\n`
                output += `${metric.name}_count${sumLabels} ${metric.count}\n`
            } else {
                // Handle counter and gauge metrics
                const labels = Object.entries(metric.labels)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(',')
                const labelStr = labels ? `{${labels}}` : ''
                const value = metric.type === 'counter' || metric.type === 'gauge' ? metric.value : 0
                output += `${metric.name}${labelStr} ${value}\n`
            }

            output += '\n'
        }

        return output
    } catch (error) {
        chatLogger.logError('unknown_error', 'Failed to export Prometheus metrics', error)
        return '# Error exporting metrics\n'
    }
}