/**
 * Prometheus Pushgateway Collector with Graceful Degradation
 *
 * Features:
 * - Silent failure when Pushgateway is unavailable
 * - Automatic retry mechanism every 60 seconds
 * - Logs only first error and successful recovery
 * - Non-blocking metric collection
 */

import { logger } from '@/utils/logger'
import { trackPrometheusConnection, trackPrometheusRecovery } from './error-handling-metrics'

interface PrometheusCollectorConfig {
    pushgatewayUrl?: string
    enabled?: boolean
    retryIntervalMs?: number
}

interface MetricData {
    name: string
    value: number
    labels?: Record<string, string>
}

class PrometheusCollector {
    private pushgatewayUrl: string | null = null
    private enabled: boolean = false
    private isAvailable: boolean = false
    private hasLoggedError: boolean = false
    private retryIntervalMs: number = 60000 // 60 seconds
    private retryTimer: NodeJS.Timeout | null = null

    constructor(config: PrometheusCollectorConfig = {}) {
        this.pushgatewayUrl = config.pushgatewayUrl || process.env.PROMETHEUS_PUSHGATEWAY_URL || null
        this.enabled = config.enabled ?? (process.env.PROMETHEUS_ENABLED === 'true')
        this.retryIntervalMs = config.retryIntervalMs || 60000

        if (this.enabled && this.pushgatewayUrl) {
            // Check availability on startup (non-blocking)
            void this.checkAvailability()
        }
    }

    /**
     * Check if Pushgateway is available
     */
    private async checkAvailability(): Promise<void> {
        if (!this.pushgatewayUrl) {
            return
        }

        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

            const response = await fetch(this.pushgatewayUrl, {
                method: 'GET',
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (response.ok || response.status === 404) {
                // 404 is acceptable - Pushgateway returns 404 for GET on root
                if (!this.isAvailable) {
                    // Log recovery
                    if (this.hasLoggedError) {
                        logger.info('Prometheus Pushgateway connection restored', {
                            url: this.pushgatewayUrl,
                        })
                        trackPrometheusRecovery()
                    }
                    this.isAvailable = true
                    this.hasLoggedError = false
                    trackPrometheusConnection(true)
                }
            } else {
                this.handleUnavailable()
            }
        } catch (error) {
            this.handleUnavailable()
        }
    }

    /**
     * Handle Pushgateway unavailability
     */
    private handleUnavailable(): void {
        if (this.isAvailable) {
            this.isAvailable = false
            trackPrometheusConnection(false)
        }

        // Log only the first error
        if (!this.hasLoggedError) {
            logger.warn('Prometheus Pushgateway unavailable, entering silent failure mode', {
                url: this.pushgatewayUrl,
                retryInterval: `${this.retryIntervalMs / 1000}s`,
            })
            this.hasLoggedError = true
        }

        // Schedule retry if not already scheduled
        if (!this.retryTimer) {
            this.scheduleRetry()
        }
    }

    /**
     * Schedule retry check
     */
    private scheduleRetry(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
        }

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null
            this.checkAvailability()
        }, this.retryIntervalMs)
    }

    /**
     * Push a metric to Prometheus Pushgateway
     */
    async pushMetric(metric: MetricData, job: string = 'app_metrics'): Promise<void> {
        // Silent failure if not enabled or not configured
        if (!this.enabled || !this.pushgatewayUrl) {
            return
        }

        // Silent failure if Pushgateway is unavailable
        if (!this.isAvailable) {
            return
        }

        try {
            // Format metric in Prometheus text format
            const labelString = metric.labels
                ? Object.entries(metric.labels)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(',')
                : ''

            const metricText = labelString
                ? `${metric.name}{${labelString}} ${metric.value}\n`
                : `${metric.name} ${metric.value}\n`

            // Push to Pushgateway
            const response = await fetch(`${this.pushgatewayUrl}/metrics/job/${job}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: metricText,
            })

            if (!response.ok) {
                this.handleUnavailable()
            }
        } catch (error) {
            // Silent failure - just mark as unavailable and schedule retry
            this.handleUnavailable()
        }
    }

    /**
     * Push multiple metrics in a batch
     */
    async pushMetrics(metrics: MetricData[], job: string = 'app_metrics'): Promise<void> {
        // Silent failure if not enabled or not configured
        if (!this.enabled || !this.pushgatewayUrl) {
            return
        }

        // Silent failure if Pushgateway is unavailable
        if (!this.isAvailable) {
            return
        }

        try {
            // Format all metrics in Prometheus text format
            const metricsText = metrics
                .map((metric) => {
                    const labelString = metric.labels
                        ? Object.entries(metric.labels)
                            .map(([key, value]) => `${key}="${value}"`)
                            .join(',')
                        : ''

                    return labelString
                        ? `${metric.name}{${labelString}} ${metric.value}`
                        : `${metric.name} ${metric.value}`
                })
                .join('\n') + '\n'

            // Push to Pushgateway
            const response = await fetch(`${this.pushgatewayUrl}/metrics/job/${job}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: metricsText,
            })

            if (!response.ok) {
                this.handleUnavailable()
            }
        } catch (error) {
            // Silent failure - just mark as unavailable and schedule retry
            this.handleUnavailable()
        }
    }

    /**
     * Get current availability status
     */
    isConnected(): boolean {
        return this.isAvailable
    }

    /**
     * Manually trigger availability check
     */
    async checkConnection(): Promise<boolean> {
        await this.checkAvailability()
        return this.isAvailable
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
            this.retryTimer = null
        }
    }
}

// Singleton instance
export const prometheusCollector = new PrometheusCollector()

// Export class for testing
export { PrometheusCollector }
export type { PrometheusCollectorConfig, MetricData }
