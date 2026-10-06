'use client'

/**
 * Claiming an existing account after an external sign-in.
 *
 * The provider says this address is theirs. We do not take that as proof: an
 * address we never verified would otherwise be enough to walk into somebody's
 * account. The password is the proof.
 */

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { providersApi, providerLabel } from '@/features/auth/api/providers'
import { storeSession, destinationFor } from '@/features/auth/utils/session'
import { isApiError } from '@/shared/errors/apiErrors'
import { t } from '@/shared/i18n'

export function OAuthLinkScreen() {
    const router = useRouter()
    const params = useSearchParams()
    const provider = params.get('provider') ?? ''
    const email = params.get('email') ?? ''

    const [password, setPassword] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault()
        if (!password || isSubmitting) return

        setIsSubmitting(true)
        try {
            const response = await providersApi.confirmLink(password)
            storeSession(response)
            toast.success(t('auth.oauth.linked', { provider: providerLabel(provider) }))
            router.replace(destinationFor(response.user))
        } catch (error) {
            if (isApiError(error) && error.status === 401) {
                toast.error(t('auth.oauth.wrongPassword'))
            } else if (isApiError(error) && error.status === 409) {
                toast.error(t('auth.oauth.noPassword'))
            } else if (isApiError(error) && error.status === 400) {
                toast.error(t('auth.oauth.expired'))
                router.replace('/auth')
            } else {
                toast.error(t('auth.oauth.linkFailed'))
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <main className="flex min-h-screen flex-col justify-center bg-canvas px-6">
            <div className="mx-auto w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm">
                <h1 className="text-lg font-semibold text-fg">{t('auth.oauth.linkTitle')}</h1>
                <p className="mt-2 text-sm text-fg-muted">
                    {email ? (
                        <>
                            {t('auth.oauth.linkHintOnAddress')}{' '}
                            <span className="font-medium text-fg">{email}</span>{' '}
                            {t('auth.oauth.linkHintKnownEmail', { provider: providerLabel(provider) })}
                        </>
                    ) : (
                        <>{t('auth.oauth.linkHintUnknownEmail', { provider: providerLabel(provider) })}</>
                    )}
                </p>

                <form onSubmit={handleSubmit} className="mt-6">
                    <label htmlFor="link-password" className="block text-sm font-medium text-fg">
                        {t('auth.password')}
                    </label>
                    <input
                        id="link-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        className="mt-1 w-full rounded-lg border border-line px-4 py-3 text-sm text-fg outline-none focus:ring-2 focus:ring-focus"
                    />

                    <button
                        type="submit"
                        disabled={!password || isSubmitting}
                        className="mt-4 w-full rounded-lg bg-primary py-3 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                    >
                        {isSubmitting ? t('auth.oauth.linking') : t('auth.oauth.linkAction')}
                    </button>
                </form>

                <button
                    onClick={() => router.replace('/auth')}
                    className="mt-4 w-full text-sm text-fg-muted hover:text-fg"
                >
                    {t('auth.oauth.signInNormally')}
                </button>

                <p className="mt-4 text-center text-sm text-fg-muted">
                    {t('auth.oauth.forgotPassword')}{' '}
                    <a href="/forgot-password" className="text-primary hover:underline">
                        {t('auth.oauth.recover')}
                    </a>
                </p>
            </div>
        </main>
    )
}
