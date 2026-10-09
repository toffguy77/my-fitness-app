/**
 * Main authentication screen component
 * Handles both login and registration flows
 *
 * Validates: Requirements AC-1.3, AC-1.4, AC-1.5, AC-2.5, AC-2.7
 */

'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useFormValidation } from '@/features/auth/hooks/useFormValidation';
import { AuthForm } from './AuthForm';
import { ConsentSection } from './ConsentSection';
import { AuthFooter } from './AuthFooter';
import { AuthPanel, AuthShell } from './AuthShell';
import { ProviderButtons } from './ProviderButtons';
import { AccountRecoveryScreen } from './AccountRecoveryScreen';
import { MagicLinkForm } from './MagicLinkForm';
import { EVENTS, track } from '@/shared/analytics';
import type { AuthMode, AuthFormData, ConsentState } from '@/features/auth/types';
import { t } from '@/shared/i18n'

export interface AuthScreenProps {
    /**
     * С каким режимом открылся экран — из `?mode=register` на `/auth`
     * (посадочная страница). По умолчанию 'login'.
     *
     * Определяет и способ входа, открытый первым. Прежнее решение задачи 9
     * открывало форму ссылки в обоих режимах, и оба перехода с посадочной
     * приводили к одному и тому же экрану: одно поле почты и блок согласий.
     * Отличались заголовок, пояснение и подпись кнопки — этого не хватало:
     * владелец продукта, проверяя руками, сообщил, что «вход» и
     * «регистрация» ведут на одну и ту же страницу, а согласия на экране
     * входа читаются как признак регистрации.
     *
     * Теперь режимы расходятся по существу:
     *   login    — почта и пароль, без согласий (вход существующего);
     *   register — ссылка на почту с согласиями (заведение аккаунта).
     *
     * Оба способа остаются доступны в обоих режимах — переключателем,
     * который теперь выглядит нажимаемым.
     */
    initialMode?: AuthMode;
}

/** Второстепенное действие текстом: 44 px по высоте, без подложки. */
const TEXT_ACTION =
    'flex min-h-11 w-full items-center justify-center rounded-full text-sm font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

export function AuthScreen({ initialMode = 'login' }: AuthScreenProps = {}) {
    // Что открыто первым, решает режим: вход — пароль, регистрация — ссылка.
    // Второй способ остаётся в одном нажатии, без перезагрузки страницы.
    const [entryMethod, setEntryMethod] = useState<'link' | 'password'>(
        initialMode === 'register' ? 'link' : 'password',
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
        <AuthShell>
            <p className="-mt-4 mb-8 text-center type-title-3 text-fg-muted">
                {t('auth.tagline')}
            </p>

            <AuthPanel>
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
                        intent={mode}
                        onSwitchToPassword={() => setEntryMethod('password')}
                    />
                </div>
                {entryMethod === 'password' && (
                    <>
                        {/* Тот же заголовок, что у формы ссылки: экран называет,
                            зачем он открыт, каким бы способом ни входили. */}
                        <h2 className="mb-6 type-title-2 text-fg">
                            {t(`auth.magicLink.intent.${mode}.heading`)}
                        </h2>

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
                            <div className="mt-2">
                                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={formData.rememberMe ?? false}
                                        onChange={(e) =>
                                            setFormData({ ...formData, rememberMe: e.target.checked })
                                        }
                                        className="h-5 w-5 rounded-xs border-line accent-primary focus:ring-2 focus:ring-focus focus:ring-offset-2"
                                    />
                                    <span className="text-sm text-fg-muted">
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

                        {/* Action Buttons. In register mode the login button is not
                            rendered at all — not just demoted: a person here to make an
                            account must not be able to fire off a login attempt with a
                            password nobody has set yet, and "Зарегистрироваться" is the
                            button that is meant to be primary. Going back to signing in
                            is still one click away, via haveAccountSignIn below. */}
                        <div className="mt-6 space-y-3">
                            {mode === 'login' && (
                                <Button
                                    onClick={handleLogin}
                                    disabled={!isFormValid || isLoading}
                                    isLoading={isLoading}
                                    variant="primary"
                                    size="lg"
                                    block
                                    aria-label={t('auth.signIn')}
                                >
                                    {isLoading ? t('auth.signingIn') : t('auth.signIn')}
                                </Button>
                            )}

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
                                variant={mode === 'register' ? 'primary' : 'secondary'}
                                size="lg"
                                block
                                aria-label={t('auth.register')}
                            >
                                {mode === 'register'
                                    ? isLoading
                                        ? t('auth.registering')
                                        : t('auth.register')
                                    : t('auth.createAccount')}
                            </Button>

                            {mode === 'register' && (
                                <button
                                    type="button"
                                    onClick={() => setMode('login')}
                                    className={TEXT_ACTION}
                                >
                                    {t('auth.haveAccountSignIn')}
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => setEntryMethod('link')}
                                className={TEXT_ACTION}
                            >
                                {t('auth.magicLink.switchToLink')}
                            </button>
                        </div>
                    </>
                )}

                {/*
                    Provider sign-in is a third, independent entry
                    method — not a sub-case of the password form, so
                    it renders here regardless of entryMethod (and,
                    unlike the small text links above it, stays out
                    of both `entryMethod` branches so it is visible
                    whichever one is on screen). ProviderButtons
                    itself decides mode's wording ("войдите через" vs
                    "зарегистрируйтесь через") and already sets it
                    apart with a labelled divider and full-width
                    bordered buttons, matching the weight of the
                    primary actions above rather than reading as a
                    footnote to them.
                */}
                <ProviderButtons mode={mode} />
            </AuthPanel>

            <AuthFooter />
        </AuthShell>
    );
}
