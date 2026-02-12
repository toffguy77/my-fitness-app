/**
 * Error handling utilities for dashboard
 * Provides centralized error management, retry logic, and user-friendly error messages
 */

import toast from 'react-hot-toast';

/**
 * Error codes for dashboard operations
 */
export enum DashboardErrorCode {
    NETWORK_ERROR = 'NETWORK_ERROR',
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    NOT_FOUND = 'NOT_FOUND',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    SERVER_ERROR = 'SERVER_ERROR',
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Dashboard error interface
 */
export interface DashboardError {
    code: DashboardErrorCode;
    message: string;
    details?: Record<string, any>;
    retryable: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    backoffMultiplier: 2,
};

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Map API error to DashboardError
 */
export function mapApiError(error: any): DashboardError {
    // Network error (offline)
    if (!isOnline()) {
        return {
            code: DashboardErrorCode.NETWORK_ERROR,
            message: 'Нет подключения к интернету',
            retryable: true,
        };
    }

    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;
    const details = error.response?.data?.details;

    // HTTP status code errors
    switch (status) {
        case 401:
            return {
                code: DashboardErrorCode.UNAUTHORIZED,
                message: 'Требуется авторизация',
                retryable: false,
            };

        case 403:
            return {
                code: DashboardErrorCode.FORBIDDEN,
                message: 'Доступ запрещен',
                retryable: false,
            };

        case 404:
            return {
                code: DashboardErrorCode.NOT_FOUND,
                message: 'Данные не найдены',
                retryable: false,
            };

        case 400:
            return {
                code: DashboardErrorCode.VALIDATION_ERROR,
                message: message || 'Неверные данные',
                details,
                retryable: false,
            };

        case 408:
            return {
                code: DashboardErrorCode.TIMEOUT_ERROR,
                message: 'Превышено время ожидания',
                retryable: true,
            };

        case 429:
            return {
                code: DashboardErrorCode.RATE_LIMIT_ERROR,
                message: 'Слишком много запросов. Попробуйте позже',
                retryable: true,
            };

        case 500:
        case 502:
        case 503:
        case 504:
            return {
                code: DashboardErrorCode.SERVER_ERROR,
                message: 'Сервис временно недоступен',
                retryable: true,
            };
    }

    // Network/fetch errors
    if (
        error instanceof TypeError ||
        error.message?.includes('fetch') ||
        error.message?.includes('network')
    ) {
        return {
            code: DashboardErrorCode.NETWORK_ERROR,
            message: 'Проверьте подключение к интернету',
            retryable: true,
        };
    }

    // Unknown error
    return {
        code: DashboardErrorCode.UNKNOWN_ERROR,
        message: 'Произошла ошибка',
        retryable: true,
    };
}

/**
 * Calculate delay for retry attempt with exponential backoff
 */
export function calculateRetryDelay(
    attempt: number,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    return Math.min(delay, config.maxDelay);
}

/**
 * Retry function with exponential backoff
 *
 * @param fn - Function to retry
 * @param config - Retry configuration
 * @returns Promise with function result
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            const mappedError = mapApiError(error);

            // Don't retry non-retryable errors
            if (!mappedError.retryable) {
                throw error;
            }

            // Don't retry if offline
            if (!isOnline()) {
                throw error;
            }

            // Wait before next retry (except on last attempt)
            if (attempt < config.maxRetries - 1) {
                const delay = calculateRetryDelay(attempt, config);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

/**
 * Display error toast notification
 *
 * @param error - Dashboard error
 * @param showRetryButton - Whether to show retry button (not implemented in simple version)
 * @param onRetry - Retry callback function
 */
export function showErrorToast(
    error: DashboardError,
    showRetryButton: boolean = false,
    onRetry?: () => void
): void {
    const toastOptions: any = {
        duration: 5000,
        icon: '❌',
    };

    toast.error(error.message, toastOptions);
}

/**
 * Display validation errors as toast
 *
 * @param errors - Array of validation error messages
 */
export function showValidationErrors(errors: string[]): void {
    if (errors.length === 0) return;

    if (errors.length === 1) {
        toast.error(errors[0], {
            duration: 4000,
            icon: '⚠️',
        });
    } else {
        const message = `Исправьте ошибки:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
        toast.error(message, {
            duration: 6000,
            icon: '⚠️',
        });
    }
}

/**
 * Handle error with automatic toast notification and optional retry
 *
 * @param error - Error to handle
 * @param context - Context description for logging
 * @param onRetry - Optional retry callback
 */
export function handleError(
    error: any,
    context: string,
    onRetry?: () => void
): void {
    const mappedError = mapApiError(error);

    // Log error for debugging
    if (process.env.NODE_ENV !== 'production') {
        console.error(`[${context}]`, error);
    }

    // Show toast notification
    showErrorToast(mappedError, !!onRetry, onRetry);
}

/**
 * Create error boundary handler for React components
 *
 * @param componentName - Name of component for logging
 * @returns Error handler function
 */
export function createErrorHandler(componentName: string) {
    return (error: any, errorInfo?: any) => {
        // Log error
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[${componentName}] Error:`, error);
            if (errorInfo) {
                console.error(`[${componentName}] Error Info:`, errorInfo);
            }
        }

        // Show user-friendly error message
        toast.error('Произошла ошибка. Попробуйте обновить страницу', {
            duration: 5000,
            icon: '❌',
        });
    };
}

/**
 * Wrap async function with error handling
 *
 * @param fn - Async function to wrap
 * @param context - Context description
 * @param onRetry - Optional retry callback
 * @returns Wrapped function
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: string,
    onRetry?: () => void
): T {
    return (async (...args: any[]) => {
        try {
            return await fn(...args);
        } catch (error) {
            handleError(error, context, onRetry);
            throw error;
        }
    }) as T;
}
