/**
 * Consent section component for registration
 * Renders 4 consent checkboxes with hyperlinks to legal documents
 *
 * Validates: Requirements AC-2.3, AC-2.4, AC-2.6, AC-4.1, AC-4.2
 */

'use client';

import Link from 'next/link';
import { Checkbox } from '@/shared/components/ui';
import type { ConsentState } from '@/features/auth/types';

export interface ConsentSectionProps {
    consents: ConsentState;
    setConsents: (consents: ConsentState) => void;
    error?: string;
}

export function ConsentSection({ consents, setConsents, error }: ConsentSectionProps) {
    const handleConsentChange = (key: keyof ConsentState, value: boolean) => {
        setConsents({ ...consents, [key]: value });
    };

    return (
        <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-gray-700">
                Для регистрации необходимо принять соглашения:
            </p>

            <Checkbox
                checked={consents.terms_of_service}
                onChange={(e) => handleConsentChange('terms_of_service', e.target.checked)}
                error={Boolean(error && !consents.terms_of_service)}
                label={
                    <span>
                        Я принимаю{' '}
                        <Link
                            href="/legal/terms"
                            className="text-blue-600 hover:underline"
                            target="_blank"
                        >
                            Договор публичной оферты
                        </Link>
                        {' *'}
                    </span>
                }
            />

            <Checkbox
                checked={consents.privacy_policy}
                onChange={(e) => handleConsentChange('privacy_policy', e.target.checked)}
                error={Boolean(error && !consents.privacy_policy)}
                label={
                    <span>
                        Я принимаю{' '}
                        <Link
                            href="/legal/privacy"
                            className="text-blue-600 hover:underline"
                            target="_blank"
                        >
                            Политику конфиденциальности
                        </Link>
                        {' *'}
                    </span>
                }
            />

            <Checkbox
                checked={consents.data_processing}
                onChange={(e) => handleConsentChange('data_processing', e.target.checked)}
                error={Boolean(error && !consents.data_processing)}
                label={
                    <span>
                        Я даю согласие на обработку персональных данных *
                    </span>
                }
            />

            <Checkbox
                checked={consents.marketing}
                onChange={(e) => handleConsentChange('marketing', e.target.checked)}
                label={
                    <span>
                        Я согласен получать маркетинговые материалы (необязательно)
                    </span>
                }
            />

            {error && (
                <p className="text-sm text-red-600" role="alert">
                    {error}
                </p>
            )}

            <p className="text-xs text-gray-500">
                * Обязательные поля
            </p>
        </div>
    );
}
