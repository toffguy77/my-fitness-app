/**
 * Authentication API client functions
 * Integrates with Golang backend API for login and registration
 */

import { apiClient } from '@/shared/utils/api-client';
import type { AuthFormData, ConsentState, AuthResponse, AuthError } from '@/features/auth/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Login user with email and password
 * @param data - User credentials
 * @returns Authentication response with user data and JWT token
 * @throws AuthError on failure
 */
export async function loginUser(data: AuthFormData): Promise<AuthResponse> {
    try {
        const response = await apiClient.post<AuthResponse>(`${API_BASE}/api/v1/auth/login`, {
            email: data.email,
            password: data.password,
        });

        return response;
    } catch (error: any) {
        throw mapApiError(error);
    }
}

/**
 * Register new user with email, password, and consents
 * @param data - User credentials
 * @param consents - Legal consent state
 * @returns Authentication response with user data and JWT token
 * @throws AuthError on failure
 */
export async function registerUser(
    data: AuthFormData,
    consents: ConsentState
): Promise<AuthResponse> {
    try {
        const response = await apiClient.post<AuthResponse>(`${API_BASE}/api/v1/auth/register`, {
            email: data.email,
            password: data.password,
            consents: consents,
        });

        return response;
    } catch (error: any) {
        throw mapApiError(error);
    }
}

/**
 * Map API errors to user-facing error messages
 * @param error - Raw error from API client
 * @returns Structured AuthError with appropriate message
 */
export function mapApiError(error: any): AuthError {
    // Network errors
    if (error.name === 'TypeError' || error.message?.includes('fetch')) {
        return {
            code: 'network_error',
            message: 'Check internet connection',
        };
    }

    // API error responses
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    // Check message-based errors first (more specific)
    if (message?.toLowerCase().includes('already exists')) {
        return {
            code: 'user_exists',
            message: 'Пользователь уже существует',
        };
    }

    if (message?.toLowerCase().includes('invalid credentials')) {
        return {
            code: 'invalid_credentials',
            message: 'Неверный логин или пароль',
        };
    }

    // Then check status codes
    if (status === 401) {
        return {
            code: 'invalid_credentials',
            message: 'Неверный логин или пароль',
        };
    }

    if (status === 409) {
        return {
            code: 'user_exists',
            message: 'Пользователь уже существует',
        };
    }

    if (status === 400) {
        return {
            code: 'validation_error',
            message: message || 'Invalid request data',
        };
    }

    if (status >= 500) {
        return {
            code: 'server_error',
            message: 'Сервис временно недоступен',
        };
    }

    return {
        code: 'server_error',
        message: 'Сервис временно недоступен',
    };
}
