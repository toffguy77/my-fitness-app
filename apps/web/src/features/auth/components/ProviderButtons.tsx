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
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-500">
                    {mode === 'register' ? t('auth.orRegisterWith') : t('auth.orSignInWith')}
                </span>
                <span className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="mt-4 space-y-2">
                {providers.map((provider) => (
                    <a
                        key={provider}
                        // A full navigation, not fetch: the flow continues at
                        // the provider's own site.
                        href={providersApi.startUrl(provider)}
                        data-testid={`oauth-${provider}`}
                        className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
                    >
                        {providerLabel(provider)}
                    </a>
                ))}
            </div>
        </div>
    )
}
