/**
 * Форма запроса одноразовой ссылки — одна и та же для входа и регистрации.
 * Отдельной регистрации по ссылке нет: человек вводит почту, и сервер сам
 * решает, завести аккаунт или впустить в существующий (задача 9, ruling
 * по разведению регистрации и входа). `intent` не меняет поведение формы —
 * только заголовок, пояснение и подпись кнопки, чтобы экран не молчал о том,
 * зачем он открыт человеку, который пришёл заводить аккаунт.
 *
 * Согласия те же, что и у обычной регистрации (ConsentSection, ConsentState):
 * обработка данных начинается здесь, с отправки письма на указанный адрес, а
 * не позже, при переходе по ссылке — поэтому запрашиваются на этом шаге, а
 * не на странице перехода (задача 8).
 *
 * После отправки форма заменяется текстом, который дословно повторяет ответ
 * сервера. Сервер отвечает одним и тем же текстом для существующего и
 * несуществующего адреса, чтобы эндпоинт нельзя было использовать как
 * проверку наличия аккаунта — здесь важно не добавить ничего, что выдало бы
 * это различие. По той же причине текст после отправки не зависит от
 * `intent`: он про то, что сделал сервер, а не про то, зачем открывали форму.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@/shared/components/ui';
import { ConsentSection } from './ConsentSection';
import { useFormValidation } from '@/features/auth/hooks/useFormValidation';
import { magicLinkApi } from '@/features/auth/api/magicLink';
import { isApiError, messageFor } from '@/shared/errors/apiErrors';
import type { ConsentState } from '@/features/auth/types';
import { t } from '@/shared/i18n';
import { EVENTS, track } from '@/shared/analytics';

export interface MagicLinkFormProps {
    /** Раскрывает форму пароля — второй способ входа, на том же экране. */
    onSwitchToPassword: () => void;
    /**
     * С каким намерением открыт экран — определяет только текст (заголовок,
     * пояснение, подпись кнопки), не поведение формы. По умолчанию 'login'.
     */
    intent?: 'login' | 'register';
}

export function MagicLinkForm({ onSwitchToPassword, intent = 'login' }: MagicLinkFormProps) {
    const [email, setEmail] = useState('');
    const [consents, setConsents] = useState<ConsentState>({
        terms_of_service: false,
        privacy_policy: false,
        data_processing: false,
        marketing: false,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const { errors, validateEmail } = useFormValidation();

    // The button that had focus vanishes the moment the form is replaced by
    // the confirmation — without this, focus falls back to <body> and a
    // screen-reader user hears nothing, so they press "Получить ссылку"
    // again and burn one of five attempts in fifteen minutes for no reason.
    const sentMessageRef = useRef<HTMLParagraphElement>(null);
    useEffect(() => {
        if (sent) {
            sentMessageRef.current?.focus();
        }
    }, [sent]);

    const handleEmailBlur = () => {
        const trimmed = email.trim();
        if (trimmed !== email) {
            setEmail(trimmed);
        }
        if (trimmed) {
            validateEmail(trimmed);
        }
    };

    const canSubmit =
        Boolean(email.trim()) &&
        consents.terms_of_service &&
        consents.privacy_policy &&
        consents.data_processing;

    const handleSubmit = async () => {
        const trimmed = email.trim();
        if (!validateEmail(trimmed) || !canSubmit) {
            return;
        }

        setErrorMessage(null);
        setIsSubmitting(true);
        try {
            await magicLinkApi.request(trimmed, consents);
            // No property here on purpose: the server answers the same way
            // for an address with an account and one without, and the event
            // must not carry a distinction the response itself does not.
            track(EVENTS.magicLinkRequested);
            setSent(true);
        } catch (err) {
            if (isApiError(err) && err.status === 503) {
                setErrorMessage(t('auth.magicLink.emailUnavailable'));
            } else if (isApiError(err) && err.status === 400) {
                setErrorMessage(t('auth.magicLink.consentsRequired'));
            } else {
                setErrorMessage(messageFor(err));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (sent) {
        return (
            <div className="space-y-4">
                <p
                    ref={sentMessageRef}
                    tabIndex={-1}
                    role="status"
                    className="text-sm text-gray-700 focus:outline-none"
                >
                    {t('auth.magicLink.sent')}
                </p>
                <button
                    onClick={onSwitchToPassword}
                    className="w-full text-sm text-gray-600 hover:text-gray-900"
                >
                    {t('auth.magicLink.switchToPassword')}
                </button>
            </div>
        );
    }

    const heading = t(`auth.magicLink.intent.${intent}.heading`)
    const explanation = t(`auth.magicLink.intent.${intent}.explanation`)
    const submitLabel = t(`auth.magicLink.intent.${intent}.submit`)

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
                <p className="mt-1 text-sm text-gray-600">{explanation}</p>
            </div>

            <Input
                type="email"
                label={t('auth.magicLink.emailLabel')}
                placeholder={t('auth.magicLink.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                error={errors.email}
                required
            />

            <ConsentSection consents={consents} setConsents={setConsents} />

            {errorMessage && (
                <p className="text-sm text-red-600" role="alert">
                    {errorMessage}
                </p>
            )}

            <div className="space-y-3">
                <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit || isSubmitting}
                    isLoading={isSubmitting}
                    variant="primary"
                    className="w-full"
                    aria-label={submitLabel}
                >
                    {isSubmitting ? t('auth.magicLink.submitting') : submitLabel}
                </Button>

                <button
                    onClick={onSwitchToPassword}
                    className="w-full text-sm text-gray-600 hover:text-gray-900"
                >
                    {t('auth.magicLink.switchToPassword')}
                </button>
            </div>
        </div>
    );
}
