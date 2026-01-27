/**
 * Main authentication screen component
 * Handles both login and registration flows
 *
 * Validates: Requirements AC-1.3, AC-1.4, AC-1.5, AC-2.5, AC-2.7
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Logo } from '@/shared/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useFormValidation } from '@/features/auth/hooks/useFormValidation';
import { AuthForm } from './AuthForm';
import { ConsentSection } from './ConsentSection';
import { AuthFooter } from './AuthFooter';
import type { AuthMode, AuthFormData, ConsentState } from '@/features/auth/types';

export function AuthScreen() {
    const [mode, setMode] = useState<AuthMode>('login');
    const [formData, setFormData] = useState<AuthFormData>({
        email: '',
        password: '',
    });
    const [consents, setConsents] = useState<ConsentState>({
        terms_of_service: false,
        privacy_policy: false,
        data_processing: false,
        marketing: false,
    });

    const { login, register, isLoading } = useAuth();
    const { errors, validateEmail, validatePassword, validateLogin, validateRegister } =
        useFormValidation();

    const handleEmailBlur = () => {
        if (formData.email) {
            validateEmail(formData.email);
        }
    };

    const handlePasswordBlur = () => {
        if (formData.password) {
            validatePassword(formData.password);
        }
    };

    const handleLogin = async () => {
        if (!validateLogin(formData)) {
            return;
        }
        await login(formData);
    };

    const handleRegister = async () => {
        if (!validateRegister(formData, consents)) {
            return;
        }
        await register(formData, consents);
    };

    const isFormValid = formData.email && formData.password;
    const isRegisterValid =
        isFormValid &&
        consents.terms_of_service &&
        consents.privacy_policy &&
        consents.data_processing;

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 py-6">
                <div className="max-w-md mx-auto px-6 text-center">
                    <div className="flex justify-center mb-2">
                        <Logo width={160} height={48} className="text-gray-900" />
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                        Ваш персональный дневник питания
                    </p>
                </div>
            </header>

            {/* Main Form */}
            <main className="flex-1 py-8">
                <div className="max-w-md mx-auto px-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <AuthForm
                            formData={formData}
                            setFormData={setFormData}
                            errors={errors}
                            onEmailBlur={handleEmailBlur}
                            onPasswordBlur={handlePasswordBlur}
                        />

                        {/* Consent Section (Registration only) */}
                        {mode === 'register' && (
                            <ConsentSection
                                consents={consents}
                                setConsents={setConsents}
                                error={errors.consents}
                            />
                        )}

                        {/* Action Buttons */}
                        <div className="mt-6 space-y-3">
                            <Button
                                onClick={handleLogin}
                                disabled={!isFormValid || isLoading}
                                isLoading={isLoading && mode === 'login'}
                                variant="primary"
                                className="w-full"
                                aria-label="Log in to your account"
                            >
                                {isLoading && mode === 'login' ? 'Вход...' : 'Войти'}
                            </Button>

                            {mode === 'login' && (
                                <div className="text-center">
                                    <Link
                                        href="/forgot-password"
                                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        Забыли пароль?
                                    </Link>
                                </div>
                            )}

                            <Button
                                onClick={() => {
                                    if (mode === 'login') {
                                        setMode('register');
                                    } else {
                                        handleRegister();
                                    }
                                }}
                                disabled={(mode === 'register' && !isRegisterValid) || isLoading}
                                isLoading={isLoading && mode === 'register'}
                                variant="outline"
                                className="w-full"
                                aria-label="Register a new account"
                            >
                                {mode === 'register'
                                    ? isLoading
                                        ? 'Регистрация...'
                                        : 'Зарегистрироваться'
                                    : 'Создать аккаунт'}
                            </Button>

                            {mode === 'register' && (
                                <button
                                    onClick={() => setMode('login')}
                                    className="w-full text-sm text-gray-600 hover:text-gray-900"
                                >
                                    Уже есть аккаунт? Войти
                                </button>
                            )}
                        </div>
                    </div>

                    <AuthFooter />
                </div>
            </main>
        </div>
    );
}
