/**
 * Main authentication screen component
 * Handles both login and registration flows
 *
 * Validates: Requirements AC-1.3, AC-1.4, AC-1.5, AC-2.5, AC-2.7
 */

'use client';

import { useState } from 'react';
import { Button, Logo } from '@/shared/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useFormValidation } from '@/features/auth/hooks/useFormValidation';
import { AuthForm } from './AuthForm';
import { ConsentSection } from './ConsentSection';
import { AuthFooter } from './AuthFooter';
import { ProviderButtons } from './ProviderButtons';
import { AccountRecoveryScreen } from './AccountRecoveryScreen';
import { MagicLinkForm } from './MagicLinkForm';
import { EVENTS, track } from '@/shared/analytics';
import type { AuthMode, AuthFormData, ConsentState } from '@/features/auth/types';
import { t } from '@/shared/i18n'

export interface AuthScreenProps {
    /**
     * С каким режимом открылся экран — из `?mode=register` на `/auth`
     * (задача 9, посадочная страница). По умолчанию 'login': экран
     * открывается на входе по ссылке, как и раньше.
     *
     * MagicLinkForm сама по себе не различает вход и регистрацию — один и
     * тот же адрес и то же согласие работают для обоих, а её тексты
     * («Получить ссылку для входа», «Войти по паролю») говорят только про
     * вход. Поэтому 'register' не просто меняет `mode`: он ещё и сразу
     * открывает форму пароля (`entryMethod: 'password'`) в её
     * register-варианте — там, где кнопка подписана «Зарегистрироваться» и
     * видна ConsentSection. Человек, пришедший за аккаунтом, не должен
     * упереться в экран, весь текст которого — про вход.
     */
    initialMode?: AuthMode;
}

export function AuthScreen({ initialMode = 'login' }: AuthScreenProps = {}) {
    // Вход по ссылке — то, что видно первым для входа; форма пароля не третий
    // режим, а второй способ войти тем же mode, раскрываемый без перезагрузки
    // страницы. Регистрация — исключение: у неё нет отдельного признака в
    // MagicLinkForm, поэтому она сразу открывает форму пароля.
    const [entryMethod, setEntryMethod] = useState<'link' | 'password'>(
        initialMode === 'register' ? 'password' : 'link'
    );
    const [mode, setMode] = useState<AuthMode>(initialMode);
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

    const { login, register, isLoading, pendingDeletion, clearPendingDeletion } = useAuth();
    const { errors, validateEmail, validatePassword, validateLogin, validateRegister } =
        useFormValidation();

    const handleEmailBlur = () => {
        const trimmed = formData.email.trim();
        if (trimmed !== formData.email) {
            setFormData({ ...formData, email: trimmed });
        }
        if (trimmed) {
            validateEmail(trimmed);
        }
    };

    const handlePasswordBlur = () => {
        // Only while registering. On the sign-in form the complexity rules
        // describe a password the user has already chosen — telling them their
        // correct password needs a capital letter is both wrong and, because
        // the message appears on blur, it pushes the button out from under the
        // click that caused the blur.
        if (mode === 'register' && formData.password) {
            validatePassword(formData.password);
        }
    };

    const handleLogin = async () => {
        const cleaned = { ...formData, email: formData.email.trim() };
        if (!validateLogin(cleaned)) {
            return;
        }
        await login(cleaned);
    };

    const handleRegister = async () => {
        const cleaned = { ...formData, email: formData.email.trim() };
        if (!validateRegister(cleaned, consents)) {
            return;
        }
        await register(cleaned, consents);
    };

    const isFormValid = formData.email && formData.password;
    const isRegisterValid =
        isFormValid &&
        consents.terms_of_service &&
        consents.privacy_policy &&
        consents.data_processing;

    // The way back takes over the screen: it is the only thing worth doing
    // until they answer it.
    if (pendingDeletion) {
        return (
            <AccountRecoveryScreen
                scheduledFor={pendingDeletion}
                onDismiss={clearPendingDeletion}
            />
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 py-6">
                <div className="max-w-md mx-auto px-6 text-center">
                    <div className="flex justify-center mb-2">
                        <Logo width={160} height={48} className="text-gray-900" />
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                        {t('auth.tagline')}
                    </p>
                </div>
            </header>

            {/* Main Form */}
            <main className="flex-1 py-8">
                <div className="max-w-md mx-auto px-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        {/*
                            MagicLinkForm stays mounted even while the password
                            form is showing — `hidden`, not a conditional
                            unmount. It holds its own email/consents/"sent"
                            state; unmounting it on every switch threw that
                            away, so coming back from the password form always
                            showed a blank form, and coming back after a
                            successful send invited a second one.
                        */}
                        <div hidden={entryMethod !== 'link'}>
                            <MagicLinkForm
                                onSwitchToPassword={() => setEntryMethod('password')}
                            />
                        </div>
                        {entryMethod === 'password' && (
                            <>
                                <AuthForm
                                    formData={formData}
                                    setFormData={setFormData}
                                    errors={errors}
                                    onEmailBlur={handleEmailBlur}
                                    onPasswordBlur={handlePasswordBlur}
                                    mode={mode}
                                />

                                {/* Remember Me (Login only) */}
                                {mode === 'login' && (
                                    <div className="mt-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.rememberMe ?? false}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, rememberMe: e.target.checked })
                                                }
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-600">
                                                {t('auth.rememberMe')}
                                            </span>
                                        </label>
                                    </div>
                                )}

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
                                        {isLoading && mode === 'login' ? t('auth.signingIn') : t('auth.signIn')}
                                    </Button>

                                    <Button
                                        onClick={() => {
                                            if (mode === 'login') {
                                                track(EVENTS.registrationOpened, { method: 'password' });
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
                                                ? t('auth.registering')
                                                : t('auth.register')
                                            : t('auth.createAccount')}
                                    </Button>

                                    {mode === 'register' && (
                                        <button
                                            onClick={() => setMode('login')}
                                            className="w-full text-sm text-gray-600 hover:text-gray-900"
                                        >
                                            {t('auth.haveAccountSignIn')}
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setEntryMethod('link')}
                                        className="w-full text-sm text-gray-600 hover:text-gray-900"
                                    >
                                        {t('auth.magicLink.switchToLink')}
                                    </button>
                                </div>

                                <ProviderButtons mode={mode} />
                            </>
                        )}
                    </div>

                    <AuthFooter />
                </div>
            </main>
        </div>
    );
}
