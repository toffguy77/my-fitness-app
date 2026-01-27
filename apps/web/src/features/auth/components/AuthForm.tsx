/**
 * Authentication form component
 * Renders email and password inputs with validation
 *
 * Validates: Requirements AC-1.1, AC-1.2, AC-3.1, AC-5.1, AC-5.3
 */

'use client';

import Link from 'next/link';
import { Input } from '@/shared/components/ui';
import type { AuthFormData, ValidationErrors } from '@/features/auth/types';

export interface AuthFormProps {
    formData: AuthFormData;
    setFormData: (data: AuthFormData) => void;
    errors: ValidationErrors;
    onEmailBlur: () => void;
    onPasswordBlur: () => void;
}

export function AuthForm({
    formData,
    setFormData,
    errors,
    onEmailBlur,
    onPasswordBlur,
}: AuthFormProps) {
    return (
        <div className="space-y-4">
            <Input
                type="email"
                label="Email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                onBlur={onEmailBlur}
                error={errors.email}
                required
                aria-label="Email address"
            />

            <Input
                type="password"
                label="Пароль"
                placeholder="Минимум 6 символов"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onBlur={onPasswordBlur}
                error={errors.password}
                required
                aria-label="Password"
            />

            <div className="text-right">
                <Link
                    href="/auth/reset"
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                    Забыл пароль?
                </Link>
            </div>
        </div>
    );
}
