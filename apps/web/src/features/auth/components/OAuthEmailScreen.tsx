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
        <main className="flex min-h-screen flex-col justify-center bg-canvas px-6">
            <div className="mx-auto w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm">
                <h1 className="text-lg font-semibold text-fg">{t('auth.oauth.emailTitle')}</h1>
                <p className="mt-2 text-sm text-fg-muted">
                    {t('auth.oauth.emailHint', { provider: providerLabel(provider) })}
                </p>

                <form onSubmit={handleSubmit} className="mt-6">
                    <label htmlFor="oauth-email" className="block text-sm font-medium text-fg">
                        Email
                    </label>
                    <input
                        id="oauth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        autoComplete="email"
                        className="mt-1 w-full rounded-lg border border-line px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-focus"
                    />

                    <button
                        type="submit"
                        disabled={!email || isSubmitting}
                        className="mt-4 w-full rounded-lg bg-primary py-3 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                    >
                        {isSubmitting ? t('auth.oauth.continuing') : t('auth.oauth.continueAction')}
                    </button>
                </form>
            </div>
        </main>
    )
}
