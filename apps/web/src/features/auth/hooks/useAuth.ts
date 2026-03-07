/**
 * Authentication hook for login and registration
 * Manages auth state, API calls, token storage, and navigation
 *
 * Validates: Requirements AC-1.5, AC-2.7, TR-2.3, TR-2.4
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, registerUser } from '@/features/auth/api/auth';
import { apiClient } from '@/shared/utils/api-client';
import { setRefreshToken, getRefreshToken, clearAuth } from '@/shared/utils/token-storage';
import type { AuthFormData, ConsentState, AuthError } from '@/features/auth/types';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function useAuth() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<AuthError | null>(null);

    /**
     * Login user with email and password
     * Validates: AC-1.5 (successful login redirects to dashboard)
     * Validates: AC-1.6 (failed login shows error message)
     */
    const login = async (data: AuthFormData) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await loginUser(data);

            // Store JWT token
            apiClient.setToken(response.token);

            // Store refresh token
            setRefreshToken(response.refresh_token);

            // Store user data in localStorage for quick access
            if (typeof window !== 'undefined') {
                localStorage.setItem('user', JSON.stringify(response.user));
            }

            toast.success('Вход выполнен успешно');
            if (response.user.role === 'super_admin') {
                router.push('/admin');
            } else if (response.user.role === 'coordinator') {
                router.push('/curator');
            } else if (!response.user.email_verified) {
                router.push('/auth/verify-email');
            } else if (!response.user.onboarding_completed) {
                router.push('/onboarding');
            } else {
                router.push('/dashboard');
            }
        } catch (err) {
            const authError = err as AuthError;
            setError(authError);
            toast.error(authError.message);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Register new user with email, password, and consents
     * Validates: AC-2.7 (successful registration auto-logs in and redirects to onboarding)
     * Validates: AC-2.8 (failed registration shows error message)
     */
    const register = async (data: AuthFormData, consents: ConsentState) => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await registerUser(data, consents);

            // Store JWT token (auto-login)
            apiClient.setToken(response.token);

            // Store refresh token
            setRefreshToken(response.refresh_token);

            // Store user data
            if (typeof window !== 'undefined') {
                localStorage.setItem('user', JSON.stringify(response.user));
            }

            toast.success('Регистрация успешна');
            router.push('/auth/verify-email');
        } catch (err) {
            const authError = err as AuthError;
            setError(authError);
            toast.error(authError.message);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Logout user
     * Revokes refresh token on backend, clears local auth data, redirects to auth page
     */
    const logout = async () => {
        const refreshToken = getRefreshToken();

        // Best-effort backend revocation
        if (refreshToken) {
            try {
                await fetch(`${API_BASE}/api/v1/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refresh_token: refreshToken }),
                });
            } catch {
                // Ignore errors — local cleanup proceeds regardless
            }
        }

        clearAuth();
        apiClient.clearToken();
        router.push('/auth');
    };

    return {
        login,
        register,
        logout,
        isLoading,
        error,
    };
}
