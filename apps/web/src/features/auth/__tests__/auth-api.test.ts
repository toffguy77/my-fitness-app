import fc from 'fast-check';
import { mapApiError } from '../api/auth';
import type { AuthError } from '../types';

describe('Authentication API Error Mapping', () => {
    describe('Property 7: Authentication Error Mapping', () => {
        it('should map 401 errors to invalid credentials message', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.string(), // Random error message
                    fc.record({
                        message: fc.option(fc.string(), { nil: undefined }),
                    }),
                    (errorMessage, responseData) => {
                        // Create error with 401 status
                        const error = {
                            response: {
                                status: 401,
                                data: responseData,
                            },
                            message: errorMessage,
                        };

                        const result = mapApiError(error);

                        // Should always map to invalid credentials
                        expect(result.code).toBe('invalid_credentials');
                        expect(result.message).toBe('Неверный логин или пароль');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should map 409 errors to user exists message', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.string(), // Random error message
                    fc.record({
                        message: fc.option(fc.string(), { nil: undefined }),
                    }),
                    (errorMessage, responseData) => {
                        // Create error with 409 status
                        const error = {
                            response: {
                                status: 409,
                                data: responseData,
                            },
                            message: errorMessage,
                        };

                        const result = mapApiError(error);

                        // Should always map to user exists
                        expect(result.code).toBe('user_exists');
                        expect(result.message).toBe('Пользователь уже существует');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should map network errors to connection message', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.string(),
                    (errorMessage) => {
                        // Create network error (TypeError only, as per implementation)
                        const error = {
                            name: 'TypeError',
                            message: errorMessage,
                        };

                        const result = mapApiError(error);

                        // Should map to network error
                        expect(result.code).toBe('network_error');
                        expect(result.message).toBe('Check internet connection');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should map fetch-related errors to network error', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.string(),
                    fc.string(),
                    (prefix, suffix) => {
                        // Create error with 'fetch' in message
                        const errorMessage = `${prefix}fetch${suffix}`;
                        const error = {
                            name: 'Error',
                            message: errorMessage,
                        };

                        const result = mapApiError(error);

                        // Should map to network error
                        expect(result.code).toBe('network_error');
                        expect(result.message).toBe('Check internet connection');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should map 500+ errors to service unavailable message', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.integer({ min: 500, max: 599 }), // Server error status codes
                    fc.string(),
                    fc.record({
                        message: fc.option(fc.string(), { nil: undefined }),
                    }),
                    (statusCode, errorMessage, responseData) => {
                        // Create server error
                        const error = {
                            response: {
                                status: statusCode,
                                data: responseData,
                            },
                            message: errorMessage,
                        };

                        const result = mapApiError(error);

                        // Should always map to server error
                        expect(result.code).toBe('server_error');
                        expect(result.message).toBe('Сервис временно недоступен');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should map 400 errors to validation error', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.option(fc.string(), { nil: undefined }),
                    (responseMessage) => {
                        // Create 400 error
                        const error = {
                            response: {
                                status: 400,
                                data: {
                                    message: responseMessage,
                                },
                            },
                        };

                        const result = mapApiError(error);

                        // Should map to validation error
                        expect(result.code).toBe('validation_error');
                        // Message should be from response or default
                        if (responseMessage) {
                            expect(result.message).toBe(responseMessage);
                        } else {
                            expect(result.message).toBe('Invalid request data');
                        }
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should map unknown errors to server error', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.integer({ min: 200, max: 499 }).filter(n => n !== 400 && n !== 401 && n !== 409),
                    fc.string(),
                    (statusCode, errorMessage) => {
                        // Create error with non-standard status code
                        const error = {
                            response: {
                                status: statusCode,
                                data: {},
                            },
                            message: errorMessage,
                        };

                        const result = mapApiError(error);

                        // Should default to server error
                        expect(result.code).toBe('server_error');
                        expect(result.message).toBe('Сервис временно недоступен');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle errors with "Invalid credentials" in message', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.integer({ min: 200, max: 599 }),
                    (statusCode) => {
                        // Create error with "Invalid credentials" in message
                        const error = {
                            response: {
                                status: statusCode,
                                data: {
                                    message: 'Invalid credentials provided',
                                },
                            },
                        };

                        const result = mapApiError(error);

                        // Should map to invalid credentials regardless of status
                        expect(result.code).toBe('invalid_credentials');
                        expect(result.message).toBe('Неверный логин или пароль');
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle errors with "already exists" in message', () => {
            // Feature: auth-screen, Property 7: Authentication Error Mapping
            // **Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

            fc.assert(
                fc.property(
                    fc.integer({ min: 200, max: 599 }),
                    (statusCode) => {
                        // Create error with "already exists" in message
                        const error = {
                            response: {
                                status: statusCode,
                                data: {
                                    message: 'User already exists in the system',
                                },
                            },
                        };

                        const result = mapApiError(error);

                        // Should map to user exists regardless of status
                        expect(result.code).toBe('user_exists');
                        expect(result.message).toBe('Пользователь уже существует');
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('Unit Tests: Specific Error Scenarios', () => {
        it('should map TypeError to network error', () => {
            const error = new TypeError('Failed to fetch');
            const result = mapApiError(error);

            expect(result.code).toBe('network_error');
            expect(result.message).toBe('Check internet connection');
        });

        it('should map 401 with no message to invalid credentials', () => {
            const error = {
                response: {
                    status: 401,
                    data: {},
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('invalid_credentials');
            expect(result.message).toBe('Неверный логин или пароль');
        });

        it('should map 409 with no message to user exists', () => {
            const error = {
                response: {
                    status: 409,
                    data: {},
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('user_exists');
            expect(result.message).toBe('Пользователь уже существует');
        });

        it('should map 500 to server error', () => {
            const error = {
                response: {
                    status: 500,
                    data: {
                        message: 'Internal server error',
                    },
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('server_error');
            expect(result.message).toBe('Сервис временно недоступен');
        });

        it('should map 503 to server error', () => {
            const error = {
                response: {
                    status: 503,
                    data: {
                        message: 'Service unavailable',
                    },
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('server_error');
            expect(result.message).toBe('Сервис временно недоступен');
        });

        it('should map 400 with custom message to validation error', () => {
            const error = {
                response: {
                    status: 400,
                    data: {
                        message: 'Email is required',
                    },
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('validation_error');
            expect(result.message).toBe('Email is required');
        });

        it('should map 400 without message to default validation error', () => {
            const error = {
                response: {
                    status: 400,
                    data: {},
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('validation_error');
            expect(result.message).toBe('Invalid request data');
        });

        it('should handle error with fetch in message', () => {
            const error = {
                name: 'Error',
                message: 'fetch failed due to network',
            };
            const result = mapApiError(error);

            expect(result.code).toBe('network_error');
            expect(result.message).toBe('Check internet connection');
        });

        it('should handle error without response object', () => {
            const error = {
                message: 'Something went wrong',
            };
            const result = mapApiError(error);

            expect(result.code).toBe('server_error');
            expect(result.message).toBe('Сервис временно недоступен');
        });

        it('should prioritize message-based detection over status code', () => {
            // Even with 500 status, "Invalid credentials" in message should win
            const error = {
                response: {
                    status: 500,
                    data: {
                        message: 'Invalid credentials',
                    },
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('invalid_credentials');
            expect(result.message).toBe('Неверный логин или пароль');
        });

        it('should handle edge case: status 200 with error object', () => {
            // Unusual case but should handle gracefully
            const error = {
                response: {
                    status: 200,
                    data: {},
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('server_error');
            expect(result.message).toBe('Сервис временно недоступен');
        });

        it('should handle null/undefined response data', () => {
            const error = {
                response: {
                    status: 500,
                    data: null,
                },
            };
            const result = mapApiError(error);

            expect(result.code).toBe('server_error');
            expect(result.message).toBe('Сервис временно недоступен');
        });

        it('should return AuthError with correct structure', () => {
            const error = {
                response: {
                    status: 401,
                    data: {},
                },
            };
            const result = mapApiError(error);

            // Verify structure
            expect(result).toHaveProperty('code');
            expect(result).toHaveProperty('message');
            expect(typeof result.code).toBe('string');
            expect(typeof result.message).toBe('string');
        });
    });

    describe('Error Message Consistency', () => {
        it('should always return Russian error messages for user-facing errors', () => {
            const testCases = [
                { status: 401, expectedMessage: 'Неверный логин или пароль' },
                { status: 409, expectedMessage: 'Пользователь уже существует' },
                { status: 500, expectedMessage: 'Сервис временно недоступен' },
            ];

            testCases.forEach(({ status, expectedMessage }) => {
                const error = {
                    response: {
                        status,
                        data: {},
                    },
                };
                const result = mapApiError(error);

                // Verify message is in Russian (contains Cyrillic characters)
                expect(result.message).toBe(expectedMessage);
                expect(/[а-яА-ЯёЁ]/.test(result.message)).toBe(true);
            });
        });

        it('should return English message for network errors', () => {
            const error = new TypeError('Failed to fetch');
            const result = mapApiError(error);

            expect(result.message).toBe('Check internet connection');
            expect(/^[a-zA-Z\s]+$/.test(result.message)).toBe(true);
        });
    });
});
