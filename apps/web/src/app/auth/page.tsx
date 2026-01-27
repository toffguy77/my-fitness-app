/**
 * Authentication page
 * Entry point for login and registration
 *
 * Validates: Requirements US-1, US-2
 */

import { AuthScreen } from '@/features/auth/components';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Вход | Physical Life',
    description: 'Войдите в свой аккаунт или создайте новый',
};

export default function AuthPage() {
    return <AuthScreen />;
}
