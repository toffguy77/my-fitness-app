/**
 * Authentication page
 * Entry point for login and registration
 *
 * Validates: Requirements US-1, US-2
 */

import { AuthScreen } from '@/features/auth/components';
import type { AuthMode } from '@/features/auth/types';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Вход',
    description: 'Войдите в свой аккаунт или создайте новый',
    robots: { index: false, follow: false },
};

export default async function AuthPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
    const params = (await searchParams) ?? {};
    // Единственное значение, которое посадочная страница (задача 9) и любой
    // другой источник могут задать явно — 'register'; всё прочее, включая
    // отсутствие параметра, — обычный вход, как и было.
    const initialMode: AuthMode = params.mode === 'register' ? 'register' : 'login';

    return <AuthScreen initialMode={initialMode} />;
}
