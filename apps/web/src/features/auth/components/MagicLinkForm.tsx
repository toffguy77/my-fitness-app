/**
 * Форма запроса одноразовой ссылки для входа.
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
 * это различие.
 */

'use client';

import { useState } from 'react';
import { Button, Input } from '@/shared/components/ui';
import { ConsentSection } from './ConsentSection';
import { useFormValidation } from '@/features/auth/hooks/useFormValidation';
import { magicLinkApi } from '@/features/auth/api/magicLink';
import { isApiError, messageFor } from '@/shared/errors/apiErrors';
import type { ConsentState } from '@/features/auth/types';
import { t } from '@/shared/i18n';

export interface MagicLinkFormProps {
    /** Раскрывает форму пароля — второй способ входа, на том же экране. */
    onSwitchToPassword: () => void;
}

export function MagicLinkForm({ onSwitchToPassword }: MagicLinkFormProps) {
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
                <p className="text-sm text-gray-700">{t('auth.magicLink.sent')}</p>
                <button
                    onClick={onSwitchToPassword}
                    className="w-full text-sm text-gray-600 hover:text-gray-900"
                >
                    {t('auth.magicLink.switchToPassword')}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
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
                    aria-label={t('auth.magicLink.submit')}
                >
                    {isSubmitting ? t('auth.magicLink.submitting') : t('auth.magicLink.submit')}
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
