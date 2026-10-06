'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
    providersApi,
    providerLabel,
    type LinkedProvider,
} from '@/features/auth/api/providers'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { SettingsPageLayout } from './SettingsPageLayout'
import { t } from '@/shared/i18n'
import { Button, buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { SettingsCard, SettingsRow, SettingsSection } from './SettingsSection'

/**
 * External sign-in services attached to this account.
 *
 * Unlinking the last way in is refused rather than merely warned about: an
 * account with no password and one provider would lose a year of data to a
 * single click.
 */
export function SettingsProviders() {
    const [linked, setLinked] = useState<LinkedProvider[]>([])
    const [available, setAvailable] = useState<string[]>([])
    const [hasPassword, setHasPassword] = useState(true)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)

    const refresh = async () => {
        const [state, providers] = await Promise.all([
            providersApi.linked(),
            providersApi.list(),
        ])
        setLinked(state.linked)
        setHasPassword(state.has_password)
        setAvailable(providers)
    }

    useEffect(() => {
        async function loadInitial() {
            try {
                await refresh()
            } catch (err) {
                toast.error(messageForOr(err, t('settings.providers.loadFailed')))
            } finally {
                setLoading(false)
            }
        }
        loadInitial()
    }, [])

    const isOnlyWayIn = (provider: string) =>
        !hasPassword && linked.length === 1 && linked[0].provider === provider

    const handleUnlink = async (provider: string) => {
        setBusy(provider)
        try {
            await providersApi.unlink(provider)
            setLinked((current) => current.filter((item) => item.provider !== provider))
            toast.success(t('settings.providers.unlinked', { provider: providerLabel(provider) }))
        } catch (error) {
            if (isApiError(error) && error.status === 409) {
                toast.error(t('settings.providers.onlyWayIn'))
            } else {
                toast.error(t('settings.providers.unlinkFailed'))
            }
        } finally {
            setBusy(null)
        }
    }

    if (loading) {
        return <p className="py-8 text-center text-sm text-fg-muted">{t('settings.loading')}</p>
    }

    const unlinked = available.filter(
        (provider) => !linked.some((item) => item.provider === provider)
    )

    return (
        <SettingsSection
            title={t('settings.providers.heading')}
            titleId="settings-providers-heading"
            description={t('settings.providers.explanation')}
        >
            {linked.length === 0 && unlinked.length === 0 && (
                <p className="text-sm text-fg-muted">
                    {t('settings.providers.unavailable')}
                </p>
            )}

            {(linked.length > 0 || unlinked.length > 0) && (
                <SettingsCard>
                    <ul className="divide-y divide-line">
                        {linked.map((item) => (
                            <li key={item.provider}>
                                <SettingsRow>
                                    <div className="min-w-0">
                                        <p className="type-headline text-fg">
                                            {providerLabel(item.provider)}
                                        </p>
                                        {item.email && <p className="truncate type-caption text-fg-muted">{item.email}</p>}
                                        {isOnlyWayIn(item.provider) && (
                                            <p className="mt-1 type-caption text-fg-muted">
                                                {t('settings.providers.onlyWayInBefore')}{' '}
                                                <a href="/forgot-password" className="font-semibold text-primary hover:underline">
                                                    {t('settings.providers.setPassword')}
                                                </a>
                                                {t('settings.providers.onlyWayInAfter')}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => handleUnlink(item.provider)}
                                        disabled={busy === item.provider || isOnlyWayIn(item.provider)}
                                        className="-mr-2 text-danger-fg hover:bg-danger-soft"
                                    >
                                        {t('settings.providers.unlink')}
                                    </Button>
                                </SettingsRow>
                            </li>
                        ))}

                        {unlinked.map((provider) => (
                            <li key={provider}>
                                <SettingsRow>
                                    <p className="type-headline text-fg">{providerLabel(provider)}</p>
                                    <a
                                        href={providersApi.startUrl(provider)}
                                        className={cn(buttonBase, buttonVariants.secondary, buttonSizes.md)}
                                    >
                                        {t('settings.providers.link')}
                                    </a>
                                </SettingsRow>
                            </li>
                        ))}
                    </ul>
                </SettingsCard>
            )}
        </SettingsSection>
    )
}

export function SettingsProvidersPage() {
    return (
        <SettingsPageLayout title={t('settings.titles.providers')}>
            {() => <SettingsProviders />}
        </SettingsPageLayout>
    )
}
