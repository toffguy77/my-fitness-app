'use client'

/**
 * Sign-in through an external provider.
 *
 * The list comes from the server: a deployment without credentials for a
 * provider must not show a button that cannot work.
 */

import { useEffect, useState } from 'react'
import { providersApi, providerLabel } from '@/features/auth/api/providers'
import { t } from '@/shared/i18n'

export function ProviderButtons({ mode }: { mode: 'login' | 'register' }) {
    const [providers, setProviders] = useState<string[]>([])

    useEffect(() => {
        providersApi.list().then(setProviders).catch(() => setProviders([]))
    }, [])

    if (providers.length === 0) return null

    return (
        <div className="mt-6">
            <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-subtle" />
                <span className="text-xs text-fg-muted">
                    {mode === 'register' ? t('auth.orRegisterWith') : t('auth.orSignInWith')}
                </span>
                <span className="h-px flex-1 bg-subtle" />
            </div>

            <div className="mt-4 space-y-2">
                {providers.map((provider) => (
                    <a
                        key={provider}
                        // A full navigation, not fetch: the flow continues at
                        // the provider's own site.
                        href={providersApi.startUrl(provider)}
                        data-testid={`oauth-${provider}`}
                        className="flex w-full items-center justify-center rounded-lg border border-line bg-surface py-3 text-sm font-medium text-fg transition-colors hover:bg-canvas"
                    >
                        {providerLabel(provider)}
                    </a>
                ))}
            </div>
        </div>
    )
}
