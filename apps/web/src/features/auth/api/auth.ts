/**
 * Authentication API client functions
 * Integrates with Golang backend API for login and registration
 */

import { isApiError, isNetworkError } from '@/shared/errors/apiErrors';
import { apiClient } from '@/shared/utils/api-client';
import { leadToken } from '@/features/onboarding/api/guest';
import { visitorId } from '@/shared/analytics';
import type { AuthFormData, ConsentState, AuthResponse, AuthError } from '@/features/auth/types';
import { t } from '@/shared/i18n';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

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
            remember_me: data.rememberMe ?? false,
        });

        return response;
    } catch (error) {
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
            // Whatever they worked out before registering. Without it the new
            // account asks the same six questions again.
            lead_token: leadToken() ?? undefined,
            // Joins what this browser did before the account to what it does
            // after; without it the funnel breaks at exactly that point.
            visitor_id: visitorId() || undefined,
        });

        return response;
    } catch (error) {
        throw mapApiError(error);
    }
}

/**
 * Map API errors to user-facing error messages
 * @param error - Raw error from API client
 * @returns Structured AuthError with appropriate message
 */
export function mapApiError(error: unknown): AuthError {
    // Transport failures. The api client now raises a typed NetworkError; the
    // TypeError check stays for any call path that still reaches fetch directly.
    if (
        isNetworkError(error) ||
        (error instanceof Error && (error.name === 'TypeError' || error.message.includes('fetch')))
    ) {
        return {
            code: 'network_error',
            message: 'Check internet connection',
        };
    }

    // API error responses
    const status = isApiError(error) ? error.status : undefined;
    const body = isApiError(error) ? (error.data as { message?: string } | undefined) : undefined;
    // What the server said, kept apart from what the client threw: the two are
    // not interchangeable. `ApiError.message` is "API request failed with
    // status 400", which is fine for a substring check and no use to a reader.
    const serverMessage = body?.message;
    const message = serverMessage || (error instanceof Error ? error.message : undefined);

    // Check message-based errors first (more specific)
    if (message?.toLowerCase().includes('already exists')) {
        return {
            code: 'user_exists',
            message: t('auth.userExists'),
        };
    }

    if (message?.toLowerCase().includes('invalid credentials')) {
        return {
            code: 'invalid_credentials',
            message: t('auth.invalidCredentials'),
        };
    }

    // Then check status codes
    if (status === 401) {
        return {
            code: 'invalid_credentials',
            message: t('auth.invalidCredentials'),
        };
    }

    if (status === 409) {
        return {
            code: 'user_exists',
            message: t('auth.userExists'),
        };
    }

    if (status === 400) {
        return {
            code: 'validation_error',
            message: serverMessage || 'Invalid request data',
        };
    }

    if (status !== undefined && status >= 500) {
        return {
            code: 'server_error',
            message: t('auth.serviceUnavailable'),
        };
    }

    return {
        code: 'server_error',
        message: t('auth.serviceUnavailable'),
    };
}
