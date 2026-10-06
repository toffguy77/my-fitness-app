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
        <footer className="mt-10 text-center">
            <p className="text-sm text-fg-muted">
                {t('auth.needHelp')}{' '}
                <a
                    href={`mailto:${supportEmail}`}
                    className="font-semibold text-primary hover:underline"
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
