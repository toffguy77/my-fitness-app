/**
 * Frontend Logger
 * Structured logging system with multiple severity levels
 */

export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal',
}

export interface LogEntry {
    level: LogLevel
    message: string
    timestamp: string
    context?: Record<string, unknown>
    error?: Error
    stack?: string
    userAgent?: string
    url?: string
    userId?: string
    sessionId?: string
    requestId?: string
}

export interface LoggerConfig {
    minLevel: LogLevel
    enableConsole: boolean
    enableRemote: boolean
    remoteEndpoint?: string
    includeStackTrace: boolean
    includeUserAgent: boolean
    maxBatchSize: number
    flushInterval: number
}

const LOG_LEVELS: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
    [LogLevel.FATAL]: 4,
}

class Logger {
    private config: LoggerConfig
    private logBuffer: LogEntry[] = []
    private flushTimer: NodeJS.Timeout | null = null
    private sessionId: string
    private userId?: string

    constructor(config?: Partial<LoggerConfig>) {
        this.config = {
            minLevel: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
            enableConsole: true,
            enableRemote: process.env.NODE_ENV === 'production',
            remoteEndpoint: process.env.NEXT_PUBLIC_API_URL + '/api/logs',
            includeStackTrace: true,
            includeUserAgent: true,
            maxBatchSize: 50,
            flushInterval: 10000, // 10 seconds
            ...config,
        }

        this.sessionId = this.generateSessionId()
        this.startFlushTimer()

        // Flush logs before page unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this.flush())
        }
    }

    private generateSessionId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel]
    }

    private formatMessage(entry: LogEntry): string {
        const parts = [
            `[${entry.timestamp}]`,
            `[${entry.level.toUpperCase()}]`,
            entry.message,
        ]

        if (entry.context && Object.keys(entry.context).length > 0) {
            parts.push(JSON.stringify(entry.context, null, 2))
        }

        if (entry.error) {
            parts.push(`Error: ${entry.error.message}`)
            if (entry.stack) {
                parts.push(`Stack: ${entry.stack}`)
            }
        }

        return parts.join(' ')
    }

    private createLogEntry(
        level: LogLevel,
        message: string,
        context?: Record<string, unknown>,
        error?: Error
    ): LogEntry {
        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date().toISOString(),
            context,
            error,
            sessionId: this.sessionId,
        }

        if (this.userId) {
            entry.userId = this.userId
        }

        if (typeof window !== 'undefined') {
            entry.url = window.location.href

            if (this.config.includeUserAgent) {
                entry.userAgent = navigator.userAgent
            }
        }

        if (error && this.config.includeStackTrace) {
            entry.stack = error.stack
        }

        return entry
    }

    private logToConsole(entry: LogEntry): void {
        if (!this.config.enableConsole) return

        const message = this.formatMessage(entry)
        const style = this.getConsoleStyle(entry.level)

        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(`%c${message}`, style)
                break
            case LogLevel.INFO:
                console.info(`%c${message}`, style)
                break
            case LogLevel.WARN:
                console.warn(`%c${message}`, style)
                break
            case LogLevel.ERROR:
            case LogLevel.FATAL:
                console.error(`%c${message}`, style)
                if (entry.error) {
                    console.error(entry.error)
                }
                break
        }
    }

    private getConsoleStyle(level: LogLevel): string {
        const styles: Record<LogLevel, string> = {
            [LogLevel.DEBUG]: 'color: #6c757d',
            [LogLevel.INFO]: 'color: #0d6efd',
            [LogLevel.WARN]: 'color: #ffc107; font-weight: bold',
            [LogLevel.ERROR]: 'color: #dc3545; font-weight: bold',
            [LogLevel.FATAL]: 'color: #fff; background: #dc3545; font-weight: bold; padding: 2px 4px',
        }
        return styles[level]
    }

    private addToBuffer(entry: LogEntry): void {
        if (!this.config.enableRemote) return

        this.logBuffer.push(entry)

        if (this.logBuffer.length >= this.config.maxBatchSize) {
            this.flush()
        }
    }

    private startFlushTimer(): void {
        if (!this.config.enableRemote) return

        this.flushTimer = setInterval(() => {
            this.flush()
        }, this.config.flushInterval)
    }

    private async flush(): Promise<void> {
        if (this.logBuffer.length === 0 || !this.config.remoteEndpoint) return

        const logsToSend = [...this.logBuffer]
        this.logBuffer = []

        try {
            await fetch(this.config.remoteEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ logs: logsToSend }),
                keepalive: true, // Important for beforeunload
            })
        } catch (error) {
            // Silently fail - don't want logging to break the app
            console.error('Failed to send logs to server:', error)
        }
    }

    public setUserId(userId: string): void {
        this.userId = userId
    }

    public clearUserId(): void {
        this.userId = undefined
    }

    public debug(message: string, context?: Record<string, unknown>): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return

        const entry = this.createLogEntry(LogLevel.DEBUG, message, context)
        this.logToConsole(entry)
        this.addToBuffer(entry)
    }

    public info(message: string, context?: Record<string, unknown>): void {
        if (!this.shouldLog(LogLevel.INFO)) return

        const entry = this.createLogEntry(LogLevel.INFO, message, context)
        this.logToConsole(entry)
        this.addToBuffer(entry)
    }

    public warn(message: string, context?: Record<string, unknown>): void {
        if (!this.shouldLog(LogLevel.WARN)) return

        const entry = this.createLogEntry(LogLevel.WARN, message, context)
        this.logToConsole(entry)
        this.addToBuffer(entry)
    }

    public error(message: string, error?: Error, context?: Record<string, unknown>): void {
        if (!this.shouldLog(LogLevel.ERROR)) return

        const entry = this.createLogEntry(LogLevel.ERROR, message, context, error)
        this.logToConsole(entry)
        this.addToBuffer(entry)
    }

    public fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
        const entry = this.createLogEntry(LogLevel.FATAL, message, context, error)
        this.logToConsole(entry)
        this.addToBuffer(entry)
        this.flush() // Immediately flush fatal errors
    }

    // Specialized logging methods

    public logAPICall(
        method: string,
        url: string,
        statusCode: number,
        duration: number,
        context?: Record<string, unknown>
    ): void {
        const logContext = {
            method,
            url,
            status_code: statusCode,
            duration_ms: duration,
            ...context,
        }

        if (statusCode >= 500) {
            this.error('API call failed', undefined, logContext)
        } else if (statusCode >= 400) {
            this.warn('API call client error', logContext)
        } else {
            this.debug('API call completed', logContext)
        }
    }

    public logUserAction(action: string, context?: Record<string, unknown>): void {
        this.info('User action', {
            action,
            ...context,
        })
    }

    public logPerformance(metric: string, value: number, context?: Record<string, unknown>): void {
        this.debug('Performance metric', {
            metric,
            value,
            unit: 'ms',
            ...context,
        })
    }

    public logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: Record<string, unknown>): void {
        const logContext = {
            event,
            severity,
            category: 'security',
            ...context,
        }

        if (severity === 'critical' || severity === 'high') {
            this.error('Security event', undefined, logContext)
        } else {
            this.warn('Security event', logContext)
        }
    }

    public destroy(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer)
        }
        this.flush()
    }
}

// Create singleton instance
export const logger = new Logger()

// Export for testing or custom instances
export { Logger }
