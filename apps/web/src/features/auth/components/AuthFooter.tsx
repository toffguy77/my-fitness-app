/**
 * Authentication footer component
 * Renders support contact link
 *
 * Validates: Requirements AC-6.1, AC-6.2, AC-6.3
 */

'use client';

import { SupportLink } from '@/shared/components/SupportLink';
import { t } from '@/shared/i18n'

export function AuthFooter() {
    const supportEmail = 'support@burcev.team';

    return (
        <footer className="mt-8 border-t border-gray-200 pt-6 text-center">
            <p className="text-sm text-gray-600">
                {t('auth.needHelp')}{' '}
                <a
                    href={`mailto:${supportEmail}`}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                    {t('auth.contactUs')}
                </a>
            </p>
            {/* Faster than email, and available before there is an account. */}
            <p className="mt-2">
                <SupportLink />
            </p>
        </footer>
    );
}
