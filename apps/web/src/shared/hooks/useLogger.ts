/**
 * React hook for logging with automatic context
 */

import { useEffect, useCallback } from 'react'
import { logger, LogLevel } from '../utils/logger'

interface UseLoggerOptions {
    component?: string
    userId?: string
    autoLogMount?: boolean
    autoLogUnmount?: boolean
}

export function useLogger(options: UseLoggerOptions = {}) {
    const { component, userId, autoLogMount = false, autoLogUnmount = false } = options

    // Set user ID if provided
    useEffect(() => {
        if (userId) {
            logger.setUserId(userId)
        }
        return () => {
            if (userId) {
                logger.clearUserId()
            }
        }
    }, [userId])

    // Auto-log component lifecycle
    useEffect(() => {
        if (autoLogMount && component) {
            logger.debug(`Component mounted: ${component}`)
        }

        return () => {
            if (autoLogUnmount && component) {
                logger.debug(`Component unmounted: ${component}`)
            }
        }
    }, [component, autoLogMount, autoLogUnmount])

    // Create context-aware logging functions
    const createContextLogger = useCallback(
        (level: LogLevel) => {
            return (message: string, context?: Record<string, unknown>, error?: Error) => {
                const fullContext = {
                    ...context,
                    ...(component && { component }),
                }

                switch (level) {
                    case LogLevel.DEBUG:
                        logger.debug(message, fullContext)
                        break
                    case LogLevel.INFO:
                        logger.info(message, fullContext)
                        break
                    case LogLevel.WARN:
                        logger.warn(message, fullContext)
                        break
                    case LogLevel.ERROR:
                        logger.error(message, error, fullContext)
                        break
                    case LogLevel.FATAL:
                        logger.fatal(message, error, fullContext)
                        break
                }
            }
        },
        [component]
    )

    const debug = useCallback(
        (message: string, context?: Record<string, unknown>) => {
            createContextLogger(LogLevel.DEBUG)(message, context)
        },
        [createContextLogger]
    )

    const info = useCallback(
        (message: string, context?: Record<string, unknown>) => {
            createContextLogger(LogLevel.INFO)(message, context)
        },
        [createContextLogger]
    )

    const warn = useCallback(
        (message: string, context?: Record<string, unknown>) => {
            createContextLogger(LogLevel.WARN)(message, context)
        },
        [createContextLogger]
    )

    const error = useCallback(
        (message: string, err?: Error, context?: Record<string, unknown>) => {
            createContextLogger(LogLevel.ERROR)(message, context, err)
        },
        [createContextLogger]
    )

    const fatal = useCallback(
        (message: string, err?: Error, context?: Record<string, unknown>) => {
            createContextLogger(LogLevel.FATAL)(message, context, err)
        },
        [createContextLogger]
    )

    const logUserAction = useCallback(
        (action: string, context?: Record<string, unknown>) => {
            logger.logUserAction(action, {
                ...context,
                ...(component && { component }),
            })
        },
        [component]
    )

    const logAPICall = useCallback(
        (
            method: string,
            url: string,
            statusCode: number,
            duration: number,
            context?: Record<string, unknown>
        ) => {
            logger.logAPICall(method, url, statusCode, duration, {
                ...context,
                ...(component && { component }),
            })
        },
        [component]
    )

    return {
        debug,
        info,
        warn,
        error,
        fatal,
        logUserAction,
        logAPICall,
    }
}
