'use client'

/**
 * Asking for the address a provider did not give us.
 *
 * Some providers return no address at all, or only with scopes we do not ask
 * for. Inventing one would produce accounts nobody can recover, so we ask —
 * and, since nobody has proved the address is theirs, the account it creates
 * starts unverified.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { providersApi, providerLabel, needsLinkConfirmation } from '@/features/auth/api/providers'
import { storeSession, destinationFor } from '@/features/auth/utils/session'
import { isApiError } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'
import { AuthPanel, AuthShell, FIELD } from './AuthShell'

export function OAuthEmailScreen() {
    const router = useRouter()
    const params = useSearchParams()
    const provider = params.get('provider') ?? ''

    const [email, setEmail] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        if (!email || isSubmitting) return

        setIsSubmitting(true)
        try {
            const result = await providersApi.completeWithEmail(email.trim())

            // The address turned out to belong to an existing account, so it
            // has to be claimed with its password rather than simply taken.
            if (needsLinkConfirmation(result)) {
                router.replace(
                    `/auth/link?provider=${encodeURIComponent(provider)}&email=${encodeURIComponent(result.email)}`
                )
                return
            }

            storeSession(result)
            router.replace(destinationFor(result.user))
        } catch (error) {
            if (isApiError(error) && error.status === 400) {
                toast.error(t('auth.oauth.expired'))
                router.replace('/auth')
            } else {
                toast.error(t('auth.oauth.completeFailed'))
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <AuthShell
            title={t('auth.oauth.emailTitle')}
            description={t('auth.oauth.emailHint', { provider: providerLabel(provider) })}
        >
            <AuthPanel>
                <form onSubmit={handleSubmit}>
                    <label htmlFor="oauth-email" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        Email
                    </label>
                    <input
                        id="oauth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        autoComplete="email"
                        className={FIELD}
                    />

                    <Button
                        type="submit"
                        disabled={!email || isSubmitting}
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
