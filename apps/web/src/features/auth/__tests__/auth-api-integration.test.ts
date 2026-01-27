/**
 * Integration tests for authentication API functions
 * Uses fetch mocking to test Golang backend integration
 *
 * Validates: Requirements AC-1.5, AC-1.6, AC-2.7, AC-2.8
 */

import { loginUser, registerUser } from '../api/auth';
import type { AuthFormData, ConsentState } from '../types';

const API_BASE = 'http://localhost:4000';

// Mock fetch globally
global.fetch = jest.fn();

beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
});

describe('Authentication API Integration', () => {
    describe('loginUser', () => {
        it('should successfully login with valid credentials', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    user: {
                        id: '550e8400-e29b-41d4-a716-446655440000',
                        email: 'user@example.com',
                        role: 'client',
                        created_at: '2024-01-15T10:30:00Z',
                    },
                    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                }),
            });

            const credentials: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            const result = await loginUser(credentials);

            expect(result).toHaveProperty('user');
            expect(result).toHaveProperty('token');
            expect(result.user.email).toBe('user@example.com');
            expect(result.token).toBeTruthy();
        });

        it('should throw invalid credentials error on 401', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({
                    status: 'error',
                    message: 'Invalid credentials',
                }),
            });

            const credentials: AuthFormData = {
                email: 'wrong@example.com',
                password: 'wrongpassword',
            };

            await expect(loginUser(credentials)).rejects.toMatchObject({
                code: 'invalid_credentials',
                message: 'Неверный логин или пароль',
            });
        });

        it('should throw server error on 500', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({}),
            });

            const credentials: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            await expect(loginUser(credentials)).rejects.toMatchObject({
                code: 'server_error',
                message: 'Сервис временно недоступен',
            });
        });

        it('should throw network error on fetch failure', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

            const credentials: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            await expect(loginUser(credentials)).rejects.toMatchObject({
                code: 'network_error',
                message: 'Check internet connection',
            });
        });
    });

    describe('registerUser', () => {
        it('should successfully register with valid data', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    user: {
                        id: '550e8400-e29b-41d4-a716-446655440001',
                        email: 'newuser@example.com',
                        role: 'client',
                        created_at: '2024-01-15T10:30:00Z',
                    },
                    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                }),
            });

            const credentials: AuthFormData = {
                email: 'newuser@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            const result = await registerUser(credentials, consents);

            expect(result).toHaveProperty('user');
            expect(result).toHaveProperty('token');
            expect(result.user.email).toBe('newuser@example.com');
        });

        it('should throw user exists error on 409', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: async () => ({
                    message: 'User already exists',
                }),
            });

            const credentials: AuthFormData = {
                email: 'existing@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            await expect(registerUser(credentials, consents)).rejects.toMatchObject({
                code: 'user_exists',
                message: 'Пользователь уже существует',
            });
        });

        it('should throw validation error on 400', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({
                    message: 'Email is required',
                }),
            });

            const credentials: AuthFormData = {
                email: '',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            await expect(registerUser(credentials, consents)).rejects.toMatchObject({
                code: 'validation_error',
                message: 'Email is required',
            });
        });

        it('should throw network error on fetch failure', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

            const credentials: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            await expect(registerUser(credentials, consents)).rejects.toMatchObject({
                code: 'network_error',
            });
        });
    });
});
