'use client'

/**
 * Consents before an account is created through an external provider.
 *
 * The callback used to create the account straight away, without the consents
 * the registration form will not do without — among them consent to process
 * health data. Now a sign-in that would create an account is parked, the
 * browser comes here, and the account is created only when these are sent.
 * The same screen meets an existing provider account that never gave them.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { providersApi, providerLabel, needsLinkConfirmation } from '@/features/auth/api/providers'
import { storeSession, destinationFor } from '@/features/auth/utils/session'
import { isApiError, messageForOr, serverMessageFrom } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'
import type { ConsentState } from '@/features/auth/types'
import { AuthPanel, AuthShell } from './AuthShell'
import { ConsentSection } from './ConsentSection'

/** Codes that mean the parked sign-in is gone and has to be started again. */
const EXPIRED_CODES = new Set(['token_invalid', 'token_expired', 'gone'])

function codeOf(error: unknown): string | undefined {
    return isApiError(error) ? (error.data as { code?: string } | undefined)?.code : undefined
}

export function OAuthConsentsScreen() {
    const router = useRouter()
    const params = useSearchParams()
    const provider = params.get('provider') ?? ''

    // Nothing is ticked in advance: a consent that arrives pre-ticked is not
    // one the person gave.
    const [consents, setConsents] = useState<ConsentState>({
        terms_of_service: false,
        privacy_policy: false,
        data_processing: false,
        marketing: false,
    })
    const [error, setError] = useState<string | undefined>(undefined)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const mandatoryGiven = consents.terms_of_service && consents.privacy_policy && consents.data_processing

    function handleConsentsChange(next: ConsentState) {
        setConsents(next)
        setError(undefined)
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        if (isSubmitting) return
        if (!mandatoryGiven) {
            setError(t('auth.oauth.consentsRequired'))
            return
        }

        setIsSubmitting(true)
        try {
            const result = await providersApi.completeWithConsents(consents)

            // The address became an existing account's while this screen was
            // open: it has to be claimed with its password, as on /auth/email.
            if (needsLinkConfirmation(result)) {
                router.replace(
                    `/auth/link?provider=${encodeURIComponent(provider)}&email=${encodeURIComponent(result.email)}`
                )
                return
            }

            storeSession(result)
            router.replace(destinationFor(result.user))
        } catch (err) {
            const code = codeOf(err)
            if (code === 'validation') {
                // The server holds the same rule as this form: the only input
                // here is the consents, so its refusal is about them. An
                // expired attempt is coded token_invalid, not validation.
                setError(t('auth.oauth.consentsRequired'))
            } else if ((code && EXPIRED_CODES.has(code)) || (isApiError(err) && err.status === 401)) {
                toast.error(t('auth.oauth.expired'))
                router.replace('/auth')
            } else if (code === 'conflict') {
                // The attempt is over — the server has dropped it — and the
                // address now has an account: signing in again is the way on.
                toast.error(serverMessageFrom(err) ?? t('auth.oauth.completeFailed'))
                router.replace('/auth')
            } else {
                toast.error(messageForOr(err, t('auth.oauth.completeFailed')))
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <AuthShell
            title={t('auth.oauth.consentsTitle')}
            description={t('auth.oauth.consentsHint', { provider: providerLabel(provider) })}
        >
            <AuthPanel>
                <form onSubmit={handleSubmit} noValidate>
                    <ConsentSection consents={consents} setConsents={handleConsentsChange} error={error} />

                    <Button
                        type="submit"
                        disabled={!mandatoryGiven || isSubmitting}
                        isLoading={isSubmitting}
                        size="lg"
                        block
                        className="mt-6"
                    >
                        {isSubmitting ? t('auth.oauth.continuing') : t('auth.oauth.continueAction')}
                    </Button>
                </form>
            </AuthPanel>
        </AuthShell>
    )
}
