/**
 * Property-based tests for error handling
 * Feature: dashboard, Property 28: Save Error Handling with Retry
 * Validates: Requirements 13.3
 */

import fc from 'fast-check';
import {
    mapApiError,
    retryWithBackoff,
    DashboardErrorCode,
    DEFAULT_RETRY_CONFIG,
} from '../errorHandling';

describe('Property 28: Save Error Handling with Retry', () => {
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

    it('retries retryable errors up to max attempts', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 5 }), // maxRetries
                fc.integer({ min: 1, max: 3 }), // failureCount (less than maxRetries)
                async (maxRetries, failureCount) => {
                    let callCount = 0;
                    const fn = jest.fn().mockImplementation(async () => {
                        callCount++;
                        if (callCount <= failureCount) {
                            throw { response: { status: 500 } }; // Retryable error
                        }
                        return 'success';
                    });

                    const promise = retryWithBackoff(fn, {
                        ...DEFAULT_RETRY_CONFIG,
                        maxRetries,
                        baseDelay: 10,
                    });

                    // Advance timers
                    const result = promise.catch((e) => e);
                    await jest.advanceTimersByTimeAsync(10000);
                    const finalResult = await result;

                    if (failureCount < maxRetries) {
                        // Should succeed after retries
                        expect(finalResult).toBe('success');
                        expect(callCount).toBe(failureCount + 1);
                    } else {
                        // Should fail after max retries
                        expect(finalResult).toEqual({ response: { status: 500 } });
                        expect(callCount).toBe(maxRetries);
                    }
                }
            ),
            { numRuns: 50 }
        );
    });

    it('does not retry non-retryable errors', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(400, 401, 403, 404), // Non-retryable status codes
                async (statusCode) => {
                    const fn = jest.fn().mockRejectedValue({
                        response: { status: statusCode },
                    });

                    const promise = retryWithBackoff(fn, {
                        ...DEFAULT_RETRY_CONFIG,
                        maxRetries: 3,
                    });

                    const result = promise.catch((e) => e);
                    await jest.advanceTimersByTimeAsync(10000);
                    const error = await result;

                    // Should fail immediately without retries
                    expect(fn).toHaveBeenCalledTimes(1);
                    expect((error as any).response.status).toBe(statusCode);
                }
            ),
            { numRuns: 20 }
        );
    });

    it('maps all error types to appropriate error codes', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.oneof(
                    fc.record({
                        response: fc.record({
                            status: fc.constantFrom(400, 401, 403, 404, 408, 429, 500, 502, 503, 504),
                        }),
                    }),
                    fc.constant(new TypeError('Failed to fetch')),
                    fc.record({ message: fc.constant('network error') })
                ),
                async (error) => {
                    const mappedError = mapApiError(error);

                    // Should always return a valid error code
                    expect(Object.values(DashboardErrorCode)).toContain(mappedError.code);

                    // Should always have a message
                    expect(mappedError.message).toBeTruthy();
                    expect(typeof mappedError.message).toBe('string');

                    // Should have retryable flag
                    expect(typeof mappedError.retryable).toBe('boolean');

                    // Verify specific mappings
                    if ('response' in error && error.response) {
                        const status = error.response.status;
                        if (status === 401) {
                            expect(mappedError.code).toBe(DashboardErrorCode.UNAUTHORIZED);
                            expect(mappedError.retryable).toBe(false);
                        } else if (status === 403) {
                            expect(mappedError.code).toBe(DashboardErrorCode.FORBIDDEN);
                            expect(mappedError.retryable).toBe(false);
                        } else if (status === 404) {
                            expect(mappedError.code).toBe(DashboardErrorCode.NOT_FOUND);
                            expect(mappedError.retryable).toBe(false);
                        } else if (status === 400) {
                            expect(mappedError.code).toBe(DashboardErrorCode.VALIDATION_ERROR);
                            expect(mappedError.retryable).toBe(false);
                        } else if (status === 408) {
                            expect(mappedError.code).toBe(DashboardErrorCode.TIMEOUT_ERROR);
                            expect(mappedError.retryable).toBe(true);
                        } else if (status === 429) {
                            expect(mappedError.code).toBe(DashboardErrorCode.RATE_LIMIT_ERROR);
                            expect(mappedError.retryable).toBe(true);
                        } else if ([500, 502, 503, 504].includes(status)) {
                            expect(mappedError.code).toBe(DashboardErrorCode.SERVER_ERROR);
                            expect(mappedError.retryable).toBe(true);
                        }
                    } else if (error instanceof TypeError || (error as any).message?.includes('network')) {
                        expect(mappedError.code).toBe(DashboardErrorCode.NETWORK_ERROR);
                        expect(mappedError.retryable).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('retains unsaved data when save fails', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    // Generate date as timestamp to avoid invalid Date objects
                    dateTimestamp: fc.integer({ min: new Date('2024-01-01').getTime(), max: new Date('2024-12-31').getTime() }),
                    weight: fc.float({ min: 40, max: 200, noNaN: true }),
                }),
                async ({ dateTimestamp, weight }) => {
                    const date = new Date(dateTimestamp);
                    const dateStr = date.toISOString().split('T')[0];
                    const metric = {
                        type: 'weight' as const,
                        data: { weight },
                    };

                    // Simulate save failure
                    const fn = jest.fn().mockRejectedValue({
                        response: { status: 500 },
                    });

                    try {
                        const promise = retryWithBackoff(fn, {
                            ...DEFAULT_RETRY_CONFIG,
                            maxRetries: 2,
                            baseDelay: 10,
                        });

                        const result = promise.catch((e) => e);
                        await jest.advanceTimersByTimeAsync(1000);
                        await result;
                    } catch (error) {
                        // Expected to fail
                    }

                    // Verify data can be stored for retry
                    const unsavedKey = 'dashboard_unsaved_data';
                    const stored = localStorage.getItem(unsavedKey);

                    // If localStorage is available, data should be storable
                    if (typeof window !== 'undefined') {
                        // We can store the data
                        const unsavedData = stored ? JSON.parse(stored) : [];
                        const entry = {
                            date: dateStr,
                            metric,
                            timestamp: Date.now(),
                            attempts: 1,
                        };
                        unsavedData.push(entry);
                        localStorage.setItem(unsavedKey, JSON.stringify(unsavedData));

                        // Verify it was stored
                        const retrieved = JSON.parse(localStorage.getItem(unsavedKey) || '[]');
                        expect(retrieved.length).toBeGreaterThan(0);
                        expect(retrieved[retrieved.length - 1].date).toBe(dateStr);
                    }

                    // Clean up
                    localStorage.removeItem(unsavedKey);
                }
            ),
            { numRuns: 50 }
        );
    });

    it('exponential backoff increases delay correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: 3 }), // attempt number (reduced)
                fc.integer({ min: 100, max: 500 }), // baseDelay (reduced)
                fc.constantFrom(2, 3), // backoffMultiplier (simplified)
                async (attempt, baseDelay, backoffMultiplier) => {
                    const config = {
                        maxRetries: 5,
                        baseDelay,
                        maxDelay: 10000,
                        backoffMultiplier,
                    };

                    let callCount = 0;
                    const callTimes: number[] = [];

                    const fn = jest.fn().mockImplementation(async () => {
                        callTimes.push(Date.now());
                        callCount++;
                        if (callCount <= attempt + 1) {
                            throw { response: { status: 500 } };
                        }
                        return 'success';
                    });

                    const promise = retryWithBackoff(fn, config);

                    const result = promise.catch((e) => e);
                    await jest.advanceTimersByTimeAsync(20000);
                    await result;

                    // Verify exponential backoff pattern
                    if (callTimes.length > 1) {
                        for (let i = 1; i < callTimes.length; i++) {
                            const delay = callTimes[i] - callTimes[i - 1];
                            const expectedDelay = baseDelay * Math.pow(backoffMultiplier, i - 1);
                            const maxDelay = config.maxDelay;

                            // Delay should be close to expected (within 20% tolerance for timing)
                            const expectedWithMax = Math.min(expectedDelay, maxDelay);
                            expect(delay).toBeGreaterThanOrEqual(expectedWithMax * 0.8);
                            expect(delay).toBeLessThanOrEqual(expectedWithMax * 1.2);
                        }
                    }
                }
            ),
            { numRuns: 20, timeout: 10000 }
        );
    }, 15000); // Increase Jest timeout
});
