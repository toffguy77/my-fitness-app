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
import type { AuthFormData, ConsentState, AuthError } from '@/features/auth/types';
import toast from 'react-hot-toast';

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

            // Store user data in localStorage for quick access
            if (typeof window !== 'undefined') {
                localStorage.setItem('user', JSON.stringify(response.user));
            }

            toast.success('Вход выполнен успешно');
            router.push('/dashboard');
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

            // Store user data
            if (typeof window !== 'undefined') {
                localStorage.setItem('user', JSON.stringify(response.user));
            }

            toast.success('Регистрация успешна');
            router.push('/onboarding');
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
     * Clears token and user data, redirects to auth page
     */
    const logout = () => {
        apiClient.clearToken();
        if (typeof window !== 'undefined') {
            localStorage.removeItem('user');
        }
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
