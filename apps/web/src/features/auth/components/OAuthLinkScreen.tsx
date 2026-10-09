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
import { Button } from '@/shared/components/ui/Button'
import { AuthPanel, AuthShell, FIELD } from './AuthShell'

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
        <AuthShell
            title={t('auth.oauth.linkTitle')}
            description={
                email ? (
                    <>
                        {t('auth.oauth.linkHintOnAddress')}{' '}
                        <span className="font-semibold text-fg">{email}</span>{' '}
                        {t('auth.oauth.linkHintKnownEmail', { provider: providerLabel(provider) })}
                    </>
                ) : (
                    <>{t('auth.oauth.linkHintUnknownEmail', { provider: providerLabel(provider) })}</>
                )
            }
        >
            <AuthPanel>
                <form onSubmit={handleSubmit}>
                    <label htmlFor="link-password" className="mb-1.5 block text-sm font-medium text-fg-muted">
                        {t('auth.password')}
                    </label>
                    <input
                        id="link-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        className={FIELD}
                    />

                    <Button
                        type="submit"
                        disabled={!password || isSubmitting}
                        isLoading={isSubmitting}
                        size="lg"
                        block
                        className="mt-6"
                    >
                        {isSubmitting ? t('auth.oauth.linking') : t('auth.oauth.linkAction')}
                    </Button>
                </form>

                <Button
                    variant="ghost"
                    size="lg"
                    block
                    onClick={() => router.replace('/auth')}
                    className="mt-2 text-fg-muted"
                >
                    {t('auth.oauth.signInNormally')}
                </Button>

                <p className="mt-4 text-center text-sm text-fg-muted">
                    {t('auth.oauth.forgotPassword')}{' '}
                    <a href="/forgot-password" className="font-semibold text-primary hover:underline">
                        {t('auth.oauth.recover')}
                    </a>
                </p>
            </AuthPanel>
        </AuthShell>
    )
}
