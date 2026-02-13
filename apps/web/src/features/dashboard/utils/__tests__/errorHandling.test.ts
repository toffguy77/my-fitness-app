/**
 * Tests for error handling utilities
 */

import toast from 'react-hot-toast';
import {
    DashboardErrorCode,
    mapApiError,
    calculateRetryDelay,
    retryWithBackoff,
    isOnline,
    DEFAULT_RETRY_CONFIG,
    showErrorToast,
    showValidationErrors,
    handleError,
    createErrorHandler,
    withErrorHandling,
} from '../errorHandling';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
    error: jest.fn(),
}));

describe('errorHandling utilities', () => {
    describe('isOnline', () => {
        it('returns true when navigator.onLine is true', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true,
            });

            expect(isOnline()).toBe(true);
        });

        it('returns false when navigator.onLine is false', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false,
            });

            expect(isOnline()).toBe(false);
        });
    });

    describe('mapApiError', () => {
        beforeEach(() => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true,
            });
        });

        it('maps 401 status to UNAUTHORIZED error', () => {
            const error = {
                response: {
                    status: 401,
                    data: { message: 'Unauthorized' },
                },
            };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.UNAUTHORIZED);
            expect(result.message).toBe('Требуется авторизация');
            expect(result.retryable).toBe(false);
        });

        it('maps 403 status to FORBIDDEN error', () => {
            const error = {
                response: {
                    status: 403,
                    data: { message: 'Forbidden' },
                },
            };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.FORBIDDEN);
            expect(result.message).toBe('Доступ запрещен');
            expect(result.retryable).toBe(false);
        });

        it('maps 404 status to NOT_FOUND error', () => {
            const error = {
                response: {
                    status: 404,
                    data: { message: 'Not found' },
                },
            };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.NOT_FOUND);
            expect(result.message).toBe('Данные не найдены');
            expect(result.retryable).toBe(false);
        });

        it('maps 400 status to VALIDATION_ERROR', () => {
            const error = {
                response: {
                    status: 400,
                    data: {
                        message: 'Validation failed',
                        details: { field: 'weight', message: 'Invalid' },
                    },
                },
            };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.VALIDATION_ERROR);
            expect(result.message).toBe('Validation failed');
            expect(result.details).toEqual({ field: 'weight', message: 'Invalid' });
            expect(result.retryable).toBe(false);
        });

        it('maps 408 status to TIMEOUT_ERROR', () => {
            const error = {
                response: {
                    status: 408,
                    data: { message: 'Timeout' },
                },
            };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.TIMEOUT_ERROR);
            expect(result.message).toBe('Превышено время ожидания');
            expect(result.retryable).toBe(true);
        });

        it('maps 429 status to RATE_LIMIT_ERROR', () => {
            const error = {
                response: {
                    status: 429,
                    data: { message: 'Too many requests' },
                },
            };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.RATE_LIMIT_ERROR);
            expect(result.message).toBe('Слишком много запросов. Попробуйте позже');
            expect(result.retryable).toBe(true);
        });

        it('maps 500 status to SERVER_ERROR', () => {
            const error = {
                response: {
                    status: 500,
                    data: { message: 'Internal server error' },
                },
            };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.SERVER_ERROR);
            expect(result.message).toBe('Сервис временно недоступен');
            expect(result.retryable).toBe(true);
        });

        it('maps network errors to NETWORK_ERROR', () => {
            const error = new TypeError('Failed to fetch');

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.NETWORK_ERROR);
            expect(result.message).toBe('Проверьте подключение к интернету');
            expect(result.retryable).toBe(true);
        });

        it('maps offline state to NETWORK_ERROR', () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false,
            });

            const error = { message: 'Some error' };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.NETWORK_ERROR);
            expect(result.message).toBe('Нет подключения к интернету');
            expect(result.retryable).toBe(true);
        });

        it('maps unknown errors to UNKNOWN_ERROR', () => {
            const error = { message: 'Unknown error' };

            const result = mapApiError(error);

            expect(result.code).toBe(DashboardErrorCode.UNKNOWN_ERROR);
            expect(result.message).toBe('Произошла ошибка');
            expect(result.retryable).toBe(true);
        });
    });

    describe('calculateRetryDelay', () => {
        it('calculates delay with exponential backoff', () => {
            const delay0 = calculateRetryDelay(0);
            const delay1 = calculateRetryDelay(1);
            const delay2 = calculateRetryDelay(2);

            expect(delay0).toBe(1000); // 1000 * 2^0 = 1000
            expect(delay1).toBe(2000); // 1000 * 2^1 = 2000
            expect(delay2).toBe(4000); // 1000 * 2^2 = 4000
        });

        it('respects maximum delay', () => {
            const delay = calculateRetryDelay(10); // Would be 1024000ms without max

            expect(delay).toBe(DEFAULT_RETRY_CONFIG.maxDelay);
        });

        it('uses custom config', () => {
            const config = {
                maxRetries: 3,
                baseDelay: 500,
                maxDelay: 5000,
                backoffMultiplier: 3,
            };

            const delay0 = calculateRetryDelay(0, config);
            const delay1 = calculateRetryDelay(1, config);

            expect(delay0).toBe(500); // 500 * 3^0 = 500
            expect(delay1).toBe(1500); // 500 * 3^1 = 1500
        });
    });

    describe('retryWithBackoff', () => {
        beforeEach(() => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: true,
            });
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('returns result on first success', async () => {
            const fn = jest.fn().mockResolvedValue('success');

            const promise = retryWithBackoff(fn);
            await jest.runAllTimersAsync();
            const result = await promise;

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('retries on retryable error', async () => {
            const fn = jest
                .fn()
                .mockRejectedValueOnce({
                    response: { status: 500 },
                })
                .mockResolvedValue('success');

            const promise = retryWithBackoff(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 2 });

            // Fast-forward through retry delays
            await jest.runAllTimersAsync();

            const result = await promise;

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('does not retry on non-retryable error', async () => {
            const fn = jest.fn().mockRejectedValue({
                response: { status: 401 },
            });

            await expect(
                retryWithBackoff(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 3 })
            ).rejects.toEqual({
                response: { status: 401 },
            });

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('throws last error after max retries', async () => {
            const error = { response: { status: 500 } };
            const fn = jest.fn().mockRejectedValue(error);

            // Start the retry process
            const promise = retryWithBackoff(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 3 });

            // Advance timers and catch the rejection
            const result = promise.catch((e) => e);
            await jest.advanceTimersByTimeAsync(30000);
            const caughtError = await result;

            expect(caughtError).toEqual(error);
            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('does not retry when offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                writable: true,
                value: false,
            });

            const fn = jest.fn().mockRejectedValue({
                response: { status: 500 },
            });

            await expect(
                retryWithBackoff(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 3 })
            ).rejects.toEqual({
                response: { status: 500 },
            });

            expect(fn).toHaveBeenCalledTimes(1);
        });
    });
});


