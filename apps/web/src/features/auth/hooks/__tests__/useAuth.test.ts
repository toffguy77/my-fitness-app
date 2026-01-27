/**
 * Tests for useAuth hook
 * Includes property-based tests and unit tests for authentication flows
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import fc from 'fast-check';
import { useAuth } from '../useAuth';
import * as authApi from '../../api/auth';
import { apiClient } from '@/shared/utils/api-client';
import toast from 'react-hot-toast';
import type { AuthFormData, ConsentState, AuthResponse, AuthError } from '../../types';

// Mock dependencies
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}));

jest.mock('../../api/auth', () => ({
    loginUser: jest.fn(),
    registerUser: jest.fn(),
}));

jest.mock('react-hot-toast', () => ({
    success: jest.fn(),
    error: jest.fn(),
}));

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        setToken: jest.fn(),
        clearToken: jest.fn(),
    },
}));

describe('useAuth', () => {
    const mockPush = jest.fn();
    const mockLoginUser = authApi.loginUser as jest.MockedFunction<typeof authApi.loginUser>;
    const mockRegisterUser = authApi.registerUser as jest.MockedFunction<typeof authApi.registerUser>;

    // Mock localStorage at module level
    const localStorageMock: { [key: string]: string } = {};
    const mockGetItem = jest.fn((key: string) => localStorageMock[key] || null);
    const mockSetItem = jest.fn((key: string, value: string) => {
        localStorageMock[key] = value;
    });
    const mockRemoveItem = jest.fn((key: string) => {
        delete localStorageMock[key];
    });
    const mockClear = jest.fn(() => {
        Object.keys(localStorageMock).forEach(key => delete localStorageMock[key]);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (useRouter as jest.Mock).mockReturnValue({ push: mockPush });

        // Clear localStorage data
        Object.keys(localStorageMock).forEach(key => delete localStorageMock[key]);

        // Set up localStorage mock
        Object.defineProperty(global, 'localStorage', {
            value: {
                getItem: mockGetItem,
                setItem: mockSetItem,
                removeItem: mockRemoveItem,
                clear: mockClear,
                length: 0,
                key: jest.fn(),
            },
            writable: true,
        });
    });

    describe('Property 5: Successful Login Flow', () => {
        it('should store token, show success toast, and redirect to dashboard on successful login', async () => {
            // Feature: auth-screen, Property 5: Successful Login Flow
            // **Validates: Requirements AC-1.5**

            const mockResponse: AuthResponse = {
                user: {
                    id: '123',
                    email: 'test@example.com',
                    role: 'client',
                    created_at: new Date().toISOString(),
                },
                token: 'mock-jwt-token',
            };

            mockLoginUser.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useAuth());

            const loginData: AuthFormData = {
                email: 'test@example.com',
                password: 'password123',
            };

            await act(async () => {
                await result.current.login(loginData);
            });

            // Verify token was stored
            expect(apiClient.setToken).toHaveBeenCalledWith('mock-jwt-token');

            // Verify user data was stored
            expect(mockSetItem).toHaveBeenCalledWith(
                'user',
                JSON.stringify(mockResponse.user)
            );

            // Verify success toast was shown
            expect(toast.success).toHaveBeenCalledWith('Вход выполнен успешно');

            // Verify redirect to dashboard
            expect(mockPush).toHaveBeenCalledWith('/dashboard');

            // Verify loading state
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should handle login errors and show error toast', async () => {
            // Feature: auth-screen, Property 5: Successful Login Flow
            // **Validates: Requirements AC-1.6**

            const mockError: AuthError = {
                code: 'invalid_credentials',
                message: 'Неверный логин или пароль',
            };

            mockLoginUser.mockRejectedValue(mockError);

            const { result } = renderHook(() => useAuth());

            const loginData: AuthFormData = {
                email: 'test@example.com',
                password: 'wrongpassword',
            };

            await act(async () => {
                await result.current.login(loginData);
            });

            // Verify error was set
            expect(result.current.error).toEqual(mockError);

            // Verify error toast was shown
            expect(toast.error).toHaveBeenCalledWith('Неверный логин или пароль');

            // Verify no redirect occurred
            expect(mockPush).not.toHaveBeenCalled();

            // Verify no token was stored
            expect(apiClient.setToken).not.toHaveBeenCalled();

            // Verify loading state
            expect(result.current.isLoading).toBe(false);
        });
    });

    describe('Property 6: Successful Registration Flow', () => {
        it('should auto-login, store token, show success toast, and redirect to onboarding on successful registration', async () => {
            // Feature: auth-screen, Property 6: Successful Registration Flow
            // **Validates: Requirements AC-2.7**

            const mockResponse: AuthResponse = {
                user: {
                    id: '456',
                    email: 'newuser@example.com',
                    role: 'client',
                    created_at: new Date().toISOString(),
                },
                token: 'new-user-jwt-token',
            };

            mockRegisterUser.mockResolvedValue(mockResponse);

            const { result } = renderHook(() => useAuth());

            const registerData: AuthFormData = {
                email: 'newuser@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            await act(async () => {
                await result.current.register(registerData, consents);
            });

            // Verify token was stored (auto-login)
            expect(apiClient.setToken).toHaveBeenCalledWith('new-user-jwt-token');

            // Verify user data was stored
            expect(mockSetItem).toHaveBeenCalledWith(
                'user',
                JSON.stringify(mockResponse.user)
            );

            // Verify success toast was shown
            expect(toast.success).toHaveBeenCalledWith('Регистрация успешна');

            // Verify redirect to onboarding
            expect(mockPush).toHaveBeenCalledWith('/onboarding');

            // Verify loading state
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should handle registration errors and show error toast', async () => {
            // Feature: auth-screen, Property 6: Successful Registration Flow
            // **Validates: Requirements AC-2.8**

            const mockError: AuthError = {
                code: 'user_exists',
                message: 'Пользователь уже существует',
            };

            mockRegisterUser.mockRejectedValue(mockError);

            const { result } = renderHook(() => useAuth());

            const registerData: AuthFormData = {
                email: 'existing@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            await act(async () => {
                await result.current.register(registerData, consents);
            });

            // Verify error was set
            expect(result.current.error).toEqual(mockError);

            // Verify error toast was shown
            expect(toast.error).toHaveBeenCalledWith('Пользователь уже существует');

            // Verify no redirect occurred
            expect(mockPush).not.toHaveBeenCalled();

            // Verify no token was stored
            expect(apiClient.setToken).not.toHaveBeenCalled();

            // Verify loading state
            expect(result.current.isLoading).toBe(false);
        });
    });

    describe('Login Flow', () => {
        it('should set loading state during login', async () => {
            const mockResponse: AuthResponse = {
                user: {
                    id: '123',
                    email: 'test@example.com',
                    role: 'client',
                    created_at: new Date().toISOString(),
                },
                token: 'mock-jwt-token',
            };

            // Create a promise we can control
            let resolveLogin: (value: AuthResponse) => void;
            const loginPromise = new Promise<AuthResponse>((resolve) => {
                resolveLogin = resolve;
            });

            mockLoginUser.mockReturnValue(loginPromise);

            const { result } = renderHook(() => useAuth());

            const loginData: AuthFormData = {
                email: 'test@example.com',
                password: 'password123',
            };

            // Start login
            act(() => {
                result.current.login(loginData);
            });

            // Check loading state is true
            await waitFor(() => {
                expect(result.current.isLoading).toBe(true);
            });

            // Resolve the login
            await act(async () => {
                resolveLogin!(mockResponse);
                await loginPromise;
            });

            // Check loading state is false
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('should clear previous errors on new login attempt', async () => {
            const mockError: AuthError = {
                code: 'invalid_credentials',
                message: 'Неверный логин или пароль',
            };

            const mockResponse: AuthResponse = {
                user: {
                    id: '123',
                    email: 'test@example.com',
                    role: 'client',
                    created_at: new Date().toISOString(),
                },
                token: 'mock-jwt-token',
            };

            // First login fails
            mockLoginUser.mockRejectedValueOnce(mockError);

            const { result } = renderHook(() => useAuth());

            const loginData: AuthFormData = {
                email: 'test@example.com',
                password: 'wrongpassword',
            };

            await act(async () => {
                await result.current.login(loginData);
            });

            expect(result.current.error).toEqual(mockError);

            // Second login succeeds
            mockLoginUser.mockResolvedValueOnce(mockResponse);

            await act(async () => {
                await result.current.login({ ...loginData, password: 'correctpassword' });
            });

            // Error should be cleared
            expect(result.current.error).toBeNull();
        });
    });

    describe('Registration Flow', () => {
        it('should set loading state during registration', async () => {
            const mockResponse: AuthResponse = {
                user: {
                    id: '456',
                    email: 'newuser@example.com',
                    role: 'client',
                    created_at: new Date().toISOString(),
                },
                token: 'new-user-jwt-token',
            };

            let resolveRegister: (value: AuthResponse) => void;
            const registerPromise = new Promise<AuthResponse>((resolve) => {
                resolveRegister = resolve;
            });

            mockRegisterUser.mockReturnValue(registerPromise);

            const { result } = renderHook(() => useAuth());

            const registerData: AuthFormData = {
                email: 'newuser@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            // Start registration
            act(() => {
                result.current.register(registerData, consents);
            });

            // Check loading state is true
            await waitFor(() => {
                expect(result.current.isLoading).toBe(true);
            });

            // Resolve the registration
            await act(async () => {
                resolveRegister!(mockResponse);
                await registerPromise;
            });

            // Check loading state is false
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('should clear previous errors on new registration attempt', async () => {
            const mockError: AuthError = {
                code: 'user_exists',
                message: 'Пользователь уже существует',
            };

            const mockResponse: AuthResponse = {
                user: {
                    id: '456',
                    email: 'newuser@example.com',
                    role: 'client',
                    created_at: new Date().toISOString(),
                },
                token: 'new-user-jwt-token',
            };

            // First registration fails
            mockRegisterUser.mockRejectedValueOnce(mockError);

            const { result } = renderHook(() => useAuth());

            const registerData: AuthFormData = {
                email: 'existing@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            await act(async () => {
                await result.current.register(registerData, consents);
            });

            expect(result.current.error).toEqual(mockError);

            // Second registration succeeds with different email
            mockRegisterUser.mockResolvedValueOnce(mockResponse);

            await act(async () => {
                await result.current.register(
                    { ...registerData, email: 'newuser@example.com' },
                    consents
                );
            });

            // Error should be cleared
            expect(result.current.error).toBeNull();
        });
    });

    describe('Logout Flow', () => {
        it('should clear token, remove user data, and redirect to auth page', () => {
            const { result } = renderHook(() => useAuth());

            act(() => {
                result.current.logout();
            });

            // Verify token was cleared
            expect(apiClient.clearToken).toHaveBeenCalled();

            // Verify user data was removed
            expect(mockRemoveItem).toHaveBeenCalledWith('user');

            // Verify redirect to auth page
            expect(mockPush).toHaveBeenCalledWith('/auth');
        });
    });

    describe('Error Handling', () => {
        it('should handle network errors during login', async () => {
            const networkError: AuthError = {
                code: 'network_error',
                message: 'Check internet connection',
            };

            mockLoginUser.mockRejectedValue(networkError);

            const { result } = renderHook(() => useAuth());

            await act(async () => {
                await result.current.login({
                    email: 'test@example.com',
                    password: 'password123',
                });
            });

            expect(result.current.error).toEqual(networkError);
            expect(toast.error).toHaveBeenCalledWith('Check internet connection');
        });

        it('should handle server errors during registration', async () => {
            const serverError: AuthError = {
                code: 'server_error',
                message: 'Сервис временно недоступен',
            };

            mockRegisterUser.mockRejectedValue(serverError);

            const { result } = renderHook(() => useAuth());

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            await act(async () => {
                await result.current.register(
                    { email: 'test@example.com', password: 'password123' },
                    consents
                );
            });

            expect(result.current.error).toEqual(serverError);
            expect(toast.error).toHaveBeenCalledWith('Сервис временно недоступен');
        });
    });
});