describe('showErrorToast', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('shows error toast with message', () => {
        const error = {
            code: DashboardErrorCode.SERVER_ERROR,
            message: 'Сервис временно недоступен',
            retryable: true,
        };

        showErrorToast(error);

        expect(toast.error).toHaveBeenCalledWith(
            'Сервис временно недоступен',
            expect.objectContaining({
                duration: 5000,
                icon: '❌',
            })
        );
    });
});

describe('showValidationErrors', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does nothing for empty errors array', () => {
        showValidationErrors([]);

        expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows single error with warning icon', () => {
        showValidationErrors(['Вес должен быть положительным']);

        expect(toast.error).toHaveBeenCalledWith(
            'Вес должен быть положительным',
            expect.objectContaining({
                duration: 4000,
                icon: '⚠️',
            })
        );
    });

    it('shows multiple errors as numbered list', () => {
        showValidationErrors([
            'Вес должен быть положительным',
            'Шаги не могут быть отрицательными',
        ]);

        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('Исправьте ошибки:'),
            expect.objectContaining({
                duration: 6000,
                icon: '⚠️',
            })
        );
    });
});

describe('handleError', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(navigator, 'onLine', {
            writable: true,
            value: true,
        });
    });

    it('maps error and shows toast', () => {
        const error = { response: { status: 500 } };

        handleError(error, 'TestContext');

        expect(toast.error).toHaveBeenCalled();
    });
});

describe('createErrorHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns a function that shows error toast', () => {
        const handler = createErrorHandler('TestComponent');
        const error = new Error('Test error');

        handler(error);

        expect(toast.error).toHaveBeenCalledWith(
            'Произошла ошибка. Попробуйте обновить страницу',
            expect.objectContaining({
                duration: 5000,
                icon: '❌',
            })
        );
    });
});

describe('withErrorHandling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(navigator, 'onLine', {
            writable: true,
            value: true,
        });
    });

    it('returns result on success', async () => {
        const fn = jest.fn().mockResolvedValue('success');
        const wrapped = withErrorHandling(fn, 'TestContext');

        const result = await wrapped();

        expect(result).toBe('success');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('handles error and rethrows', async () => {
        const error = { response: { status: 500 } };
        const fn = jest.fn().mockRejectedValue(error);
        const wrapped = withErrorHandling(fn, 'TestContext');

        await expect(wrapped()).rejects.toEqual(error);
        expect(toast.error).toHaveBeenCalled();
    });
});
